// Renders tools/icon.html to the app icons and favicon.
//   node tools/render-icons.mjs
// Uses the Playwright installed under tests/, the system Chrome, and
// ImageMagick (`magick`) to pack favicon.ico.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const req = createRequire(path.join(here, '../tests/package.json'));
const pw = await import(pathToFileURL(req.resolve('@playwright/test')).href);
const chromium = pw.chromium ?? pw.default.chromium;

const sizes = { 'icon-512.png': 512, 'icon-192.png': 192, 'apple-touch-icon.png': 180, 'favicon-32.png': 32, 'favicon-16.png': 16 };
const browser = await chromium.launch({ channel: 'chrome' });
for (const [name, size] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 });
  await page.goto(pathToFileURL(path.join(here, 'icon.html')).href);
  await page.screenshot({ path: path.join(root, name) });
  await page.close();
  console.log(`wrote ${name}`);
}
await browser.close();
execFileSync('magick', ['favicon-16.png', 'favicon-32.png', 'favicon.ico'], { cwd: root });
console.log('wrote favicon.ico');
