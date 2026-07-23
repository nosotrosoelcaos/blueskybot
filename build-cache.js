import { AtpAgent } from '@atproto/api';
import { extract } from '@extractus/feed-extractor';
import crypto from 'crypto';
import { readFile, writeFile } from 'fs/promises';

const BLUESKY_URL = process.env.BLUESKY_URL || 'https://bsky.social';
const BLUESKY_USERNAME = process.env.BLUESKY_USERNAME;
const BLUESKY_PASSWORD = process.env.BLUESKY_PASSWORD;
const RSS_FEED = process.env.RSS_FEED || 'https://www.reddit.com/r/nosotrosoelcaos/.rss';
const CACHE_FILE = process.env.CACHE_FILE || 'cache.json';

if (!BLUESKY_USERNAME || !BLUESKY_PASSWORD) {
  console.error('Set BLUESKY_USERNAME and BLUESKY_PASSWORD env vars');
  process.exit(1);
}

function sha256(data) {
  return crypto.createHash('sha256').update(data, 'utf-8').digest('hex');
}

async function fetchBlueskyPosts(agent) {
  const posts = [];
  let cursor = undefined;
  do {
    const res = await agent.getAuthorFeed({
      actor: BLUESKY_USERNAME,
      limit: 100,
      ...(cursor && { cursor })
    });
    for (const item of res.data.feed) {
      posts.push(item.post.record.text);
    }
    cursor = res.data.cursor;
  } while (cursor);
  return posts;
}

async function fetchFeed() {
  const rss = await extract(RSS_FEED, {
    xmlParserOptions: { processEntities: { enabled: false } }
  });
  return rss.entries;
}

async function main() {
  console.log('Fetching Bluesky posts...');
  const agent = new AtpAgent({ service: BLUESKY_URL });
  await agent.login({ identifier: BLUESKY_USERNAME, password: BLUESKY_PASSWORD });
  const bskyPosts = await fetchBlueskyPosts(agent);
  console.log(`Found ${bskyPosts.length} Bluesky posts`);

  console.log('Fetching RSS feed...');
  const entries = await fetchFeed();
  console.log(`Found ${entries.length} feed entries`);

  const bskySetTexts = new Set(bskyPosts.map(t => t.trim()));

  let existingCache = [];
  try {
    existingCache = JSON.parse(await readFile(CACHE_FILE, 'utf-8'));
  } catch {}

  let added = 0;
  for (const entry of entries) {
    const title = (entry.title || '').trim();
    if (bskySetTexts.has(title)) {
      const hash = sha256(entry.link);
      if (!existingCache.includes(hash)) {
        existingCache.push(hash);
        added++;
        console.log(`Cached: ${title}`);
      }
    }
  }

  await writeFile(CACHE_FILE, JSON.stringify(existingCache));
  console.log(`Done. Added ${added} entries. Total cache: ${existingCache.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
