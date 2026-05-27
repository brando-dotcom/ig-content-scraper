import { ApifyClient } from 'apify-client';

export async function scrapeAccount(client, actorId, handle, reelsPerAccount) {
  // apify/instagram-scraper: pull more posts than needed since we filter to reels after
  const input = {
    username: [handle],
    resultsType: 'posts',
    resultsLimit: reelsPerAccount * 2,
    addParentData: false,
  };

  const run = await client.actor(actorId).call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  const reels = items
    .filter((item) => {
      // Reels appear as Video posts or productType "clips"
      if (item.productType === 'clips') return true;
      if (item.type === 'Video') return true;
      return false;
    })
    .slice(0, reelsPerAccount)
    .map((item) => {
      const caption = item.caption || '';
      const hook = caption.split('\n')[0]?.slice(0, 100) || caption.slice(0, 100);
      return {
        post_url: item.url || (item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}/` : ''),
        hook,
        caption_full: caption,
        views: Number(item.videoPlayCount || item.videoViewCount || item.playCount || 0),
        likes: Number(item.likesCount || 0),
        comments: Number(item.commentsCount || 0),
        posted_date: item.timestamp || null,
        account_handle: handle,
      };
    })
    .filter((r) => r.views > 0);

  return reels;
}

export async function scrapeAll(apifyToken, actorId, accounts, reelsPerAccount) {
  const client = new ApifyClient({ token: apifyToken });
  const results = [];
  const errors = [];

  for (const handle of accounts) {
    try {
      console.log(`  scraping @${handle}...`);
      const reels = await scrapeAccount(client, actorId, handle, reelsPerAccount);
      console.log(`    pulled ${reels.length} reels`);
      results.push(...reels);
    } catch (err) {
      console.error(`    failed @${handle}: ${err.message}`);
      errors.push({ handle, error: err.message });
    }
  }

  return { reels: results, errors };
}
