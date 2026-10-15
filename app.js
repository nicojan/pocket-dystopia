// Pocket Dystopia - App Logic

// ============================================
// State
// ============================================

const STORAGE_KEY = 'pocket-dystopia-state';
const PREFS_KEY = 'pocket-dystopia-prefs';
const MAX_HISTORY = 20;

let buildState = null;
let history = [];
let isFirstRoll = true;
let lastTumbleDir = '';
let dieIdleInterval = null;
// Snapshot of the last rendered state, used to detect which traits changed
// between renders so only the new ones animate in.
let lastRenderedSnapshot = null;
// Cards the user opened or closed by hand in Compressed/Expanded view, so a
// re-render (lock, swap, undo…) doesn't snap them back. Cleared by setView.
let manualExpanded = {};

// ============================================
// D6 Face SVGs
// ============================================

const DIE_PIPS = {
  1: [[60, 60]],
  2: [[30, 30], [90, 90]],
  3: [[30, 30], [60, 60], [90, 90]],
  4: [[30, 30], [90, 30], [30, 90], [90, 90]],
  5: [[30, 30], [90, 30], [60, 60], [30, 90], [90, 90]],
  6: [[30, 30], [90, 30], [30, 60], [90, 60], [30, 90], [90, 90]],
};

function getDieFaceSVG(n, opts = {}) {
  const pipFill = opts.pipFill || 'var(--accent-ink)';
  const stroke = opts.stroke || 'var(--accent-ink)';
  const fill = opts.fill || 'var(--bg-elevated)';
  const strokeWidth = opts.strokeWidth || 2;
  const pips = DIE_PIPS[n].map(
    ([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="${pipFill}"/>`
  ).join('');
  return `
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="104" height="104" rx="18"
        stroke="${stroke}" stroke-width="${strokeWidth}"
        fill="${fill}" opacity="0.9"/>
      ${opts.dashed === false ? '' : `<rect x="8" y="8" width="104" height="104" rx="18"
        stroke="${stroke}" stroke-width="1" fill="none"
        opacity="0.35" stroke-dasharray="4 4"/>`}
      ${pips}
    </svg>
  `;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Faces swap cleanly; the tumble carries the motion. Real dice don't fade.
function setDieFace(n) {
  const el = document.getElementById('die-face');
  if (!el) return;
  el.innerHTML = getDieFaceSVG(n);
}

// Small d6 icon inside the "Roll" button — cycles forever.
let rollIconInterval = null;
function startRollIconCycle() {
  if (rollIconInterval) clearInterval(rollIconInterval);
  const els = document.querySelectorAll('.roll-die-icon');
  if (els.length === 0) return;
  let last = 0;
  const tick = () => {
    let f;
    do { f = Math.floor(Math.random() * 6) + 1; } while (f === last);
    last = f;
    const svg = getDieFaceSVG(f, {
      pipFill: 'currentColor',
      stroke: 'currentColor',
      fill: 'transparent',
      strokeWidth: 6,
      dashed: false,
    });
    els.forEach(el => { el.innerHTML = svg; });
  };
  tick();
  rollIconInterval = setInterval(tick, 500);
}

// ============================================
// Preferences
// ============================================

const DEFAULT_PREFS = { theme: null, leftHanded: false, defaultView: 'expanded', mood: 'all' };

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? { ...DEFAULT_PREFS, ...parsed } : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked (site data off, private mode) — prefs last this visit only.
  }
}

// The browser chrome (address bar, iOS status bar) follows the page ground.
function setThemeAttr(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const ground = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim();
  if (ground) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ground);
}

function applyPrefs() {
  const prefs = loadPrefs();
  const theme = prefs.theme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  setThemeAttr(theme);
  document.documentElement.setAttribute('data-left-handed', String(prefs.leftHanded));
  updateMoreMenuState();
  setView(prefs.defaultView || 'expanded');
  applyMood(isMood(prefs.mood) ? prefs.mood : 'all', { skipReroll: true });
}

// Sync the "More" overflow menu labels / checked-state with the live prefs.
function updateMoreMenuState() {
  const theme = document.documentElement.getAttribute('data-theme');
  const themeLabel = document.getElementById('more-theme-label');
  const themeIcon = document.getElementById('more-theme-icon');
  if (themeLabel) themeLabel.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  if (themeIcon) themeIcon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';

  const lhItem = document.querySelector('.more-menu-lefthand');
  const leftHanded = document.documentElement.getAttribute('data-left-handed') === 'true';
  if (lhItem) lhItem.setAttribute('aria-checked', String(leftHanded));

  const shakeItem = document.querySelector('.more-menu-shake');
  if (shakeItem) {
    shakeItem.hidden = !shakeSupported();
    shakeItem.setAttribute('aria-checked', String(shakeEnabled));
  }
}

// ============================================
// Theme & Left-Handed Toggles
// ============================================

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  setThemeAttr(next);
  updateMoreMenuState();
  const prefs = loadPrefs();
  savePrefs({ ...prefs, theme: next });
}

function toggleLeftHanded() {
  const current = document.documentElement.getAttribute('data-left-handed') === 'true';
  const next = !current;
  document.documentElement.setAttribute('data-left-handed', String(next));
  updateMoreMenuState();
  const prefs = loadPrefs();
  savePrefs({ ...prefs, leftHanded: next });
}

// ============================================
// View Toggle
// ============================================

function setView(mode) {
  const cards = document.querySelectorAll('.card');
  const btnExpanded = document.getElementById('btn-expanded');
  const btnCompressed = document.getElementById('btn-compressed');

  const canCollapse = window.matchMedia(COLLAPSE_MQ).matches;
  manualExpanded = {};
  if (mode === 'expanded') {
    cards.forEach(c => setCardExpanded(c, true));
    if (btnExpanded) {
      btnExpanded.classList.add('active');
      btnExpanded.setAttribute('aria-pressed', 'true');
    }
    if (btnCompressed) {
      btnCompressed.classList.remove('active');
      btnCompressed.setAttribute('aria-pressed', 'false');
    }
  } else {
    cards.forEach(c => setCardExpanded(c, !canCollapse));
    if (btnExpanded) {
      btnExpanded.classList.remove('active');
      btnExpanded.setAttribute('aria-pressed', 'false');
    }
    if (btnCompressed) {
      btnCompressed.classList.add('active');
      btnCompressed.setAttribute('aria-pressed', 'true');
    }
  }

  const prefs = loadPrefs();
  savePrefs({ ...prefs, defaultView: mode });
}

// ============================================
// Mood Filter
// ============================================

// Mood values map to the labels shown in the custom combobox.
// Own-property check — MOOD_LABELS['constructor'] would otherwise be truthy.
function isMood(mood) {
  return typeof mood === 'string' && Object.prototype.hasOwnProperty.call(MOOD_LABELS, mood);
}

const MOOD_LABELS = {
  'all': 'All moods',
  'corporate': 'Corporate dystopia',
  'post-apocalyptic': 'Post-apocalyptic',
  'ai-takeover': 'AI takeover',
  'political': 'Political satire',
};

let currentMood = 'all';

function applyMood(mood, opts = {}) {
  currentMood = mood;
  const labelEl = document.getElementById('mood-combobox-label');
  if (labelEl) labelEl.textContent = isMood(mood) ? MOOD_LABELS[mood] : MOOD_LABELS.all;
  // Update checkmarks on each option.
  document.querySelectorAll('.mood-option').forEach(li => {
    const match = li.dataset.mood === mood;
    li.setAttribute('aria-selected', String(match));
  });
  if (!opts.skipReroll && buildState) {
    generateNightmare();
  }
}

function selectMood(mood) {
  const changed = mood !== currentMood;
  const prefs = loadPrefs();
  savePrefs({ ...prefs, mood });
  closeMoodListbox();
  document.getElementById('mood-combobox')?.focus();
  if (!changed) return;
  applyMood(mood);
  // Picking a mood re-rolls everything unlocked — say so, since it replaces
  // traits the user may have been looking at. Undo covers it.
  if (buildState) {
    showToast(mood === 'all'
      ? 'Re-rolled with all moods. Locks kept.'
      : `Re-rolled for ${MOOD_LABELS[mood]}. Locks kept.`);
  }
}

function getCurrentMood() {
  return currentMood;
}

// --- Mood listbox (custom combobox) ---

function toggleMoodListbox(event) {
  if (event) event.stopPropagation();
  const listbox = document.getElementById('mood-listbox');
  const btn = document.getElementById('mood-combobox');
  if (!listbox || !btn) return;
  if (listbox.hidden) openMoodListbox();
  else closeMoodListbox();
}

function openMoodListbox() {
  const listbox = document.getElementById('mood-listbox');
  const btn = document.getElementById('mood-combobox');
  if (!listbox || !btn) return;
  listbox.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  // Move focus to the selected option.
  const selected = listbox.querySelector('[aria-selected="true"]') || listbox.querySelector('.mood-option');
  if (selected) selected.focus();
}

function closeMoodListbox() {
  const listbox = document.getElementById('mood-listbox');
  const btn = document.getElementById('mood-combobox');
  if (!listbox || !btn) return;
  listbox.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

function initMoodCombobox() {
  const listbox = document.getElementById('mood-listbox');
  const btn = document.getElementById('mood-combobox');
  if (!listbox || !btn) return;

  listbox.addEventListener('keydown', (e) => {
    const options = Array.from(listbox.querySelectorAll('.mood-option'));
    const idx = options.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = options[(idx + 1) % options.length];
      next?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = options[(idx - 1 + options.length) % options.length];
      prev?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      options[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      options[options.length - 1]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const mood = document.activeElement?.dataset.mood;
      if (mood) selectMood(mood);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMoodListbox();
      btn.focus();
    }
  });

  // Click outside to close.
  document.addEventListener('click', (e) => {
    if (listbox.hidden) return;
    if (!listbox.contains(e.target) && !btn.contains(e.target)) closeMoodListbox();
  });
}

// ============================================
// Random Selection with Mood Weighting
// ============================================

function getWeightedItems(pool, count, mood) {
  if (mood === 'all') {
    return shuffleAndPick(pool, count);
  }
  // Soft-tighten: matching mood is weighted 8x vs. neutral items.
  const weighted = pool.flatMap(item =>
    (item.mood && item.mood.includes(mood))
      ? Array(8).fill(item)
      : [item]
  );
  return shuffleAndPick(weighted, count);
}

function shuffleAndPick(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  const seen = new Set();
  const result = [];
  for (const item of shuffled) {
    const text = typeof item === 'string' ? item : item.text;
    if (!seen.has(text) && result.length < count) {
      seen.add(text);
      result.push(item);
    }
  }
  return result;
}

function pickOne(pool, mood) {
  return getWeightedItems(pool, 1, mood)[0];
}

// ============================================
// Build State Generation
// ============================================

function createBuildState(mood) {
  const heroTraits = getWeightedItems(DATA.heroTraits, 3, mood);
  const villainTraits = getWeightedItems(DATA.villainTraits, 3, mood);
  const squadMembers = getWeightedItems(DATA.squadMembers, 3, mood);
  const obstacles = getWeightedItems(DATA.obstacles, 2, mood);

  return {
    version: 1,
    timestamp: Date.now(),
    mood,
    sections: {
      hero: {
        locked: false,
        traits: heroTraits.map(t => ({ text: t.text, locked: false })),
        weakness: { text: pickOne(DATA.heroWeaknesses, mood).text, locked: false },
        trauma: { text: pickOne(DATA.heroTraumas, mood).text, locked: false },
      },
      villain: {
        locked: false,
        traits: villainTraits.map(t => ({ text: t.text, locked: false })),
        weakness: { text: pickOne(DATA.villainWeaknesses, mood).text, locked: false },
      },
      squad: {
        locked: false,
        traits: squadMembers.map(t => ({ text: t.text, locked: false })),
      },
      setting: {
        locked: false,
        when: { text: pickOne(DATA.times, mood).text, locked: false },
        where: { text: pickOne(DATA.settings, mood).text, locked: false },
      },
      obstacles: {
        locked: false,
        traits: obstacles.map(t => ({ text: t.text, locked: false })),
      },
    },
  };
}

function rerollSection(sectionKey) {
  if (!buildState) return;
  const section = buildState.sections[sectionKey];
  if (section.locked) return;

  pushHistory();
  const mood = getCurrentMood();

  switch (sectionKey) {
    case 'hero': {
      const unlocked = section.traits.filter(t => !t.locked);
      const newTraits = getWeightedItems(DATA.heroTraits, unlocked.length, mood);
      let ni = 0;
      section.traits = section.traits.map(t =>
        t.locked ? t : { text: newTraits[ni++].text, locked: false }
      );
      if (!section.weakness.locked) section.weakness = { text: pickOne(DATA.heroWeaknesses, mood).text, locked: false };
      if (!section.trauma.locked) section.trauma = { text: pickOne(DATA.heroTraumas, mood).text, locked: false };
      break;
    }
    case 'villain': {
      const unlocked = section.traits.filter(t => !t.locked);
      const newTraits = getWeightedItems(DATA.villainTraits, unlocked.length, mood);
      let ni = 0;
      section.traits = section.traits.map(t =>
        t.locked ? t : { text: newTraits[ni++].text, locked: false }
      );
      if (!section.weakness.locked) section.weakness = { text: pickOne(DATA.villainWeaknesses, mood).text, locked: false };
      break;
    }
    case 'squad': {
      const unlocked = section.traits.filter(t => !t.locked);
      const newTraits = getWeightedItems(DATA.squadMembers, unlocked.length, mood);
      let ni = 0;
      section.traits = section.traits.map(t =>
        t.locked ? t : { text: newTraits[ni++].text, locked: false }
      );
      break;
    }
    case 'setting': {
      if (!section.when.locked) section.when = { text: pickOne(DATA.times, mood).text, locked: false };
      if (!section.where.locked) section.where = { text: pickOne(DATA.settings, mood).text, locked: false };
      break;
    }
    case 'obstacles': {
      const unlocked = section.traits.filter(t => !t.locked);
      const newTraits = getWeightedItems(DATA.obstacles, unlocked.length, mood);
      let ni = 0;
      section.traits = section.traits.map(t =>
        t.locked ? t : { text: newTraits[ni++].text, locked: false }
      );
      break;
    }
  }

  buildState = { ...buildState, timestamp: Date.now() };
  saveBuildState();
  renderCards();
}

// ============================================
// Rolling
// ============================================

function generateNightmare() {
  const mood = getCurrentMood();

  if (buildState) {
    pushHistory();
    const sections = buildState.sections;
    for (const key of Object.keys(sections)) {
      if (!sections[key].locked) {
        const tempState = createBuildState(mood);
        const newSection = tempState.sections[key];
        // Preserve individually locked traits
        if (sections[key].traits) {
          let ni = 0;
          const newTraits = newSection.traits;
          sections[key].traits = sections[key].traits.map(t => {
            if (t.locked) return t;
            return newTraits[ni++] || t;
          });
        }
        if (key === 'hero') {
          if (!sections[key].weakness.locked) sections[key].weakness = newSection.weakness;
          if (!sections[key].trauma.locked) sections[key].trauma = newSection.trauma;
        }
        if (key === 'villain') {
          if (!sections[key].weakness.locked) sections[key].weakness = newSection.weakness;
        }
        if (key === 'setting') {
          if (!sections[key].when.locked) sections[key].when = newSection.when;
          if (!sections[key].where.locked) sections[key].where = newSection.where;
        }
      }
    }
    buildState = { ...buildState, timestamp: Date.now(), mood };
  } else {
    buildState = createBuildState(mood);
  }

  saveBuildState();
  showResults();
  renderCards();
}

let isRolling = false;

function rollDie() {
  if (isRolling) return;
  isRolling = true;

  const dieWrapper = document.querySelector('.die-wrapper');

  if (dieIdleInterval) {
    clearInterval(dieIdleInterval);
    dieIdleInterval = null;
  }

  // Fast face cycle
  const rollEnd = Date.now() + 900;
  let lastFace = 0;
  let lastSwap = 0;
  function fastTick(ts) {
    if (!lastSwap || ts - lastSwap > 70) {
      let f;
      do { f = Math.floor(Math.random() * 6) + 1; } while (f === lastFace);
      lastFace = f;
      setDieFace(f);
      lastSwap = ts;
    }
    if (Date.now() < rollEnd) {
      requestAnimationFrame(fastTick);
    }
  }
  requestAnimationFrame(fastTick);

  if (isFirstRoll && dieWrapper) {
    // CRT boot on results
    setTimeout(() => {
      try {
        generateNightmare();
        const resultsContainer = document.getElementById('results-container');
        if (resultsContainer) {
          resultsContainer.classList.add('crt-boot');
          setTimeout(() => resultsContainer.classList.remove('crt-boot'), 700);
        }
        isFirstRoll = false;
      } finally {
        // Never leave the die locked out, even if the render throws.
        isRolling = false;
        startDieIdleCycle();
      }
    }, 900);
  } else {
    // Die tumble animation
    if (dieWrapper) {
      const tumbles = ['die-tumble-x', 'die-tumble-x-neg', 'die-tumble-y', 'die-tumble-y-neg', 'die-tumble-diag'];
      const available = tumbles.filter(t => t !== lastTumbleDir);
      const dir = available[Math.floor(Math.random() * available.length)];
      lastTumbleDir = dir;

      const tumbleContainer = dieWrapper.parentElement;
      if (tumbleContainer) {
        tumbleContainer.classList.add(dir);
        // Swap content just past the midpoint, while the die is edge-on.
        setTimeout(() => generateNightmare(), 300);
        setTimeout(() => {
          tumbleContainer.classList.remove(dir);
              isRolling = false;
          startDieIdleCycle();
        }, 700);
      } else {
        setTimeout(() => {
          generateNightmare();
              isRolling = false;
          startDieIdleCycle();
        }, 325);
      }
    } else {
      setTimeout(() => {
        generateNightmare();
          isRolling = false;
      }, 900);
    }
  }
}

// ============================================
// Die Idle Cycle
// ============================================

function startDieIdleCycle() {
  if (dieIdleInterval) clearInterval(dieIdleInterval);
  const el = document.getElementById('die-face');
  if (!el) return;
  let last = 0;
  const tick = () => {
    let f;
    do { f = Math.floor(Math.random() * 6) + 1; } while (f === last);
    last = f;
    setDieFace(f);
  };
  tick();
  dieIdleInterval = setInterval(tick, 600);
}

// ============================================
// Rendering
// ============================================

function showResults() {
  document.getElementById('intro-screen').classList.add('hidden');
  document.getElementById('results-screen').classList.add('active');
}

function showIntro() {
  document.getElementById('intro-screen').classList.remove('hidden');
  document.getElementById('results-screen').classList.remove('active');
  const logline = document.getElementById('logline-container');
  if (logline) logline.hidden = true;
  // Resume row visible only when a saved build exists.
  const resume = document.getElementById('intro-resume');
  if (resume) resume.hidden = !loadSavedState();
  isFirstRoll = true;
  startDieIdleCycle();
}

// Resume row action — jumps back to results without rolling.
function resumeBuild() {
  const saved = loadSavedState();
  if (!saved) return;
  buildState = saved;
  isFirstRoll = false;
  showResults();
  renderCards();
}

// Build a flat map of { "sectionKey:traitPath": text } from a build state,
// used to diff renders and figure out which traits are new.
function snapshotTraitTexts(state) {
  if (!state) return {};
  const out = {};
  for (const [key, s] of Object.entries(state.sections)) {
    if (s.traits) s.traits.forEach((t, i) => { out[`${key}:traits:${i}`] = t.text; });
    if (s.weakness) out[`${key}:weakness`] = s.weakness.text;
    if (s.trauma) out[`${key}:trauma`] = s.trauma.text;
    if (s.when) out[`${key}:when`] = s.when.text;
    if (s.where) out[`${key}:where`] = s.where.text;
  }
  return out;
}

// Display order, top to bottom. Setting leads because it frames everything
// (the logline opens with it too). Keyboard shortcuts 1–5, the text export
// and the share image all follow this order.
const SECTIONS = [
  { key: 'setting', title: 'THE SETTING', display: 'The Setting' },
  { key: 'hero', title: 'THE HERO', display: 'The Hero' },
  { key: 'villain', title: 'THE VILLAIN', display: 'The Villain' },
  { key: 'squad', title: 'THE SQUAD', display: 'The Squad' },
  { key: 'obstacles', title: 'OBSTACLES', display: 'Obstacles' },
];
const SECTION_KEYS = SECTIONS.map(s => s.key);
const SECTION_LABELS = Object.fromEntries(SECTIONS.map(s => [s.key, s.display]));

// Below this width cards can collapse (the Expanded/Compressed toggle is
// visible). Keep in sync with the 1024px breakpoint in styles.css.
const COLLAPSE_MQ = '(max-width: 1023.98px)';

function renderCards() {
  if (!buildState) return;

  const container = document.getElementById('results-container');
  const prefs = loadPrefs();
  const viewMode = prefs.defaultView || 'expanded';
  const canCollapse = window.matchMedia(COLLAPSE_MQ).matches;

  const prev = lastRenderedSnapshot;
  const current = snapshotTraitTexts(buildState);
  // On first render, don't animate rows (the CRT boot handles it).
  const changedKeys = prev
    ? new Set(Object.keys(current).filter(k => current[k] !== prev[k]))
    : new Set();

  renderLogline(changedKeys);

  // FLIP: remember each card's height so a re-roll that changes text length
  // glides to the new height instead of jumping the grid.
  const animateHeights = changedKeys.size > 0 && !prefersReducedMotion();
  const oldHeights = {};
  if (animateHeights) {
    container.querySelectorAll('.card').forEach(card => {
      oldHeights[card.dataset.section] = card.getBoundingClientRect().height;
    });
  }

  container.innerHTML = SECTIONS.map(({ key, display }) => {
    const section = buildState.sections[key];
    const isLocked = section.locked;
    const wantExpanded = typeof manualExpanded[key] === 'boolean' ? manualExpanded[key] : viewMode === 'expanded';
    const isExpanded = wantExpanded || !canCollapse;
    const expandedClass = wantExpanded ? ' expanded' : '';
    const lockedClass = isLocked ? ' locked' : '';

    let traitsHtml = '';
    let summaryText = '';
    let hiddenCount = 0;

    if (key === 'setting') {
      traitsHtml = renderSettingTraits(section, changedKeys);
      summaryText = section.where.text;
      hiddenCount = 1;
    } else {
      traitsHtml = renderSectionTraits(key, section, changedKeys);
      summaryText = section.traits?.[0]?.text || '';
      hiddenCount = (section.traits?.length || 0) - 1
        + (section.weakness ? 1 : 0) + (section.trauma ? 1 : 0);
    }
    const moreHtml = hiddenCount > 0
      ? ` <span class="card-summary-more">+${hiddenCount} more</span>`
      : '';

    const contentId = `card-content-${key}`;
    return `
      <section class="card card-${key}${expandedClass}${lockedClass}" data-section="${key}" aria-labelledby="card-title-${key}">
        <div class="card-header">
          <h2 class="card-header-title" id="card-title-${key}">${display}</h2>
          <div class="card-header-actions">
            <button class="btn-icon" onclick="rerollSection('${key}')" aria-label="Re-roll ${display}" title="${isLocked ? 'Unlock to re-roll' : 'Re-roll this card'}"${isLocked ? ' disabled' : ''}>
              <span class="material-symbols-outlined" aria-hidden="true">casino</span>
            </button>
            <button class="btn-icon lock-icon ${isLocked ? 'icon-filled' : ''}"
              onclick="toggleSectionLock('${key}')"
              aria-label="Lock ${display}"
              title="${isLocked ? 'Unlock this card' : 'Lock this card'}"
              aria-pressed="${isLocked}">
              <span class="material-symbols-outlined ${isLocked ? 'icon-filled' : ''}" aria-hidden="true">${isLocked ? 'lock' : 'lock_open'}</span>
            </button>
            <button class="btn-icon card-chevron"
              onclick="toggleCardExpand('${key}')"
              aria-expanded="${isExpanded}"
              aria-controls="${contentId}"
              aria-label="${isExpanded ? 'Collapse' : 'Expand'} ${display}">
              <span class="material-symbols-outlined" aria-hidden="true">expand_more</span>
            </button>
          </div>
        </div>
        <div class="card-summary" aria-hidden="true">${escapeHtml(summaryText)}${moreHtml}</div>
        <div class="card-content" id="${contentId}"${isExpanded ? '' : ' inert'}>
          <div class="card-content-inner">
            <div class="card-body">${traitsHtml}</div>
          </div>
        </div>
      </section>
    `;
  }).join('');

  // New rows are dealt in reading order: each visible one gets its place in
  // the queue (rows inside collapsed cards would only make the rest wait).
  const visibleEntering = [...container.querySelectorAll('.trait-enter')]
    .filter(row => !canCollapse || row.closest('.card').classList.contains('expanded'));
  visibleEntering.forEach((row, i) => row.style.setProperty('--i', i));

  if (animateHeights) {
    // Read every new height first, then start the animations: one layout.
    const cards = [...container.querySelectorAll('.card')];
    const newHeights = cards.map(card => card.getBoundingClientRect().height);
    cards.forEach((card, i) => {
      const from = oldHeights[card.dataset.section];
      const to = newHeights[i];
      if (from && Math.abs(from - to) > 1) {
        card.animate(
          [{ height: `${from}px` }, { height: `${to}px` }],
          { duration: 360, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
        );
      }
    });
  }

  lastRenderedSnapshot = current;
  updateUndoButton();
  if (isPresenting()) renderPresent(changedKeys);
}

// The logline reads from these state paths. If any of them change between
// renders the logline animates in again. Other trait changes (e.g.
// hero trait 2) don't trigger a re-render since they aren't quoted here.
const LOGLINE_SOURCE_KEYS = [
  'setting:where',
  'setting:when',
  'hero:traits:0',
  'villain:traits:0',
  'squad:traits:0',
  'obstacles:traits:0',
];

// Trait text is written lowercase for list use; the logline stitches it into
// sentences, so each sentence gets a capital and a closing full stop.
function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

function sentence(str) {
  const s = capitalize(str.trim());
  return /[.!?…]['’")]*$/.test(s) ? s : `${s}.`;
}

function buildLoglineText(state) {
  if (!state || !state.sections) return '';
  const s = state.sections;
  const parts = [];
  const where = s.setting?.where?.text;
  const when = s.setting?.when?.text;
  if (where && when) parts.push(sentence(`In ${where}, ${when}`));
  const hero0 = s.hero?.traits?.[0]?.text;
  const villain0 = s.villain?.traits?.[0]?.text;
  if (hero0 && villain0) parts.push(sentence(`${hero0} meets ${villain0}`));
  const squad0 = s.squad?.traits?.[0]?.text;
  const obstacle0 = s.obstacles?.traits?.[0]?.text;
  if (squad0) parts.push(sentence(`${squad0} gets dragged in`));
  if (obstacle0) parts.push(sentence(obstacle0));
  return parts.join(' ');
}

function renderLogline(changedKeys) {
  const container = document.getElementById('logline-container');
  const textEl = document.getElementById('logline-text');
  if (!container || !textEl || !buildState) return;

  const text = buildLoglineText(buildState);
  if (!text) {
    container.hidden = true;
    return;
  }

  const sourceChanged = LOGLINE_SOURCE_KEYS.some(k => changedKeys && changedKeys.has(k));

  const prevText = textEl.textContent;
  textEl.textContent = text;
  container.hidden = false;

  if (sourceChanged) {
    textEl.classList.remove('logline-enter');
    // Force reflow so the animation restarts cleanly.
    void textEl.offsetWidth;
    textEl.classList.add('logline-enter');
    // Announce the updated logline so screen-reader users hear the new
    // stitched-together build without having to re-scan each card.
    if (prevText && prevText !== text) {
      announce(text);
    }
  }
}

function copyLogline(event) {
  const text = buildLoglineText(buildState);
  if (!text) return;
  const trigger = event?.currentTarget;
  copyText(text, 'Logline copied', trigger);
}

function renderSectionTraits(sectionKey, section, changedKeys) {
  const sectionLocked = section.locked;
  let html = '';

  if (section.traits) {
    html += section.traits.map((trait, i) =>
      renderTraitLine('>', trait.text, trait.locked, sectionKey, 'traits', i, false, changedKeys, sectionLocked)
    ).join('');
  }

  if (section.weakness) {
    html += renderTraitLine('WEAK:', section.weakness.text, section.weakness.locked, sectionKey, 'weakness', null, true, changedKeys, sectionLocked);
  }

  if (section.trauma) {
    html += renderTraitLine('TRAUMA:', section.trauma.text, section.trauma.locked, sectionKey, 'trauma', null, true, changedKeys, sectionLocked);
  }

  return html;
}

function renderSettingTraits(section, changedKeys) {
  let html = '';
  html += renderTraitLine('WHEN:', section.when.text, section.when.locked, 'setting', 'when', null, true, changedKeys, section.locked);
  html += renderTraitLine('WHERE:', section.where.text, section.where.locked, 'setting', 'where', null, true, changedKeys, section.locked);
  return html;
}

function renderTraitLine(prefix, text, locked, sectionKey, traitType, index, isLabel, changedKeys, sectionLocked = false) {
  // A locked card holds every trait in it, whatever the trait's own lock says.
  const held = locked || sectionLocked;
  const lockedClass = held ? ' trait-locked' : '';
  const snapshotKey = index !== null && index !== undefined
    ? `${sectionKey}:${traitType}:${index}`
    : `${sectionKey}:${traitType}`;
  const enterClass = changedKeys && changedKeys.has(snapshotKey) ? ' trait-enter' : '';
  const lockIcon = held ? 'lock' : 'lock_open';
  const iconClass = held ? ' icon-filled' : '';
  const idxArg = index !== null && index !== undefined ? `,${index}` : '';
  const lockClickHandler = `toggleTraitLock('${sectionKey}','${traitType}'${idxArg})`;
  const swapClickHandler = `rerollSingleTrait('${sectionKey}','${traitType}'${idxArg})`;

  const prefixHtml = isLabel
    ? `<span class="trait-label">${prefix}</span>`
    : `<span class="trait-prefix" aria-hidden="true">${prefix}</span>`;

  const truncated = text.length > 40 ? text.slice(0, 40) + '…' : text;
  const swapLabel = `Swap: ${truncated}`;
  const swapTitle = held ? 'Unlock to swap' : 'Swap this one';
  const lockLabel = `Keep: ${truncated}`;
  const lockTitle = sectionLocked ? 'Card is locked' : (locked ? 'Release this' : 'Keep this');

  return `
    <div class="trait-line${lockedClass}${enterClass}">
      ${prefixHtml}
      <span class="trait-text">${escapeHtml(text)}</span>
      <div class="trait-actions">
        <button class="btn-icon trait-swap"
          onclick="${swapClickHandler}"
          aria-label="${escapeHtml(swapLabel)}"
          title="${swapTitle}"${held ? ' disabled' : ''}>
          <span class="material-symbols-outlined" aria-hidden="true">replay</span>
        </button>
        <button class="btn-icon trait-lock" onclick="${lockClickHandler}"
          aria-label="${escapeHtml(lockLabel)}"
          title="${lockTitle}"
          aria-pressed="${held}"${sectionLocked ? ' disabled' : ''}>
          <span class="material-symbols-outlined${iconClass}" aria-hidden="true">${lockIcon}</span>
        </button>
      </div>
    </div>
  `;
}

// Escapes for both text content and attribute values (quotes included).
// Every string that reaches innerHTML goes through here.
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

// ============================================
// Card Expand/Collapse
// ============================================

function setCardExpanded(card, expanded) {
  card.classList.toggle('expanded', expanded);
  const content = card.querySelector('.card-content');
  // Collapsed content stays in the DOM for the animation; inert keeps its
  // buttons out of the tab order and away from screen readers.
  if (content) content.inert = !expanded;
  const chevron = card.querySelector('.card-chevron');
  if (chevron) {
    chevron.setAttribute('aria-expanded', String(expanded));
    const label = SECTION_LABELS[card.dataset.section] || card.dataset.section;
    chevron.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${label}`);
  }
}

function toggleCardExpand(sectionKey) {
  // Wide layouts keep every card open — collapse only exists where the
  // Expanded/Compressed toggle is shown.
  if (!window.matchMedia(COLLAPSE_MQ).matches) return;
  const card = document.querySelector(`.card[data-section="${sectionKey}"]`);
  if (!card) return;
  // A re-roll may still be gliding this card's height; let the expand win.
  card.getAnimations().forEach(a => a.cancel());
  const next = !card.classList.contains('expanded');
  manualExpanded = { ...manualExpanded, [sectionKey]: next };
  setCardExpanded(card, next);
}

// ============================================
// Locking
// ============================================

function toggleSectionLock(sectionKey) {
  if (!buildState) return;
  const section = buildState.sections[sectionKey];
  const willBeLocked = !section.locked;
  buildState = {
    ...buildState,
    sections: {
      ...buildState.sections,
      [sectionKey]: { ...section, locked: willBeLocked },
    },
  };
  saveBuildState();
  renderCards();
  announce(`${SECTION_LABELS[sectionKey] || sectionKey} ${willBeLocked ? 'locked' : 'unlocked'}`);
}

function toggleTraitLock(sectionKey, traitType, index) {
  if (!buildState) return;
  if (buildState.sections[sectionKey]?.locked) return;
  const section = { ...buildState.sections[sectionKey] };
  let willBeLocked = false;

  if (index !== undefined && index !== null) {
    const traits = section.traits.map((t, i) => {
      if (i === index) {
        willBeLocked = !t.locked;
        return { ...t, locked: !t.locked };
      }
      return t;
    });
    section.traits = traits;
  } else {
    willBeLocked = !section[traitType].locked;
    section[traitType] = { ...section[traitType], locked: willBeLocked };
  }

  buildState = {
    ...buildState,
    sections: { ...buildState.sections, [sectionKey]: section },
  };
  saveBuildState();
  renderCards();

  // One-time tutorial toast for the first ever trait-level lock.
  if (willBeLocked) {
    const prefs = loadPrefs();
    if (!prefs.hasSeenLockHint) {
      showToast("Locked. It'll survive your next roll.");
      savePrefs({ ...prefs, hasSeenLockHint: true });
    }
  }

  announce(`Trait ${willBeLocked ? 'locked' : 'unlocked'}`);
}

// Map of sectionKey:traitType → data pool for single-trait re-rolls.
const TRAIT_POOL_MAP = {
  'hero:traits': 'heroTraits',
  'hero:weakness': 'heroWeaknesses',
  'hero:trauma': 'heroTraumas',
  'villain:traits': 'villainTraits',
  'villain:weakness': 'villainWeaknesses',
  'squad:traits': 'squadMembers',
  'setting:when': 'times',
  'setting:where': 'settings',
  'obstacles:traits': 'obstacles',
};

function rerollSingleTrait(sectionKey, traitType, index) {
  if (!buildState) return;
  const section = buildState.sections[sectionKey];
  if (!section || section.locked) return;

  const isArrayTrait = index !== undefined && index !== null;
  const currentTrait = isArrayTrait ? section.traits[index] : section[traitType];
  if (!currentTrait || currentTrait.locked) return;

  const poolName = TRAIT_POOL_MAP[`${sectionKey}:${traitType}`];
  const pool = poolName && DATA[poolName];
  if (!pool) return;

  pushHistory();

  // Build the set of texts to avoid: the current trait text plus any
  // siblings in the same array so we don't produce duplicates in one card.
  const avoid = new Set();
  avoid.add(currentTrait.text);
  if (isArrayTrait && section.traits) {
    section.traits.forEach((t, i) => {
      if (i !== index) avoid.add(t.text);
    });
  }

  const mood = getCurrentMood();
  const sampleSize = Math.min(16, pool.length);
  const candidates = getWeightedItems(pool, sampleSize, mood);
  let newText = currentTrait.text;
  for (const c of candidates) {
    if (!avoid.has(c.text)) {
      newText = c.text;
      break;
    }
  }

  let newSection;
  if (isArrayTrait) {
    newSection = {
      ...section,
      traits: section.traits.map((t, i) => i === index ? { ...t, text: newText } : t),
    };
  } else {
    newSection = {
      ...section,
      [traitType]: { ...section[traitType], text: newText },
    };
  }

  buildState = {
    ...buildState,
    timestamp: Date.now(),
    sections: { ...buildState.sections, [sectionKey]: newSection },
  };
  saveBuildState();
  renderCards();
}

// ============================================
// History / Undo
// ============================================

function pushHistory() {
  if (!buildState) return;
  history = [...history, JSON.parse(JSON.stringify(buildState))];
  if (history.length > MAX_HISTORY) {
    history = history.slice(history.length - MAX_HISTORY);
  }
  updateUndoButton();
}

function undo() {
  if (history.length === 0) return;
  const prev = history[history.length - 1];
  history = history.slice(0, -1);
  buildState = prev;
  saveBuildState();
  renderCards();
  updateUndoButton();
}

let undoLabelTimeout = null;
let undoHintShown = false;

function updateUndoButton() {
  const btn = document.getElementById('btn-undo');
  const shouldDisable = history.length === 0;
  ['btn-undo-bar', 'btn-undo-present'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = shouldDisable;
  });
  if (!btn) return;
  const wasDisabled = btn.disabled;
  btn.disabled = shouldDisable;
  btn.title = shouldDisable ? 'Nothing to undo yet' : 'Undo last change (Z)';

  // The first time undo becomes available, float its label under the button
  // for a moment so people learn it exists. It's positioned absolutely, so
  // nothing in the top bar moves.
  if (wasDisabled && !shouldDisable && !undoHintShown) {
    undoHintShown = true;
    btn.classList.add('btn-undo-label-visible');
    if (undoLabelTimeout) clearTimeout(undoLabelTimeout);
    undoLabelTimeout = setTimeout(() => {
      btn.classList.remove('btn-undo-label-visible');
    }, 1800);
  }
}

