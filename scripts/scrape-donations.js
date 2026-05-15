/* Scrapes per-charity donation amounts from $MEMDAY's pump.fun page and writes donations.json.
 *
 * Defenses against the failure modes we've seen on CI:
 *   - Stealth plugin to dodge bot fingerprinting on datacenter IPs
 *   - networkidle wait + scroll-into-view for lazy-loaded donations widget
 *   - On failure: keep last-good donation values, write a debug artifact, exit 1 so the workflow turns red
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

const COIN_URL = 'https://pump.fun/coin/2MZbnTD4MdLjzwBmyRB4pdiTZK5SuHkj2TBW4Vy7SYUK';
const OUT_PATH = path.join(__dirname, '..', 'donations.json');
const DEBUG_DIR = path.join(__dirname, '..', 'debug-out');

const DONATION_RE = /Donated\s+([\d.]+)\s*SOL\s*\(\s*\$?([\d,.]+)\s*\)/i;

(async () => {
  const existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });
  const page = await ctx.newPage();

  let pageText = '';
  let pageHTML = '';
  let selectorFound = false;
  try {
    await page.goto(COIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    try { await page.waitForLoadState('networkidle', { timeout: 20000 }); } catch {}
    await page.waitForTimeout(5000);

    // Scroll the donations widget into view in case it's lazy-loaded.
    try {
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('*')].find(n => /Fisher House Foundation/i.test(n.textContent || ''));
        if (el) el.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(2000);
    } catch {}

    try {
      await page.waitForSelector('text=/Donated\\s+[\\d.]+\\s+SOL/i', { timeout: 30000 });
      selectorFound = true;
    } catch {}

    pageText = await page.evaluate(() => document.body.innerText);
    pageHTML = await page.content();
  } catch (e) {
    console.error('Page load failed:', e.message);
  } finally {
    await browser.close();
  }

  function bail(status, reason) {
    console.error(`SCRAPE FAILED (${status}): ${reason}`);
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    if (pageText) fs.writeFileSync(path.join(DEBUG_DIR, 'page.txt'), pageText);
    if (pageHTML) fs.writeFileSync(path.join(DEBUG_DIR, 'page.html'), pageHTML);
    // Preserve last-good donation amounts; only update meta fields.
    existing.last_attempt = new Date().toISOString();
    existing.scrape_status = status;
    fs.writeFileSync(OUT_PATH, JSON.stringify(existing, null, 2) + '\n');
    process.exit(1);
  }

  if (!pageText) bail('page_load_failed', 'pageText empty');

  const updated = { ...existing };
  let matchedAny = false;
  updated.charities = existing.charities.map(c => {
    const idx = pageText.toLowerCase().indexOf(c.match.toLowerCase());
    if (idx === -1) return c;
    const window = pageText.slice(idx, idx + 600);
    const m = window.match(DONATION_RE);
    if (!m) return c;
    matchedAny = true;
    return {
      ...c,
      donated_sol: Number(m[1]),
      donated_usd: Number(m[2].replace(/,/g, '')),
    };
  });

  if (!matchedAny) bail('no_matches_found', `selectorFound=${selectorFound}, pageTextLen=${pageText.length}`);

  updated.last_updated = new Date().toISOString();
  updated.last_attempt = updated.last_updated;
  updated.scrape_status = 'ok';

  fs.writeFileSync(OUT_PATH, JSON.stringify(updated, null, 2) + '\n');
  console.log('Wrote donations.json. Status:', updated.scrape_status);
  for (const c of updated.charities) {
    console.log(`  ${c.key}: ${c.donated_sol} SOL ($${c.donated_usd})`);
  }
})();
