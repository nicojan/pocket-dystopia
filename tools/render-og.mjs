// Renders tools/og-image.html to a PNG at 1200×630.
//   node tools/render-og.mjs og-image-v4.png
// Always pass a NEW filename: platforms cache previews by URL, so overwriting
// the live file would leave old previews in place. Then update index.html.
// Uses the Playwright installed under tests/ and the system Chrome.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(path.join(here, '../tests/package.json'));
const pw = await import(pathToFileURL(req.resolve('@playwright/test')).href);
const chromium = pw.chromium ?? pw.default.chromium;

const out = process.argv[2];
if (!out || !/^og-image-v\d+\.png$/.test(out)) {
  console.error('usage: node tools/render-og.mjs og-image-vN.png  (a new N, never the live file)');
  process.exit(2);
}
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(path.join(here, 'og-image.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(here, '..', out) });
await browser.close();
console.log(`wrote ${out}`);