// ============================================
// Copy to Clipboard
// ============================================

// Brief checkmark-swap feedback on any copy button. The button's first
// material-symbols-outlined span swaps its textContent to "check" for 1s.
function flashCopyCheck(triggerEl) {
  if (!triggerEl) return;
  const icon = triggerEl.querySelector('.material-symbols-outlined');
  if (!icon) return;
  const original = icon.textContent;
  icon.textContent = 'check';
  icon.classList.add('icon-copied');
  setTimeout(() => {
    icon.textContent = original;
    icon.classList.remove('icon-copied');
  }, 1000);
}

// Clipboard write with a legacy fallback for browsers (or insecure origins)
// where navigator.clipboard is missing or refuses.
function copyText(text, successMsg, trigger) {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  };
  const done = ok => {
    showToast(ok ? successMsg : 'Copy failed. Select the text and copy it by hand.');
    if (ok) flashCopyCheck(trigger);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => done(true), () => done(fallback()));
  } else {
    done(fallback());
  }
}

function copyBuild(event) {
  if (!buildState) return;
  copyText(formatBuildText(), 'Copied as text', event?.currentTarget);
}

// Ordered rows for each section, shared by the text export and the image.
function sectionRows(key, section) {
  if (key === 'setting') {
    return [['WHEN:', section.when.text], ['WHERE:', section.where.text]];
  }
  const rows = (section.traits || []).map(t => ['>', t.text]);
  if (section.weakness) rows.push(['WEAK:', section.weakness.text]);
  if (section.trauma) rows.push(['TRAUMA:', section.trauma.text]);
  return rows;
}

