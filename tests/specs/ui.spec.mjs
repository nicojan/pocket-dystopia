import { test, expect } from '@playwright/test';
import { freshRoll, collectErrors, traitSnapshot } from './helpers.mjs';

const isPhone = info => info.project.name === 'phone';

test.describe('core flows', () => {
  test('first roll renders five cards in Setting-first order, no errors', async ({ page }) => {
    const errors = collectErrors(page);
    await freshRoll(page);
    expect(await page.locator('.card').evaluateAll(cs => cs.map(c => c.dataset.section)))
      .toEqual(['setting', 'hero', 'villain', 'squad', 'obstacles']);
    await expect(page.locator('#logline-text')).toHaveText(/^In .+\. [A-Z]/);
    expect(errors).toEqual([]);
  });

  test('a locked trait survives a roll; undo brings the old roll back', async ({ page }) => {
    await freshRoll(page);
    const lock = page.locator('.card[data-section=hero] .trait-lock').first();
    await lock.click();
    const kept = await page.evaluate(() => buildState.sections.hero.traits[0].text);
    const before = await traitSnapshot(page);
    await page.evaluate(() => rollDie());
    await expect.poll(() => traitSnapshot(page)).not.toBe(before);
    expect(await page.evaluate(() => buildState.sections.hero.traits[0].text)).toBe(kept);
    await page.evaluate(() => undo());
    expect(await traitSnapshot(page)).toBe(before);
  });

  test('a locked card holds its traits', async ({ page }) => {
    await freshRoll(page);
    await page.locator('.card[data-section=villain] .lock-icon').click();
    await expect(page.locator('.card[data-section=villain] .trait-swap').first()).toBeDisabled();
    const text = await page.evaluate(() => buildState.sections.villain.traits[0].text);
    await page.evaluate(() => rerollSingleTrait('villain', 'traits', 0));
    expect(await page.evaluate(() => buildState.sections.villain.traits[0].text)).toBe(text);
  });

  test('changing mood re-rolls and says so', async ({ page }) => {
    await freshRoll(page);
    const snap = () => traitSnapshot(page);
    const before = await snap();
    await page.locator('#mood-combobox').click();
    await page.locator('.mood-option[data-mood=corporate]').click();
    await expect(page.locator('#toast')).toHaveText(/Re-rolled for Corporate dystopia/);
    expect(await snap()).not.toBe(before);
    expect(await page.evaluate(() => buildState.mood)).toBe('corporate');
  });
});

test.describe('pinned builds', () => {
  test('pin once, duplicates refused, focus stays in the panel after delete', async ({ page }) => {
    await freshRoll(page);
    await page.locator('#btn-pinned').click();
    await page.locator('#pin-current-btn').click();
    await expect(page.locator('#pin-current-label')).toHaveText('Pinned in slot 1');
    await expect(page.locator('#pin-current-btn')).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.keyboard.press('p');
    await expect(page.locator('#toast')).toHaveText('Already pinned in slot 1');

    await page.locator('#btn-pinned').click();
    await page.locator('[aria-label="Delete slot 1"]').click();
    await expect(page.locator('#confirm-title')).toHaveText('Delete slot 1?');
    await page.keyboard.press('Escape');
    await expect(page.locator('#pinned-modal')).toHaveClass(/active/);
    await page.locator('[aria-label="Delete slot 1"]').click();
    await page.locator('#confirm-yes').click();
    await expect(page.locator('#confirm-title')).toHaveText('Clear this build?');
    await expect.poll(() => page.evaluate(() => !!document.activeElement.closest('#pinned-modal'))).toBe(true);
  });
});

