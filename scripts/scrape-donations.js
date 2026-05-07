/* Scrapes per-charity donation amounts from $MEMDAY's pump.fun page and writes donations.json. */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const COIN_URL = 'https://pump.fun/coin/2MZbnTD4MdLjzwBmyRB4pdiTZK5SuHkj2TBW4Vy7SYUK';
const OUT_PATH = path.join(__dirname, '..', 'donations.json');

(async () => {
  const existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  let pageText = '';
  try {
    await page.goto(COIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);
    try {
      await page.waitForSelector('text=/Donated\\s+[\\d.]+\\s+SOL/i', { timeout: 30000 });
    } catch {}
    pageText = await page.evaluate(() => document.body.innerText);
  } catch (e) {
    console.error('Page load failed:', e.message);
  } finally {
    await browser.close();
  }

  if (!pageText) {
    existing.scrape_status = 'page_load_failed';
    existing.last_updated = new Date().toISOString();
    fs.writeFileSync(OUT_PATH, JSON.stringify(existing, null, 2) + '\n');
    process.exit(1);
  }

  const updated = { ...existing };
  let matchedAny = false;
  updated.charities = existing.charities.map(c => {
    const idx = pageText.toLowerCase().indexOf(c.match.toLowerCase());
    if (idx === -1) return c;
    const window = pageText.slice(idx, idx + 600);
    const m = window.match(/Donated\s+([\d.]+)\s*SOL\s*\(\s*\$?([\d,.]+)\s*\)/i);
    if (!m) return c;
    matchedAny = true;
    return {
      ...c,
      donated_sol: Number(m[1]),
      donated_usd: Number(m[2].replace(/,/g, '')),
    };
  });

  updated.last_updated = new Date().toISOString();
  updated.scrape_status = matchedAny ? 'ok' : 'no_matches_found';

  fs.writeFileSync(OUT_PATH, JSON.stringify(updated, null, 2) + '\n');
  console.log('Wrote donations.json. Status:', updated.scrape_status);
  for (const c of updated.charities) {
    console.log(`  ${c.key}: ${c.donated_sol} SOL ($${c.donated_usd})`);
  }
})();