function formatBuildText() {
  const s = buildState.sections;
  let text = 'POCKET DYSTOPIA - Story Seed\n============================\n\n';
  text += `${buildLoglineText(buildState)}\n\n`;
  text += SECTIONS.map(({ key, title }) =>
    `>> ${title}\n` + sectionRows(key, s[key]).map(([p, t]) => `${p} ${t}`).join('\n')
  ).join('\n\n');
  text += `\n\n${buildShareUrl(buildState)}\n`;
  return text;
}

// ============================================
// Share image (drawn on a canvas — no screenshot of the UI)
// ============================================

const SHARE_IMG_W = 1080;
const SHARE_IMG_H = 1350;

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Lays out (and, when draw is true, paints) the share card at a given type
// scale. Returns the content height so the caller can shrink to fit.
function layoutShareImage(ctx, state, scale, colors, draw) {
  const pad = 80;
  const width = SHARE_IMG_W - pad * 2;
  const mono = '"Atkinson Hyperlegible Mono", ui-monospace, monospace';
  const sans = '"Atkinson Hyperlegible Next", system-ui, sans-serif';
  let y = pad;

  const text = (str, font, color, x, yy) => {
    if (!draw) return;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(str, x, yy);
  };

  // Title
  const titleSize = Math.round(56 * scale);
  ctx.font = `700 ${titleSize}px ${mono}`;
  y += titleSize;
  text('Pocket Dystopia', ctx.font, colors.text, pad, y);
  // The wordmark's amber block cursor.
  const cursorX = pad + ctx.measureText('Pocket Dystopia').width + Math.round(6 * scale);
  if (draw) {
    ctx.fillStyle = colors.accentFill;
    ctx.fillRect(cursorX, y - titleSize * 0.74, Math.round(titleSize * 0.55), Math.round(titleSize * 0.86));
  }
  y += Math.round(36 * scale);

  // Logline: the headline of the card, no rule beside it.
  const logSize = Math.round(32 * scale);
  const logLead = Math.round(logSize * 1.4);
  ctx.font = `500 ${logSize}px ${sans}`;
  const logLines = wrapLines(ctx, buildLoglineText(state), width);
  logLines.forEach(l => { y += logLead; text(l, `500 ${logSize}px ${sans}`, colors.text, pad, y - logLead * 0.28); });
  y += Math.round(44 * scale);

  // Sections
  const headSize = Math.round(26 * scale);
  const rowSize = Math.round(25 * scale);
  const rowLead = Math.round(rowSize * 1.45);
  const labelW = Math.round(116 * scale);
  for (const { key, display } of SECTIONS) {
    const color = key === 'hero' ? colors.hero : key === 'villain' ? colors.villain : colors.text;
    y += headSize;
    text(display, `700 ${headSize}px ${sans}`, color, pad, y);
    y += Math.round(14 * scale);
    for (const [prefix, value] of sectionRows(key, state.sections[key])) {
      const indent = prefix === '>' ? Math.round(36 * scale) : labelW;
      ctx.font = `400 ${rowSize}px ${sans}`;
      const lines = wrapLines(ctx, value, width - indent);
      y += rowLead;
      text(prefix, `700 ${Math.round(rowSize * (prefix === '>' ? 1 : 0.78))}px ${mono}`, prefix === '>' ? colors.accent : colors.muted, pad, y - rowLead * 0.28);
      lines.forEach((l, i) => {
        if (i > 0) y += rowLead;
        text(l, `400 ${rowSize}px ${sans}`, colors.text, pad + indent, y - rowLead * 0.28);
      });
    }
    y += Math.round(30 * scale);
  }
  return y;
}

