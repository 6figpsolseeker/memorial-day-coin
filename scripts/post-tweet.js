/* Posts a donation-update tweet from @MEMDAYCTO when totals actually rose.
 *
 *   - Reads current donations.json (committed HEAD) and previous (HEAD~1)
 *   - Skips if SOL didn't increase, scrape failed, or required creds are missing
 *   - DRY_RUN=1 → prints the tweet instead of sending (used while creds are being set up)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DONATIONS_PATH = path.join(__dirname, '..', 'donations.json');
const SITE_URL = 'memorial-day-coin.vercel.app';

function loadCurrent() {
  return JSON.parse(fs.readFileSync(DONATIONS_PATH, 'utf8'));
}

function loadPrevious() {
  try {
    const out = execSync('git show HEAD~1:donations.json', { encoding: 'utf8' });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

const sumSol = d => (d.charities || []).reduce((s, c) => s + (Number(c.donated_sol) || 0), 0);
const sumUsd = d => (d.charities || []).reduce((s, c) => s + (Number(c.donated_usd) || 0), 0);

function buildTweet(curr, prev) {
  const each = curr.charities[0];
  const eachPrev = prev.charities[0];
  return [
    '🇺🇸 Updated $MEMDAY donation totals:',
    '',
    `Each charity: ${each.donated_sol.toFixed(4)} SOL (~$${each.donated_usd.toFixed(2)}) — up from ${eachPrev.donated_sol.toFixed(4)} SOL ($${eachPrev.donated_usd.toFixed(2)})`,
    `Total: $${sumUsd(curr).toFixed(2)} USD (${sumSol(curr).toFixed(4)} SOL) — up from $${sumUsd(prev).toFixed(2)}`,
    '',
    SITE_URL,
  ].join('\n');
}

async function main() {
  const curr = loadCurrent();
  if (curr.scrape_status !== 'ok') {
    console.log('skip: current scrape_status is', curr.scrape_status);
    return;
  }
  const prev = loadPrevious();
  if (!prev || !Array.isArray(prev.charities) || !prev.charities.length) {
    console.log('skip: no usable previous snapshot');
    return;
  }
  if (sumSol(curr) <= sumSol(prev) + 1e-6) {
    console.log(`skip: SOL did not increase (${sumSol(prev).toFixed(6)} -> ${sumSol(curr).toFixed(6)})`);
    return;
  }

  const text = buildTweet(curr, prev);
  console.log('--- TWEET ---\n' + text + '\n-------------');

  if (process.env.DRY_RUN === '1') {
    console.log('DRY_RUN=1 — not posting.');
    return;
  }
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) {
    console.log('skip: X_* credentials missing in environment.');
    return;
  }

  const { TwitterApi } = require('twitter-api-v2');
  const client = new TwitterApi({
    appKey: X_API_KEY,
    appSecret: X_API_SECRET,
    accessToken: X_ACCESS_TOKEN,
    accessSecret: X_ACCESS_SECRET,
  });
  const res = await client.v2.tweet(text);
  console.log('Posted tweet id:', res.data && res.data.id);
}

main().catch(e => {
  console.error('post-tweet failed:', e && e.message ? e.message : e);
  process.exit(1);
});
