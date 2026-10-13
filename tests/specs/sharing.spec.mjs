import { test, expect } from '@playwright/test';
import { freshRoll, legacyLinkFor, collectErrors, traitSnapshot } from './helpers.mjs';

test.describe('share codes and links', () => {
  test('v2 codes round-trip builds, locks and mood', async ({ page }) => {
    await freshRoll(page);
    const ok = await page.evaluate(() => {
      const key = st => { const s = snapshotTraitTexts(st); return Object.keys(s).sort().map(k => `${k}=${s[k]}`).join('|'); };
      let good = 0;
      for (let i = 0; i < 300; i++) {
        const mood = MOOD_ORDER[i % MOOD_ORDER.length];
        const st = { ...createBuildState(mood), mood };
        st.sections.hero.traits[i % 3].locked = true;
        st.sections.obstacles.locked = i % 2 === 0;
        const d = decodeBuildV2(encodeBuildV2(st));
        if (d && key(d) === key(st) && d.mood === mood
          && d.sections.hero.traits[i % 3].locked && d.sections.obstacles.locked === (i % 2 === 0)) good++;
      }
      return good;
    });
    expect(ok).toBe(300);
  });

  test('share link is short and opens the same build', async ({ page }) => {
    await freshRoll(page);
    const { url, logline } = await page.evaluate(() => ({ url: buildShareUrl(buildState), logline: buildLoglineText(buildState) }));
    expect(url).toMatch(/#b=[A-Za-z0-9_-]{28}$/);
    await page.evaluate(() => localStorage.clear());
    await page.goto('about:blank');
    await page.goto(url);
    await expect(page.locator('#logline-text')).toHaveText(logline);
    expect(await page.evaluate(() => location.hash)).toBe('');
  });

  test('legacy #build= links still load, and stay undoable over a saved build', async ({ page }) => {
    await freshRoll(page);
    const snap = () => traitSnapshot(page);
    const saved = await snap();
    // A legacy build guaranteed to differ from the saved one.
    const { link, linked } = await page.evaluate(() => {
      let st;
      do { st = createBuildState('all'); } while (st.sections.hero.traits[0].text === buildState.sections.hero.traits[0].text);
      return { link: `${location.origin}/#build=${toUrlSafeBase64(btoa(encodeURIComponent(JSON.stringify(st))))}`, linked: st.sections.hero.traits[0].text };
    });
    await page.goto('about:blank');
    await page.goto(link);
    await expect(page.locator('.card[data-section=hero] .trait-text').first()).toHaveText(linked);
    await page.keyboard.press('z');
    expect(await snap()).toBe(saved);
  });

  test('a script payload in a link is rejected and never runs', async ({ page }) => {
    await freshRoll(page);
    const link = await legacyLinkFor(page, `s.sections.hero.traits[0].text = '<img src=x onerror="window.__pwned=1">';`);
    await page.goto('about:blank');
    await page.goto(link);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    expect(await page.evaluate(() => buildState.sections.hero.traits[0].text)).not.toContain('<img');
  });

  test('text that is not in data.js is rejected; built-in mood names are ignored', async ({ page }) => {
    await freshRoll(page);
    expect(await page.evaluate(() => {
      const s = JSON.parse(JSON.stringify(buildState));
      s.sections.villain.traits[1].text = 'arbitrary words';
      return sanitizeBuild(s);
    })).toBeNull();
    expect(await page.evaluate(() => sanitizeBuild({ ...buildState, mood: 'constructor' }).mood)).toBe('all');
  });

  test('malformed links fall back without crashing', async ({ page }) => {
    const errors = collectErrors(page);
    for (const hash of ['#build=%E0%A4%A', '#b=!!!', '#b=AAAA', '#build=bm90IGpzb24']) {
      await page.goto('about:blank');
      await page.goto(`/${hash}`);
      await expect(page.locator('#die-face svg')).toBeVisible();
      expect(await page.evaluate(() => location.hash)).toBe('');
    }
    expect(errors).toEqual([]);
  });

  test('load box takes a whole pasted link (even wrapped) and Enter', async ({ page }) => {
    await freshRoll(page);
    const url = await page.evaluate(() => buildShareUrl({ ...createBuildState('all'), mood: 'all' }));
    await page.locator('.top-bar-title').click();
    await page.locator('#intro-load-disclosure').click();
    await page.locator('#load-input').fill(`${url.slice(0, 40)}\n${url.slice(40)}`.replace('\n', ' '));
    await page.locator('#load-input').press('Enter');
    await expect(page.locator('#results-screen')).toHaveClass(/active/);
  });
});