async function renderShareImage(state) {
  const css = getComputedStyle(document.documentElement);
  const v = name => css.getPropertyValue(name).trim();
  const colors = {
    bg: v('--bg-primary'), text: v('--text-primary'), muted: v('--text-tertiary'),
    accent: v('--accent-ink'), accentFill: v('--accent'), hero: v('--accent-hero'), villain: v('--accent-villain'),
  };
  if (document.fonts?.load) {
    await Promise.all([
      document.fonts.load('700 56px "Atkinson Hyperlegible Mono"'),
      document.fonts.load('400 22px "Atkinson Hyperlegible Mono"'),
      document.fonts.load('400 25px "Atkinson Hyperlegible Next"'),
      document.fonts.load('500 32px "Atkinson Hyperlegible Next"'),
      document.fonts.load('700 26px "Atkinson Hyperlegible Next"'),
    ]).catch(() => {});
  }
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_IMG_W;
  canvas.height = SHARE_IMG_H;
  const ctx = canvas.getContext('2d');
  const footer = 90;
  // Shrink the type until everything fits above the footer.
  let scale = 1;
  while (scale > 0.6 && layoutShareImage(ctx, state, scale, colors, false) > SHARE_IMG_H - footer) {
    scale -= 0.04;
  }
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, SHARE_IMG_W, SHARE_IMG_H);
  layoutShareImage(ctx, state, scale, colors, true);
  ctx.font = '400 22px "Atkinson Hyperlegible Mono", monospace';
  ctx.fillStyle = colors.muted;
  ctx.fillText(location.host || 'pocketdystopia.forhuman.ca', 80, SHARE_IMG_H - 56);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function saveScreenshot(event) {
  if (!buildState) return;
  const trigger = event?.currentTarget;
  try {
    const blob = await renderShareImage(buildState);
    if (!blob) throw new Error('no blob');
    const filename = `pocket-dystopia-${Date.now()}.png`;
    const file = typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null;
    // On phones the share sheet is the way to get an image into Photos.
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (coarse && file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Pocket Dystopia' });
        flashCopyCheck(trigger);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
        // NotAllowedError (the tap's activation expired while drawing) or
        // anything else: fall through to a plain download.
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Image saved');
    flashCopyCheck(trigger);
  } catch {
    showToast("Couldn't make the image");
  }
}

// ============================================
// Validation — every build that arrives from outside (a link, a pasted
// code, localStorage, a pin) goes through sanitizeBuild() before use.
// ============================================

const MAX_TRAIT_LEN = 200;
const BUILD_SHAPE = {
  setting: { fields: ['when', 'where'] },
  hero: { traits: 3, fields: ['weakness', 'trauma'] },
  villain: { traits: 3, fields: ['weakness'] },
  squad: { traits: 3, fields: [] },
  obstacles: { traits: 2, fields: [] },
};

// Every trait must be a real entry from its pool in data.js. The app never
// produces anything else, and this keeps a crafted link from putting
// arbitrary words into a classroom tool.
function sanitizeTrait(raw, pool) {
  if (!raw || typeof raw !== 'object') return null;
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!text || text.length > MAX_TRAIT_LEN) return null;
  if (!POOL_INDEX[pool]?.has(text)) return null;
  return { text, locked: raw.locked === true };
}

