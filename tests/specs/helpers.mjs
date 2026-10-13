import { expect } from '@playwright/test';

// Fresh visit with empty storage, then the first roll from the intro die.
export async function freshRoll(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.locator('#die-container').click();
  await expect(page.locator('#results-screen')).toHaveClass(/active/);
  await expect(page.locator('.card')).toHaveCount(5);
  // The first-roll CRT boot squashes the cards for ~600ms; wait it out so
  // measurements see the settled layout.
  await expect(page.locator('#results-container')).not.toHaveClass(/crt-boot/);
}

// A share link built the legacy (v1) way from a state object.
export function legacyLinkFor(page, mutate) {
  return page.evaluate((mutateSrc) => {
    const state = JSON.parse(JSON.stringify(buildState));
    // eslint-disable-next-line no-new-func
    new Function('s', mutateSrc)(state);
    return `${location.origin}/#build=${toUrlSafeBase64(btoa(encodeURIComponent(JSON.stringify(state))))}`;
  }, mutate);
}

export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
  return errors;
}

// Order-independent fingerprint of every trait text (sanitized builds list
// their sections in a different key order than freshly rolled ones).
export function traitSnapshot(page) {
  return page.evaluate(() => {
    const s = snapshotTraitTexts(buildState);
    return Object.keys(s).sort().map(k => `${k}=${s[k]}`).join('\n');
  });
}