test.describe('phone layout', () => {
  test.beforeEach(({}, info) => test.skip(!isPhone(info), 'phone only'));

  test('thumb-zone bar rolls; left-handed mirrors it; nothing overflows', async ({ page }) => {
    await freshRoll(page);
    await expect(page.locator('.action-bar')).toBeVisible();
    await expect(page.locator('#btn-roll-all')).toBeHidden();
    const snap = () => traitSnapshot(page);
    const before = await snap();
    await page.locator('.action-roll').click();
    await expect.poll(snap).not.toBe(before);
    await expect(page.locator('#btn-undo-bar')).toBeEnabled();
    const rollBox = async () => (await page.locator('.action-roll').boundingBox()).x;
    const rhX = await rollBox();
    await page.locator('#btn-more').click();
    await page.locator('.more-menu-lefthand').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await rollBox()).toBeLessThan(rhX);
  });

  test('compressed view keeps a hand-opened card open across actions', async ({ page }) => {
    await freshRoll(page);
    await page.locator('#btn-compressed').click();
    await page.locator('.card[data-section=hero] .card-chevron').click();
    await page.locator('.card[data-section=hero] .trait-lock').nth(1).click();
    await expect(page.locator('.card[data-section=hero]')).toHaveClass(/expanded/);
    await expect(page.locator('.card[data-section=villain]')).not.toHaveClass(/expanded/);
    expect(await page.locator('#card-content-villain').evaluate(e => e.inert)).toBe(true);
  });

  test('touch targets are at least 44px', async ({ page }) => {
    // Playwright's device presets don't flip (pointer: coarse); CDP touch
    // emulation does, which is what real phones report.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await freshRoll(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const small = await page.evaluate(() => [...document.querySelectorAll('.trait-lock, .trait-swap, .card-header-actions .btn-icon, .top-bar-right .btn-icon')]
      .filter(b => b.offsetParent)
      .map(b => b.getBoundingClientRect())
      .filter(r => r.width < 44 || r.height < 44).length);
    expect(small).toBe(0);
  });
});

test.describe('classroom', () => {
  test.beforeEach(({}, info) => test.skip(isPhone(info), 'desktop only'));

  test('present view: keys, blocked shortcuts, fullscreen exit', async ({ page }) => {
    await freshRoll(page);
    const snap = () => traitSnapshot(page);
    await page.keyboard.press('f');
    await expect(page.locator('#present-view')).toHaveClass(/active/);
    await expect(page.locator('.present-controls .btn-primary')).toBeFocused();

    const start = await snap();
    await page.keyboard.press('r');
    await expect.poll(snap).not.toBe(start);
    await page.keyboard.press('z');
    expect(await snap()).toBe(start);
    const setting = await page.evaluate(() => buildState.sections.setting.where.text);
    await page.keyboard.press('1');
    expect(await page.evaluate(() => buildState.sections.setting.where.text)).not.toBe(setting);
    await page.keyboard.press('PageUp');
    expect(await snap()).toBe(start);

    for (const key of ['s', 'p', 'c', 'l', '?']) await page.keyboard.press(key);
    for (const id of ['#share-modal', '#pinned-modal', '#shortcuts-modal']) {
      await expect(page.locator(id)).not.toHaveClass(/active/);
    }

    // Leaving browser fullscreen (what Esc does in a real classroom) closes it.
    const entered = await page.evaluate(() => !!document.fullscreenElement);
    if (entered) {
      await page.evaluate(() => document.exitFullscreen());
      await expect(page.locator('#present-view')).not.toHaveClass(/active/);
      await page.keyboard.press('f');
    }
    await expect(page.locator('#present-view')).toHaveClass(/active/);
    await page.keyboard.press('f');
    await expect(page.locator('#present-view')).not.toHaveClass(/active/);
  });

  for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    test(`present view fits ${viewport.width}×${viewport.height} without scrolling`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await freshRoll(page);
      await page.keyboard.press('f');
      await expect(page.locator('.present-logline')).toBeVisible();
      const overflow = await page.locator('#present-inner').evaluate(e => e.scrollHeight - e.clientHeight);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('printing shows only the worksheet, filled from the build', async ({ page }) => {
    await freshRoll(page);
    const where = await page.evaluate(() => buildState.sections.setting.where.text);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#print-sheet')).toBeVisible();
    await expect(page.locator('#results-screen')).toBeHidden();
    await expect(page.locator('.ws-prompts li')).toHaveCount(6);
    await expect(page.locator('.ws-prompts li').first()).toContainText(where);
    await page.emulateMedia({ media: 'screen' });
    await expect(page.locator('#print-sheet')).toBeHidden();
  });
});

test.describe('motion', () => {
  test('reduced motion: a re-roll moves nothing (the colour afterglow may run)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await freshRoll(page);
    await page.evaluate(() => rollDie());
    // The new build lands ~300ms in; the card-height glide would run 360ms
    // from there, so this samples mid-glide.
    await page.waitForTimeout(450);
    // Anything that moves or resizes must be off; the amber afterglow is a
    // colour fade and deliberately stays (it shows what changed).
    const moving = await page.evaluate(() => document.getAnimations()
      .filter(a => a.playState === 'running' && a.effect?.target?.closest?.('#results-container, #logline-container'))
      .filter(a => a.effect.getKeyframes().some(k => 'transform' in k || 'height' in k))
      .length);
    expect(moving).toBe(0);
    // And the afterglow did run, so a change is still visible.
    expect(await page.locator('.trait-enter').count()).toBeGreaterThan(0);
  });

});