function sanitizeBuild(raw) {
  if (!raw || typeof raw !== 'object' || !raw.sections || typeof raw.sections !== 'object') return null;
  const sections = {};
  for (const [key, shape] of Object.entries(BUILD_SHAPE)) {
    const src = raw.sections[key];
    if (!src || typeof src !== 'object') return null;
    const out = { locked: src.locked === true };
    if (shape.traits) {
      if (!Array.isArray(src.traits) || src.traits.length !== shape.traits) return null;
      const traits = src.traits.map(t => sanitizeTrait(t, TRAIT_POOL_MAP[`${key}:traits`]));
      if (traits.some(t => !t)) return null;
      out.traits = traits;
    }
    for (const field of shape.fields) {
      const t = sanitizeTrait(src[field], TRAIT_POOL_MAP[`${key}:${field}`]);
      if (!t) return null;
      out[field] = t;
    }
    sections[key] = out;
  }
  return {
    version: 1,
    timestamp: Number.isFinite(raw.timestamp) ? raw.timestamp : Date.now(),
    mood: isMood(raw.mood) ? raw.mood : 'all',
    sections,
  };
}

// ============================================
// Share codes
// ============================================
//
// v2 (current): the build packed as bytes, base64url-encoded, ~30 chars.
//   [0] version (2)   [1] mood index   [2] section-lock bits
//   [3..4] trait-lock bits (little-endian, one per slot)   [5..20] pool index per slot
// Slots index into DATA, which is append-only for exactly this reason.
// v1 (legacy): base64 of URI-encoded JSON. Still decoded; produced only
// when a build holds text that isn't in DATA.

const CODE_V2 = 2;
// Fixed bit order for section locks — never derive this from display order.
const CODE_SECTION_ORDER = ['setting', 'hero', 'villain', 'squad', 'obstacles'];
const MOOD_ORDER = ['all', 'corporate', 'post-apocalyptic', 'ai-takeover', 'political'];
const CODE_SLOTS = [
  ['setting', 'when', null, 'times'],
  ['setting', 'where', null, 'settings'],
  ['hero', 'traits', 0, 'heroTraits'],
  ['hero', 'traits', 1, 'heroTraits'],
  ['hero', 'traits', 2, 'heroTraits'],
  ['hero', 'weakness', null, 'heroWeaknesses'],
  ['hero', 'trauma', null, 'heroTraumas'],
  ['villain', 'traits', 0, 'villainTraits'],
  ['villain', 'traits', 1, 'villainTraits'],
  ['villain', 'traits', 2, 'villainTraits'],
  ['villain', 'weakness', null, 'villainWeaknesses'],
  ['squad', 'traits', 0, 'squadMembers'],
  ['squad', 'traits', 1, 'squadMembers'],
  ['squad', 'traits', 2, 'squadMembers'],
  ['obstacles', 'traits', 0, 'obstacles'],
  ['obstacles', 'traits', 1, 'obstacles'],
];
const CODE_V2_LEN = 5 + CODE_SLOTS.length;

// text → index, per pool, built once.
const POOL_INDEX = Object.fromEntries(
  Object.entries(DATA).map(([pool, items]) => [pool, new Map(items.map((it, i) => [it.text, i]))])
);

function slotTrait(state, [section, field, index]) {
  const s = state.sections[section];
  return index === null ? s[field] : s[field]?.[index];
}

function bytesToBase64Url(bytes) {
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str) {
  const b64 = fromUrlSafeBase64(str);
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// Returns the v2 code, or null if the build can't be expressed as indices.
function encodeBuildV2(state) {
  const shape = BUILD_SHAPE;
  for (const [key, def] of Object.entries(shape)) {
    if (def.traits && state.sections[key].traits.length !== def.traits) return null;
  }
  const bytes = new Uint8Array(CODE_V2_LEN);
  bytes[0] = CODE_V2;
  bytes[1] = Math.max(0, MOOD_ORDER.indexOf(state.mood || 'all'));
  bytes[2] = CODE_SECTION_ORDER.reduce((bits, key, i) => bits | (state.sections[key].locked ? 1 << i : 0), 0);
  let traitBits = 0;
  for (let i = 0; i < CODE_SLOTS.length; i++) {
    const slot = CODE_SLOTS[i];
    const trait = slotTrait(state, slot);
    const idx = trait ? POOL_INDEX[slot[3]].get(trait.text) : undefined;
    if (idx === undefined || idx > 255) return null;
    bytes[5 + i] = idx;
    if (trait.locked) traitBits |= 1 << i;
  }
  bytes[3] = traitBits & 0xff;
  bytes[4] = (traitBits >> 8) & 0xff;
  return bytesToBase64Url(bytes);
}

function decodeBuildV2(code) {
  let bytes;
  try { bytes = base64UrlToBytes(code); } catch { return null; }
  if (bytes.length !== CODE_V2_LEN || bytes[0] !== CODE_V2) return null;
  const traitBits = bytes[3] | (bytes[4] << 8);
  const sections = {
    setting: {}, hero: { traits: [] }, villain: { traits: [] }, squad: { traits: [] }, obstacles: { traits: [] },
  };
  for (let i = 0; i < CODE_SLOTS.length; i++) {
    const [section, field, index, pool] = CODE_SLOTS[i];
    const item = DATA[pool][bytes[5 + i]];
    if (!item) return null;
    const trait = { text: item.text, locked: Boolean(traitBits & (1 << i)) };
    if (index === null) sections[section][field] = trait;
    else sections[section][field][index] = trait;
  }
  CODE_SECTION_ORDER.forEach((key, i) => { sections[key].locked = Boolean(bytes[2] & (1 << i)); });
  return sanitizeBuild({ version: 1, timestamp: Date.now(), mood: MOOD_ORDER[bytes[1]] || 'all', sections });
}

function encodeBuildV1(state) {
  return btoa(encodeURIComponent(JSON.stringify(state)));
}

function decodeBuildV1(code) {
  try {
    return sanitizeBuild(JSON.parse(decodeURIComponent(atob(code))));
  } catch {
    return null;
  }
}

// URL-safe base64 — some platforms mangle + / = in query strings and fragments.
function toUrlSafeBase64(code) {
  return code.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromUrlSafeBase64(urlSafe) {
  let s = urlSafe.replace(/-/g, '+').replace(/_/g, '/');
  // Restore = padding to a multiple of 4.
  while (s.length % 4 !== 0) s += '=';
  return s;
}

// The code shown in the share dialog. v2 when possible.
function encodeBuild(state) {
  return encodeBuildV2(state) || toUrlSafeBase64(encodeBuildV1(state));
}

function buildShareUrl(state) {
  const v2 = encodeBuildV2(state);
  const hash = v2 ? `b=${v2}` : `build=${toUrlSafeBase64(encodeBuildV1(state))}`;
  return `${location.origin}${location.pathname}#${hash}`;
}

// Accepts anything a person might paste: a full link (#b= or legacy
// #build=), a bare v2 code, or a bare legacy code (plain or URL-safe base64).
function decodeAnyCode(input) {
  try {
    return decodeAnyCodeUnsafe(input);
  } catch {
    return null;
  }
}

function decodeAnyCodeUnsafe(input) {
  // Mail clients wrap long links — whitespace is never part of a code.
  const str = String(input || '').replace(/\s+/g, '');
  if (!str) return null;
  const v2Hash = str.match(/#b=([A-Za-z0-9_-]+)/);
  if (v2Hash) return decodeBuildV2(v2Hash[1]);
  const v1Hash = str.match(/#build=([A-Za-z0-9_\-+/=%]+)/);
  if (v1Hash) return decodeBuildV1(fromUrlSafeBase64(decodeURIComponent(v1Hash[1])));
  return decodeBuildV2(str) || decodeBuildV1(str) || decodeBuildV1(fromUrlSafeBase64(str));
}

// Replaces the current build with a loaded one, keeping it undoable.
function adoptLoadedBuild(state) {
  if (buildState) pushHistory();
  buildState = state;
  isFirstRoll = false;
  if (state.mood && state.mood !== currentMood) {
    savePrefs({ ...loadPrefs(), mood: state.mood });
    applyMood(state.mood, { skipReroll: true });
  }
  saveBuildState();
  showResults();
  renderCards();
}

function tryLoadFromHash() {
  const hash = window.location.hash || '';
  if (!/^#(b|build)=/.test(hash)) return false;

  const hadBuild = Boolean(buildState);
  const decoded = decodeAnyCode(hash);
  // Always strip the hash so a reload doesn't re-trigger, even on failure.
  // Use window.history explicitly — `history` is shadowed by the undo stack.
  window.history.replaceState(null, '', window.location.pathname);

  if (!decoded) {
    // Delay the toast so it doesn't fire before the intro paints.
    setTimeout(() => showToast(hadBuild
      ? "That link didn't work. Here's your last build."
      : "That link didn't work. Starting fresh."), 300);
    return false;
  }

  adoptLoadedBuild(decoded);
  if (hadBuild) setTimeout(() => showToast('Shared build loaded. Undo to go back.'), 300);
  return true;
}

function openShareModal() {
  if (!buildState) return;
  document.getElementById('share-code').value = encodeBuild(buildState);

  // Show Web Share button only if the browser supports the API.
  const webShareBtn = document.getElementById('share-web-share');
  if (webShareBtn) {
    webShareBtn.hidden = typeof navigator.share !== 'function';
  }

  // Collapse the "Or share as code" disclosure by default.
  const disclosure = document.getElementById('share-code-disclosure');
  const codeBlock = document.getElementById('share-code-block');
  if (disclosure && codeBlock) {
    disclosure.setAttribute('aria-expanded', 'false');
    codeBlock.hidden = true;
  }

  openModal(document.getElementById('share-modal'));
}

function closeShareModal() {
  closeModal(document.getElementById('share-modal'));
}

function toggleShareCodeDisclosure() {
  const disclosure = document.getElementById('share-code-disclosure');
  const codeBlock = document.getElementById('share-code-block');
  if (!disclosure || !codeBlock) return;
  const expanded = disclosure.getAttribute('aria-expanded') === 'true';
  const next = !expanded;
  disclosure.setAttribute('aria-expanded', String(next));
  codeBlock.hidden = !next;
}

async function shareViaWebShareApi() {
  if (!buildState || typeof navigator.share !== 'function') return;
  const url = buildShareUrl(buildState);
  try {
    await navigator.share({
      title: 'Pocket Dystopia: my build',
      text: buildLoglineText(buildState),
      url,
    });
  } catch {
    // User cancelled or share failed — silently ignore.
  }
}

function copyShareLink(event) {
  if (!buildState) return;
  copyText(buildShareUrl(buildState), 'Link copied', event?.currentTarget);
}

function copyShareCode(event) {
  const input = document.getElementById('share-code');
  copyText(input.value, 'Code copied', event?.currentTarget);
}

function toggleLoadDisclosure() {
  const btn = document.getElementById('intro-load-disclosure');
  const body = document.getElementById('intro-load-body');
  if (!btn || !body) return;
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  const next = !expanded;
  btn.setAttribute('aria-expanded', String(next));
  body.hidden = !next;
  if (next) {
    // Autofocus the input once the disclosure opens so the user can paste.
    setTimeout(() => document.getElementById('load-input')?.focus(), 0);
  }
}

function loadBuildFromInput() {
  const input = document.getElementById('load-input');
  const errorEl = document.getElementById('load-error');
  const code = input.value.trim();

  if (!code) {
    errorEl.textContent = 'Paste a link or code first.';
    input.focus();
    return;
  }

  const decoded = decodeAnyCode(code);
  if (!decoded) {
    errorEl.textContent = "That code didn't work. Paste the whole link or code exactly as it was shared.";
    input.setAttribute('aria-invalid', 'true');
    return;
  }

  errorEl.textContent = '';
  input.removeAttribute('aria-invalid');
  input.value = '';
  const hadBuild = Boolean(buildState);
  adoptLoadedBuild(decoded);
  showToast(hadBuild ? 'Build loaded. Undo to go back.' : 'Build loaded');
}

// ============================================
// Persistence
// ============================================

function saveBuildState() {
  if (!buildState) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildState));
  } catch {
    // Storage full or blocked (private mode) — the build still works this session.
  }
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeBuild(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

// ============================================
// Reset
// ============================================

function confirmReset() {
  openModal(document.getElementById('confirm-overlay'));
}

function closeConfirm() {
  const overlay = document.getElementById('confirm-overlay');
  closeModal(overlay);
  // If the dialog was in pin-delete mode, restore the default reset wiring.
  if (overlay.dataset.mode === 'pin-delete') {
    delete overlay.dataset.mode;
    pendingDeleteIndex = null;
    const yes = document.getElementById('confirm-yes');
    if (yes) {
      yes.textContent = 'Clear it';
      yes.onclick = executeReset;
    }
    const title = document.getElementById('confirm-title');
    if (title && confirmDefaults) title.textContent = confirmDefaults.title;
    const msg = document.getElementById('confirm-msg');
    if (msg && confirmDefaults) msg.textContent = confirmDefaults.msg;
  }
}

function executeReset() {
  closeConfirm();
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked */ }
  buildState = null;
  history = [];
  showIntro();
  showToast('Build cleared');
}

// ============================================
// Toast
// ============================================

let toastTimeout = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  // Clear then set so an identical string is re-announced by live regions.
  toast.textContent = '';
  // Force reflow before re-setting so AT treats it as a new message.
  void toast.offsetWidth;
  toast.textContent = message;
  toast.classList.add('visible');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2000);
}

// Silent announcement for non-visual state changes (lock toggles, logline
// updates). Same clear-then-set pattern so duplicates re-announce.
function announce(message) {
  const el = document.getElementById('sr-announce');
  if (!el) return;
  el.textContent = '';
  void el.offsetWidth;
  el.textContent = message;
}

// ============================================
// Shake to Roll (Mobile)
// ============================================
//
// A More-menu toggle, shown only on touch devices with motion sensors.
// iOS needs a permission prompt, so there it's off until the user switches
// it on (the toggle tap is the user gesture the prompt requires). Elsewhere
// it defaults to on.

const SHAKE_THRESHOLD = 15;
const SHAKE_COOLDOWN_MS = 1000;
let shakeEnabled = false;
let shakeListening = false;
let lastShake = 0;

function shakeSupported() {
  return typeof DeviceMotionEvent !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

function shakeNeedsPermission() {
  return typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';
}

function handleMotion(e) {
  const acc = e.accelerationIncludingGravity;
  if (!acc || anyModalOpen()) return;
  const { x, y, z } = acc;
  if (Math.abs(x) > SHAKE_THRESHOLD || Math.abs(y) > SHAKE_THRESHOLD || Math.abs(z) > SHAKE_THRESHOLD) {
    const now = Date.now();
    if (now - lastShake > SHAKE_COOLDOWN_MS) {
      lastShake = now;
      rollDie();
    }
  }
}

function setShakeListening(on) {
  if (on && !shakeListening) window.addEventListener('devicemotion', handleMotion);
  if (!on && shakeListening) window.removeEventListener('devicemotion', handleMotion);
  shakeListening = on;
}

async function requestMotionPermission() {
  if (!shakeNeedsPermission()) return true;
  try {
    return (await DeviceMotionEvent.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

function initShakeDetection() {
  if (!shakeSupported()) return;
  const prefs = loadPrefs();
  shakeEnabled = typeof prefs.shake === 'boolean' ? prefs.shake : !shakeNeedsPermission();
  updateMoreMenuState();
  if (!shakeEnabled) return;
  if (shakeNeedsPermission()) {
    // Already opted in on iOS: re-confirm on the first tap of this visit
    // (no prompt appears once access was granted).
    document.addEventListener('click', async () => {
      if (!shakeEnabled) return;
      if (await requestMotionPermission()) {
        setShakeListening(true);
      } else {
        shakeEnabled = false;
        savePrefs({ ...loadPrefs(), shake: false });
        updateMoreMenuState();
      }
    }, { once: true });
  } else {
    setShakeListening(true);
  }
}

async function toggleShake() {
  if (!shakeEnabled) {
    if (!(await requestMotionPermission())) {
      showToast('Motion access is off. Allow it in Settings to shake to roll.');
      return;
    }
    shakeEnabled = true;
    setShakeListening(true);
    showToast('Shake your phone to roll');
  } else {
    shakeEnabled = false;
    setShakeListening(false);
  }
  savePrefs({ ...loadPrefs(), shake: shakeEnabled });
  updateMoreMenuState();
}

// ============================================
// Keyboard Support
// ============================================

function initKeyboard() {
  document.getElementById('load-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadBuildFromInput();
    }
  });

  document.getElementById('die-container')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      rollDie();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // One layer at a time: the open menu, else the topmost dialog (so
      // Escape on the pin-delete confirm returns to the pinned panel).
      if (moreMenuOpen) {
        closeMoreMenu();
        return;
      }
      if (isPresenting() && modalFocusStack[modalFocusStack.length - 1]?.modalEl.id === 'present-view') {
        closePresent();
        return;
      }
      const top = modalFocusStack[modalFocusStack.length - 1];
      if (!top) return;
      const closers = {
        'share-modal': closeShareModal,
        'confirm-overlay': closeConfirm,
        'pinned-modal': closePinnedPanel,
        'shortcuts-modal': closeShortcutsPanel,
      };
      (closers[top.modalEl.id] || (() => closeModal(top.modalEl)))();
    }
  });
}

