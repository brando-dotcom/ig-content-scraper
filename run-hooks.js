import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeHooksAll, pushHooks } from './src/hooks-scraper.js';
import { evaluateAll } from './src/hooks-evaluator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function fetchRejectedHooks(baseUrl, token) {
  try {
    const res = await fetch(baseUrl.replace(/\/$/, '') + '/api/rejected-hooks', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.examples || [];
  } catch {
    return [];
  }
}

async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  const apifyToken = requireEnv('APIFY_API_TOKEN');
  const anthropicKey = requireEnv('ANTHROPIC_API_KEY');
  const dashboardUrl = requireEnv('DASHBOARD_URL');
  const ingestToken = requireEnv('INGEST_TOKEN');

  const accounts = config.hooks_accounts || [];
  const perAccount = config.hooks_per_account || 8;
  if (!accounts.length) {
    console.error('No hooks_accounts configured');
    process.exit(1);
  }

  console.log(`\n[1/3] Scraping ${accounts.length} hook accounts (${perAccount} each)`);
  const { hooks: scraped, errors: scrapeErrors } = await scrapeHooksAll(
    apifyToken,
    config.apify_actor_id,
    accounts,
    perAccount,
  );
  console.log(`  -> ${scraped.length} hooks pulled, ${scrapeErrors.length} account errors`);

  console.log(`\n[2/3] Fetching rejected examples + evaluating fit via Claude`);
  const rejectedExamples = await fetchRejectedHooks(dashboardUrl, ingestToken);
  console.log(`  -> ${rejectedExamples.length} rejected examples loaded`);
  const { hooks: evaluated, errors: evalErrors } = await evaluateAll(
    anthropicKey,
    config.claude_model,
    scraped,
    rejectedExamples,
  );
  console.log(`  -> ${evaluated.length} evaluated, ${evalErrors.length} errors`);

  const runDate = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const logPath = path.join(__dirname, 'logs', `hooks_${runDate}.json`);
  fs.writeFileSync(logPath, JSON.stringify({ scrapeErrors, evalErrors, hooks: evaluated }, null, 2));
  console.log(`  raw output saved to ${logPath}`);

  console.log(`\n[3/3] Pushing ${evaluated.length} hooks to ${dashboardUrl}`);
  const result = await pushHooks(dashboardUrl, ingestToken, evaluated);
  console.log(`  -> ${result.inserted} inserted, ${result.skipped || 0} skipped (dupes)`);

  console.log(`\nDone.`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
