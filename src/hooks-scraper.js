import { ApifyClient } from 'apify-client';

export async function scrapeHooksAccount(client, actorId, handle, perAccount, maxDurationSeconds = 15) {
  const input = {
    directUrls: [`https://www.instagram.com/${handle}/`],
    resultsType: 'posts',
    resultsLimit: perAccount * 4, // wider net since we filter by duration
    addParentData: false,
  };

  const run = await client.actor(actorId).call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  return items
    .filter((item) => item.productType === 'clips' || item.type === 'Video')
    .map((item) => ({
      source_account: handle,
      source_url: item.url || (item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}/` : null),
      thumbnail_url: item.displayUrl || item.previewImageUrl || null,
      video_url: item.videoUrl || null,
      caption: (item.caption || '').slice(0, 800),
      views: Number(item.videoPlayCount || item.videoViewCount || item.playCount || 0),
      likes: Number(item.likesCount || 0),
      comments: Number(item.commentsCount || 0),
      posted_date: item.timestamp || null,
    }))
    .filter((h) => h.views > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, perAccount);
}

export async function scrapeHooksAll(apifyToken, actorId, accounts, perAccount, maxDurationSeconds = 15) {
  const client = new ApifyClient({ token: apifyToken });
  const results = [];
  const errors = [];

  for (const handle of accounts) {
    try {
      console.log(`  scraping hooks @${handle} (max ${maxDurationSeconds}s)...`);
      const hooks = await scrapeHooksAccount(client, actorId, handle, perAccount, maxDurationSeconds);
      console.log(`    pulled ${hooks.length} hooks (short-form only)`);
      results.push(...hooks);
    } catch (err) {
      console.error(`    failed @${handle}: ${err.message}`);
      errors.push({ handle, error: err.message });
    }
  }

  return { hooks: results, errors };
}

export async function pushHooks(baseUrl, token, hooks) {
  const url = baseUrl.replace(/\/$/, '') + '/api/hooks';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ hooks }),
  });
  if (!res.ok) throw new Error(`hooks push ${res.status}: ${await res.text()}`);
  return res.json();
}