// ============================================
// Home / Pinned Panel stubs
// ============================================

// Non-destructive home: goes back to the intro without touching the saved build.
function goHome() {
  closeMoreMenu();
  showIntro();
}

// ============================================
// Pinned Builds (6-slot system)
// ============================================

const PINS_KEY = 'pocket-dystopia-pins';
const PIN_SLOTS = 6;
const MAX_PIN_LABEL = 60;
let pinnedReplaceMode = false;

function loadPins() {
  try {
    const raw = localStorage.getItem(PINS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.slots) && parsed.slots.length === PIN_SLOTS) {
        // Pins are external data too — validate each one.
        const slots = parsed.slots.map(slot => {
          const state = slot && sanitizeBuild(slot.state);
          if (!state) return null;
          const label = typeof slot.label === 'string' ? slot.label.trim().slice(0, MAX_PIN_LABEL) : '';
          return {
            state,
            label: label || defaultPinLabel(state),
            createdAt: Number.isFinite(slot.createdAt) ? slot.createdAt : Date.now(),
          };
        });
        return { version: 1, slots };
      }
    }
  } catch {
    // Ignore, fall through to default.
  }
  return { version: 1, slots: Array(PIN_SLOTS).fill(null) };
}

function savePins(pins) {
  try {
    localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  } catch {
    showToast("Couldn't save pins (storage is full or blocked)");
  }
}

function defaultPinLabel(state) {
  const text = capitalize(state?.sections?.hero?.traits?.[0]?.text || 'Build');
  return text.length > 40 ? text.slice(0, 40) + '…' : text;
}

// Second line on a pin, so two pins with the same hero still look different.
function pinSubtitle(state) {
  const where = state?.sections?.setting?.where?.text || '';
  return where.length > 48 ? where.slice(0, 48) + '…' : where;
}

