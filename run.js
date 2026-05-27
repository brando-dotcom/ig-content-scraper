import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeAll } from './src/scraper.js';
import { scoreReels } from './src/scorer.js';
import { remixAll } from './src/remixer.js';
import { pushToDashboard } from './src/dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { dryRun: false, accounts: null, top: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--accounts') args.accounts = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--top') args.top = Number(argv[++i]);
  }
  return args;
}

function requireEnv(name, { allowMissing = false } = {}) {
  const v = process.env[name];
  if (!v && !allowMissing) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const args = parseArgs(process.argv);
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

  const apifyToken = requireEnv('APIFY_API_TOKEN');
  const anthropicKey = requireEnv('ANTHROPIC_API_KEY');
  const dashboardUrl = requireEnv('DASHBOARD_URL', { allowMissing: args.dryRun });
  const ingestToken = requireEnv('INGEST_TOKEN', { allowMissing: args.dryRun });

  const accounts = args.accounts || config.accounts;
  const topN = args.top || config.top_n;

  console.log(`\n[1/4] Scraping ${accounts.length} accounts (${config.reels_per_account} reels each)`);
  const { reels, errors: scrapeErrors } = await scrapeAll(
    apifyToken,
    config.apify_actor_id,
    accounts,
    config.reels_per_account,
  );
  console.log(`  -> ${reels.length} reels pulled, ${scrapeErrors.length} account errors`);

  console.log(`\n[2/4] Scoring & filtering (threshold ${config.outlier_threshold}x avg)`);
  const ranked = scoreReels(reels, config.outlier_threshold);
  const top = ranked.slice(0, topN);
  console.log(`  -> ${ranked.length} outliers, taking top ${top.length}`);

  console.log(`\n[3/4] Remixing through Brando's voice (model ${config.claude_model})`);
  const { ideas, errors: remixErrors } = await remixAll(anthropicKey, config.claude_model, top);
  console.log(`  -> ${ideas.length} ideas generated, ${remixErrors.length} errors`);

  const runDate = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const logPath = path.join(__dirname, 'logs', `run_${runDate}.json`);
  fs.writeFileSync(logPath, JSON.stringify({ args, config, scrapeErrors, remixErrors, ideas }, null, 2));
  console.log(`  raw output saved to ${logPath}`);

  if (args.dryRun) {
    console.log('\n[4/4] Dry run — skipping dashboard push');
  } else {
    console.log(`\n[4/4] Pushing ${ideas.length} ideas to ${dashboardUrl}`);
    const result = await pushToDashboard(dashboardUrl, ingestToken, ideas);
    console.log(`  -> ${result.inserted} inserted, ${result.errors?.length || 0} errors`);
  }

  console.log(`\nSummary:`);
  console.log(`  accounts requested:  ${accounts.length}`);
  console.log(`  accounts failed:     ${scrapeErrors.length}`);
  console.log(`  reels pulled:        ${reels.length}`);
  console.log(`  outliers found:      ${ranked.length}`);
  console.log(`  ideas generated:     ${ideas.length}`);
  console.log(`  log:                 ${logPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