// Index of the pin holding exactly this build's traits, or -1.
function findPinnedSlot(state, pins = loadPins()) {
  if (!state) return -1;
  // Order-independent: a sanitized build lists its sections in a different
  // key order than a freshly rolled one.
  const traitKey = st => {
    const snap = snapshotTraitTexts(st);
    return Object.keys(snap).sort().map(k => `${k}=${snap[k]}`).join('\n');
  };
  const key = traitKey(state);
  return pins.slots.findIndex(slot => slot && traitKey(slot.state) === key);
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function openPinnedPanel() {
  pinnedReplaceMode = false;
  renderPinnedSlots();
  openModal(document.getElementById('pinned-modal'));
}

function closePinnedPanel() {
  closeModal(document.getElementById('pinned-modal'));
  pinnedReplaceMode = false;
}

function cancelReplaceMode() {
  pinnedReplaceMode = false;
  renderPinnedSlots();
}

// After a pin action re-renders the slots, the focused control is gone.
// Put focus back on the same slot (first usable control), else the panel's
// close button, so it never falls behind the overlay. Runs after
// closeModal()'s own deferred focus restore.
function refocusPinned(index) {
  setTimeout(() => {
    const modal = document.getElementById('pinned-modal');
    if (!modal?.classList.contains('active')) return;
    const slot = document.querySelector(`#pinned-slots > :nth-child(${index + 1})`);
    const target = slot && (slot.matches('button:not([disabled])') ? slot : getFocusable(slot)[0]);
    (target || modal.querySelector('.modal-header .btn-icon'))?.focus();
  }, 20);
}

function renderPinnedSlots() {
  const container = document.getElementById('pinned-slots');
  const description = document.getElementById('pinned-description');
  const actions = document.getElementById('pinned-modal-actions');
  const pinBtn = document.getElementById('pin-current-btn');
  const pinLabel = document.getElementById('pin-current-label');
  if (!container || !description) return;

  const pins = loadPins();
  const filled = pins.slots.filter(s => s !== null);
  const allEmpty = filled.length === 0;
  const allFull = filled.length === PIN_SLOTS;
  const pinnedAt = findPinnedSlot(buildState, pins);

  if (pinnedReplaceMode) {
    description.textContent = 'All 6 slots are full. Pick one to replace with this build.';
    if (actions) actions.hidden = false;
  } else if (allEmpty) {
    description.textContent = 'Six slots for builds you want to keep. They stay on this device.';
    if (actions) actions.hidden = true;
  } else {
    description.textContent = '';
    if (actions) actions.hidden = true;
  }

  if (pinBtn && pinLabel) {
    pinBtn.hidden = pinnedReplaceMode;
    const already = pinnedAt !== -1;
    pinBtn.disabled = !buildState || already;
    pinLabel.textContent = already
      ? `Pinned in slot ${pinnedAt + 1}`
      : (allFull ? 'Pin this build (replace one)' : 'Pin this build');
  }

  container.innerHTML = pins.slots.map((slot, i) => renderPinSlot(slot, i, pinnedReplaceMode, i === pinnedAt, pinnedAt !== -1)).join('');
}

function renderPinSlot(slot, index, replaceMode, isCurrent, alreadyPinned) {
  if (!slot) {
    const disabled = !buildState || replaceMode || alreadyPinned;
    const title = !buildState ? 'Roll something first'
      : alreadyPinned ? 'This build is already pinned'
      : `Pin current build to slot ${index + 1}`;
    return `
      <button type="button" class="pin-slot pin-slot-empty${disabled ? ' disabled' : ''}"
        onclick="pinCurrentToSlot(${index})"
        ${disabled ? 'disabled' : ''}
        aria-label="${title}"
        title="${title}">
        <span class="material-symbols-outlined" aria-hidden="true">add</span>
      </button>
    `;
  }

  const label = escapeHtml(slot.label || defaultPinLabel(slot.state));
  const subtitle = escapeHtml(pinSubtitle(slot.state));
  const when = relativeTime(slot.createdAt);

  if (replaceMode) {
    return `
      <button type="button" class="pin-slot pin-slot-filled pin-slot-replace"
        onclick="replaceSlot(${index})"
        aria-label="Replace slot ${index + 1}: ${label}"
        title="Replace this one">
        <span class="pin-slot-label">${label}</span>
        <span class="pin-slot-subtitle">${subtitle}</span>
        <span class="pin-slot-time">${when}</span>
        <span class="pin-slot-replace-overlay" aria-hidden="true">Replace this one</span>
      </button>
    `;
  }

  return `
    <div class="pin-slot pin-slot-filled${isCurrent ? ' pin-slot-current' : ''}" data-slot="${index}">
      <div class="pin-slot-body">
        <div class="pin-slot-label-row">
          <span class="pin-slot-label" data-pin-label="${index}">${label}</span>
          <input type="text" class="pin-slot-label-input" data-pin-input="${index}"
            value="${label}" placeholder="Name this build" maxlength="${MAX_PIN_LABEL}"
            aria-label="Name for slot ${index + 1}" hidden>
        </div>
        <span class="pin-slot-subtitle">${subtitle}</span>
        <span class="pin-slot-time">${isCurrent ? 'On screen now · ' : ''}${when}</span>
      </div>
      <div class="pin-slot-actions">
        <button type="button" class="btn-secondary pin-slot-load" onclick="loadPin(${index})"
          aria-label="Load slot ${index + 1}: ${label}"${isCurrent ? ' disabled' : ''}>
          <span>Load</span>
          <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
        </button>
        <button type="button" class="btn-icon" onclick="startRenamePin(${index})"
          aria-label="Rename slot ${index + 1}" title="Rename">
          <span class="material-symbols-outlined" aria-hidden="true">edit</span>
        </button>
        <button type="button" class="btn-icon" onclick="confirmDeletePin(${index})"
          aria-label="Delete slot ${index + 1}" title="Delete">
          <span class="material-symbols-outlined" aria-hidden="true">delete</span>
        </button>
      </div>
    </div>
  `;
}

function makePin(state) {
  return {
    state: JSON.parse(JSON.stringify(state)),
    label: defaultPinLabel(state),
    createdAt: Date.now(),
  };
}

function pinCurrentToSlot(index) {
  if (!buildState) return;
  const pins = loadPins();
  if (pins.slots[index] !== null) return;
  const existing = findPinnedSlot(buildState, pins);
  if (existing !== -1) {
    showToast(`Already pinned in slot ${existing + 1}`);
    return;
  }
  savePins({ ...pins, slots: pins.slots.map((s, i) => i === index ? makePin(buildState) : s) });
  renderPinnedSlots();
  refocusPinned(index);
  showToast(`Pinned to slot ${index + 1}`);
}

// "Pin this build" button and the P shortcut: first free slot, or replace
// mode when all six are full.
function pinCurrentBuild() {
  if (!buildState) return;
  const pins = loadPins();
  const existing = findPinnedSlot(buildState, pins);
  if (existing !== -1) {
    showToast(`Already pinned in slot ${existing + 1}`);
    return;
  }
  const firstEmpty = pins.slots.findIndex(s => s === null);
  if (firstEmpty === -1) {
    pinnedReplaceMode = true;
    renderPinnedSlots();
    const modal = document.getElementById('pinned-modal');
    if (!modal.classList.contains('active')) openModal(modal);
    return;
  }
  pinCurrentToSlot(firstEmpty);
}

function replaceSlot(index) {
  if (!buildState) return;
  const pins = loadPins();
  savePins({ ...pins, slots: pins.slots.map((s, i) => i === index ? makePin(buildState) : s) });
  pinnedReplaceMode = false;
  renderPinnedSlots();
  refocusPinned(index);
  showToast(`Replaced slot ${index + 1}`);
}

function loadPin(index) {
  const slot = loadPins().slots[index];
  if (!slot) return;
  const hadBuild = Boolean(buildState);
  closePinnedPanel();
  adoptLoadedBuild(JSON.parse(JSON.stringify(slot.state)));
  showToast(hadBuild ? `Loaded slot ${index + 1}. Undo to go back.` : `Loaded slot ${index + 1}`);
}

function startRenamePin(index) {
  const labelEl = document.querySelector(`[data-pin-label="${index}"]`);
  const inputEl = document.querySelector(`[data-pin-input="${index}"]`);
  if (!labelEl || !inputEl) return;
  const original = labelEl.textContent;
  labelEl.hidden = true;
  inputEl.hidden = false;
  inputEl.focus();
  inputEl.select();

  const commit = () => {
    const pins = loadPins();
    const slot = pins.slots[index];
    if (!slot) return;
    const newLabel = inputEl.value.trim().slice(0, MAX_PIN_LABEL) || defaultPinLabel(slot.state);
    savePins({ ...pins, slots: pins.slots.map((s, i) => i === index ? { ...s, label: newLabel } : s) });
    renderPinnedSlots();
    refocusPinned(index);
  };

  inputEl.addEventListener('blur', commit, { once: true });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inputEl.blur();
    } else if (e.key === 'Escape') {
      // Cancel the rename only — don't let Escape close the whole panel.
      e.preventDefault();
      e.stopPropagation();
      inputEl.value = original;
      inputEl.blur();
    }
  });
}

let pendingDeleteIndex = null;
// The reset dialog's own wording, read from index.html once so pin-delete
// mode can borrow the dialog and hand it back unchanged.
let confirmDefaults = null;

function confirmDeletePin(index) {
  if (!confirmDefaults) {
    confirmDefaults = {
      title: document.getElementById('confirm-title')?.textContent || '',
      msg: document.getElementById('confirm-msg')?.textContent || '',
    };
  }
  pendingDeleteIndex = index;
  const overlay = document.getElementById('confirm-overlay');
  const title = document.getElementById('confirm-title');
  const msg = document.getElementById('confirm-msg');
  const yes = document.getElementById('confirm-yes');
  if (title) title.textContent = `Delete slot ${index + 1}?`;
  if (msg) msg.textContent = "This slot will be empty again. Your other pins and your current build aren't affected.";
  if (yes) {
    yes.textContent = 'Delete';
    yes.onclick = executePinDelete;
  }
  overlay.dataset.mode = 'pin-delete';
  openModal(overlay);
}

function executePinDelete() {
  if (pendingDeleteIndex === null) return;
  const pins = loadPins();
  const index = pendingDeleteIndex;
  savePins({ ...pins, slots: pins.slots.map((s, i) => i === index ? null : s) });
  closeConfirm();
  renderPinnedSlots();
  refocusPinned(index);
  showToast(`Slot ${index + 1} is empty again`);
}

// ============================================
// Classroom: Present view + printable worksheet
// ============================================

let presentEnteredFullscreen = false;

function isPresenting() {
  return document.getElementById('present-view')?.classList.contains('active') || false;
}

// Snapshot key and lock state for each row, in sectionRows() order.
function presentRowMeta(key, section) {
  if (key === 'setting') {
    return [['setting:when', section.when.locked], ['setting:where', section.where.locked]];
  }
  const meta = (section.traits || []).map((t, i) => [`${key}:traits:${i}`, t.locked]);
  if (section.weakness) meta.push([`${key}:weakness`, section.weakness.locked]);
  if (section.trauma) meta.push([`${key}:trauma`, section.trauma.locked]);
  return meta;
}

function presentSectionHtml(key, title, section, changedKeys, order) {
  const meta = presentRowMeta(key, section);
  const rows = sectionRows(key, section).map(([prefix, text], i) => {
    const [snapKey, locked] = meta[i];
    const changed = changedKeys?.has(snapKey) ? ' present-enter' : '';
    const delay = changed ? ` style="--i:${order.next++}"` : '';
    const held = locked || section.locked ? ' present-held' : '';
    const label = prefix === '>'
      ? '<span class="present-prefix" aria-hidden="true">&gt;</span>'
      : `<span class="present-label">${escapeHtml(prefix)}</span>`;
    return `<li class="present-row${changed}${held}"${delay}>${label}<span>${escapeHtml(text)}</span></li>`;
  }).join('');
  const lock = section.locked
    ? ' <span class="material-symbols-outlined icon-filled present-lock" aria-label="locked">lock</span>'
    : '';
  return `
    <section class="present-card present-card-${key}${section.locked ? ' present-card-locked' : ''}">
      <h2 class="present-card-title">${title}${lock}</h2>
      <ul class="present-rows">${rows}</ul>
    </section>`;
}

function renderPresent(changedKeys) {
  const inner = document.getElementById('present-inner');
  if (!inner || !buildState) return;
  const logChanged = changedKeys && LOGLINE_SOURCE_KEYS.some(k => changedKeys.has(k));
  const order = { next: logChanged ? 1 : 0 };
  inner.innerHTML = `
    <p class="present-brand">Pocket Dystopia</p>
    <p class="present-logline${logChanged ? ' present-enter' : ''}">${escapeHtml(buildLoglineText(buildState))}</p>
    <div class="present-grid">
      ${SECTIONS.map(({ key, display }) => presentSectionHtml(key, display, buildState.sections[key], changedKeys, order)).join('')}
    </div>`;
  fitPresent();
}

// Shrinks the type until the whole build fits the screen without scrolling.
function fitPresent() {
  const inner = document.getElementById('present-inner');
  if (!inner || !isPresenting()) return;
  let scale = 1;
  inner.style.setProperty('--present-scale', String(scale));
  // Narrow screens stack and scroll instead (see styles.css) — shrinking
  // the type there would only make it unreadable.
  if (window.matchMedia('(max-width: 760px)').matches) return;
  while (scale > 0.45 && inner.scrollHeight > inner.clientHeight + 1) {
    scale -= 0.05;
    inner.style.setProperty('--present-scale', scale.toFixed(2));
  }
}

function openPresent() {
  if (!buildState) return;
  const view = document.getElementById('present-view');
  if (!view || isPresenting()) return;
  closeMoreMenu();
  // A hidden menu item can't take focus back on exit; use the More button.
  const active = document.activeElement;
  if (!active || active.offsetParent === null) document.getElementById('btn-more')?.focus();
  openModal(view);
  renderPresent(null);
  // Start on Roll (Undo may be enabled and would otherwise come first).
  setTimeout(() => view.querySelector('.present-controls .btn-primary')?.focus(), 0);
  presentEnteredFullscreen = false;
  const root = document.documentElement;
  if (root.requestFullscreen && !document.fullscreenElement) {
    root.requestFullscreen().then(() => {
      // Closed again before fullscreen kicked in (F pressed twice quickly).
      if (!isPresenting()) {
        document.exitFullscreen?.().catch(() => {});
        return;
      }
      presentEnteredFullscreen = true;
      fitPresent();
    }).catch(() => {});
  }
  document.fonts?.ready.then(fitPresent);
}

function closePresent() {
  const view = document.getElementById('present-view');
  if (!view || !isPresenting()) return;
  closeModal(view);
  if (presentEnteredFullscreen && document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
  presentEnteredFullscreen = false;
}

// --- Printable worksheet ---

function buildPrintSheetHtml(state) {
  const s = state.sections;
  const lines = n => '<div class="ws-line"></div>'.repeat(n);
  const prompts = [
    `Set the scene. Describe ${s.setting.where.text} using three of your five senses.`,
    `Introduce your hero ("${s.hero.traits[0].text}"). Show that trait through something they do. Don't just say it.`,
    'Write the moment the hero first meets the villain. What does each of them notice?',
    'The squad arrives. Who actually helps, and who makes everything worse?',
    `Obstacle: ${s.obstacles.traits[0].text}. How do they get past it?`,
    'The ending. Does the hero win, lose, or something stranger? Use the hero\'s weakness.',
  ];
  const sectionsHtml = SECTIONS.map(({ key, display }) => `
    <div class="ws-section">
      <h3>${display}</h3>
      <ul>${sectionRows(key, s[key]).map(([p, t]) => `<li>${p === '>' ? '' : `<b>${escapeHtml(p)}</b> `}${escapeHtml(t)}</li>`).join('')}</ul>
    </div>`).join('');
  return `
    <header class="ws-header">
      <h1>Pocket Dystopia · Story seed</h1>
      <div class="ws-name"><span>Name</span><span class="ws-blank"></span><span>Date</span><span class="ws-blank ws-blank-short"></span></div>
    </header>
    <p class="ws-logline">${escapeHtml(buildLoglineText(state))}</p>
    <div class="ws-sections">${sectionsHtml}</div>
    <h2 class="ws-turn">Your turn</h2>
    <ol class="ws-prompts">
      ${prompts.map(p => `<li><p>${escapeHtml(p)}</p>${lines(4)}</li>`).join('')}
    </ol>
    <footer class="ws-footer">Open this exact seed: ${escapeHtml(buildShareUrl(state))}</footer>`;
}

// Filled right before printing (menu item, or Cmd/Ctrl+P via beforeprint).
// Without a build the page prints as-is.
function preparePrintSheet() {
  const sheet = document.getElementById('print-sheet');
  if (!sheet) return;
  const onResults = document.getElementById('results-screen')?.classList.contains('active');
  if (buildState && onResults) {
    sheet.innerHTML = buildPrintSheetHtml(buildState);
    document.documentElement.classList.add('has-print-sheet');
  } else {
    sheet.innerHTML = '';
    document.documentElement.classList.remove('has-print-sheet');
  }
}

function printWorksheet() {
  if (!buildState) return;
  preparePrintSheet();
  if (!document.documentElement.classList.contains('has-print-sheet')) return;
  window.print();
}

// ============================================
// More Menu
// ============================================

let moreMenuOpen = false;

function toggleMoreMenu(event) {
  if (event) event.stopPropagation();
  if (moreMenuOpen) closeMoreMenu();
  else openMoreMenu();
}

function openMoreMenu() {
  const menu = document.getElementById('more-menu');
  const btn = document.getElementById('btn-more');
  if (!menu || !btn) return;
  menu.hidden = false;
  moreMenuOpen = true;
  btn.setAttribute('aria-expanded', 'true');
  updateMoreMenuState();
  // Focus the first visible menu item for keyboard users.
  const firstItem = menu.querySelector('[role="menuitem"]:not([hidden]), [role="menuitemcheckbox"]:not([hidden])');
  if (firstItem) firstItem.focus();
}

function closeMoreMenu() {
  const menu = document.getElementById('more-menu');
  const btn = document.getElementById('btn-more');
  if (!menu || !btn) return;
  if (!moreMenuOpen) return;
  menu.hidden = true;
  moreMenuOpen = false;
  btn.setAttribute('aria-expanded', 'false');
}

function handleMenuAction(action) {
  switch (action) {
    case 'theme':
      toggleTheme();
      closeMoreMenu();
      return;
    case 'lefthanded':
      toggleLeftHanded();
      // Keep the menu open so the user can see the checked state flip.
      return;
    case 'shake':
      // Stays open so the checkmark flip is visible (like left-handed).
      toggleShake();
      return;
    case 'present':
      closeMoreMenu();
      openPresent();
      return;
    case 'print':
      closeMoreMenu();
      printWorksheet();
      return;
    case 'shortcuts':
      closeMoreMenu();
      openShortcutsPanel();
      return;
    case 'clear':
      closeMoreMenu();
      confirmReset();
      return;
  }
}

// ============================================
// Modal Focus Management (a11y)
// ============================================
//
// For each open modal we remember the trigger element, move focus to the
// first focusable inside, and restore focus on close. Tab / Shift+Tab are
// trapped inside the modal to respect aria-modal="true".

const modalFocusStack = [];

function getFocusable(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => el.offsetParent !== null);
}

function openModal(modalEl) {
  if (!modalEl) return;
  const trigger = document.activeElement;
  modalFocusStack.push({ modalEl, trigger });
  modalEl.classList.add('active');
  // Move initial focus to first focusable inside (fallback: the modal itself).
  const focusables = getFocusable(modalEl);
  const target = focusables[0] || modalEl;
  // Defer so display flip has settled.
  setTimeout(() => target.focus?.(), 0);
}

function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove('active');
  const idx = modalFocusStack.findIndex(f => f.modalEl === modalEl);
  if (idx === -1) return;
  const { trigger } = modalFocusStack[idx];
  modalFocusStack.splice(idx, 1);
  // Restore focus to the trigger that opened the modal.
  if (trigger && typeof trigger.focus === 'function') {
    setTimeout(() => trigger.focus(), 0);
  }
}

function trapTab(e, modalEl) {
  if (e.key !== 'Tab') return;
  const focusables = getFocusable(modalEl);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function initModalFocusTrap() {
  const modals = ['share-modal', 'pinned-modal', 'shortcuts-modal', 'confirm-overlay', 'present-view'];
  for (const id of modals) {
    const m = document.getElementById(id);
    if (!m) continue;
    m.addEventListener('keydown', (e) => {
      if (m.classList.contains('active')) trapTab(e, m);
    });
  }
}

// ============================================
// Keyboard Shortcuts (phase 9)
// ============================================

function openShortcutsPanel() {
  openModal(document.getElementById('shortcuts-modal'));
}

function closeShortcutsPanel() {
  closeModal(document.getElementById('shortcuts-modal'));
}

function anyModalOpen() {
  return !!(
    document.getElementById('share-modal')?.classList.contains('active') ||
    document.getElementById('confirm-overlay')?.classList.contains('active') ||
    document.getElementById('pinned-modal')?.classList.contains('active') ||
    document.getElementById('shortcuts-modal')?.classList.contains('active')
  );
}

function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Never hijack modifier combos — they belong to the browser.
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    // Ignore keys typed into inputs / textareas / contenteditable.
    const target = e.target;
    if (target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    )) {
      return;
    }

    const key = e.key;

    // A held key auto-repeats; a shortcut fires once per press. (Holding Z
    // would otherwise drain the undo history, and held keys re-render
    // faster than new rows can arrive.)
    if (e.repeat) return;

    // `?` always works (even with modals open), and Escape is handled elsewhere.
    if (key === '?' && !isPresenting()) {
      e.preventDefault();
      openShortcutsPanel();
      return;
    }

    // Present view: only the keys a teacher needs at the front of the room.
    if (isPresenting()) {
      const sectionKey = SECTION_KEYS[Number(key) - 1];
      // Space belongs to a focused button (Undo / Exit), not the roll.
      const onButton = target?.tagName === 'BUTTON';
      // Presentation clickers send PageDown/PageUp (or arrows): next = roll,
      // previous = undo.
      if (key === 'r' || key === 'R' || (key === ' ' && !onButton) || key === 'PageDown' || key === 'ArrowRight') {
        e.preventDefault();
        rollDie();
      } else if (key === 'PageUp' || key === 'ArrowLeft') {
        e.preventDefault();
        undo();
      } else if (key === 'z' || key === 'Z') {
        e.preventDefault();
        undo();
      } else if (key === 'f' || key === 'F') {
        e.preventDefault();
        closePresent();
      } else if (sectionKey && /^[1-5]$/.test(key)) {
        e.preventDefault();
        rerollSection(sectionKey);
      }
      return;
    }

    // Suppress most shortcuts when any modal is open.
    if (anyModalOpen()) return;
    // Also suppress while the results screen isn't the active one (intro).
    const resultsActive = document.getElementById('results-screen')?.classList.contains('active');
    if (!resultsActive) return;

    switch (key) {
      case 'r': case 'R':
        e.preventDefault();
        rollDie();
        return;
      case 'z': case 'Z':
        e.preventDefault();
        if (history.length === 0) {
          showToast('Nothing to undo');
        } else {
          undo();
        }
        return;
      case 'c': case 'C':
        e.preventDefault();
        copyBuild();
        return;
      case 's': case 'S':
        e.preventDefault();
        openShareModal();
        return;
      case 'p': case 'P':
        e.preventDefault();
        pinCurrentBuild();
        return;
      case 'l': case 'L':
        e.preventDefault();
        toggleTheme();
        return;
      case 'f': case 'F':
        e.preventDefault();
        openPresent();
        return;
      case '1': case '2': case '3': case '4': case '5': {
        e.preventDefault();
        const sectionKey = SECTION_KEYS[Number(key) - 1];
        if (sectionKey) rerollSection(sectionKey);
        return;
      }
    }
  });
}

function initMoreMenu() {
  const menu = document.getElementById('more-menu');
  if (!menu) return;

  // Arrow-key navigation inside the menu.
  menu.addEventListener('keydown', (e) => {
    const items = Array.from(menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]'))
      .filter(i => !i.disabled && i.offsetParent !== null);
    if (items.length === 0) return;
    const current = document.activeElement;
    const idx = items.indexOf(current);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = items[(idx + 1) % items.length];
      if (next) next.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = items[(idx - 1 + items.length) % items.length];
      if (prev) prev.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMoreMenu();
      const btn = document.getElementById('btn-more');
      if (btn) btn.focus();
    }
  });

  // Close when the user clicks anywhere outside the menu or its trigger.
  document.addEventListener('click', (e) => {
    if (!moreMenuOpen) return;
    const m = document.getElementById('more-menu');
    const btn = document.getElementById('btn-more');
    if (m && !m.contains(e.target) && btn && !btn.contains(e.target)) {
      closeMoreMenu();
    }
  });
}

// ============================================
// Modal Click Outside
// ============================================

function initModals() {
  document.getElementById('share-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeShareModal();
  });
  document.getElementById('confirm-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeConfirm();
  });
  document.getElementById('pinned-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePinnedPanel();
  });
  document.getElementById('shortcuts-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeShortcutsPanel();
  });
}

// ============================================
// Init
// ============================================

function init() {
  applyPrefs();
  initKeyboard();
  initModals();
  initModalFocusTrap();
  initMoreMenu();
  initShortcuts();
  initMoodCombobox();
  initShakeDetection();
  startRollIconCycle();

  // Crossing the collapse breakpoint (rotating a tablet, resizing a window)
  // changes whether cards may be collapsed — re-render to match.
  window.matchMedia(COLLAPSE_MQ).addEventListener?.('change', () => renderCards());

  window.addEventListener('beforeprint', preparePrintSheet);
  window.addEventListener('resize', () => { if (isPresenting()) fitPresent(); });
  // Leaving browser fullscreen (Esc is swallowed by the browser there) also
  // leaves the present view.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && presentEnteredFullscreen && isPresenting()) closePresent();
    else if (isPresenting()) fitPresent();
  });

  // Priority: URL hash share > saved state > fresh intro.
  // Hash-loads skip the CRT boot animation because it isn't a "roll".
  // The saved build is restored first so that opening a shared link on top
  // of it stays undoable.
  const saved = loadSavedState();
  if (saved) buildState = saved;

  if (tryLoadFromHash()) return;

  if (saved) {
    isFirstRoll = false;
    showResults();
    renderCards();
  } else {
    startDieIdleCycle();
  }
}

document.addEventListener('DOMContentLoaded', init);
