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
// between renders so we can play the CRT-fizzle animation only on new ones.
let lastRenderedSnapshot = null;
// Section keys scheduled to play the card-pulse effect on next render.
const pulseAfterRender = new Set();

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
  const pipFill = opts.pipFill || 'var(--accent-cyan)';
  const stroke = opts.stroke || 'var(--accent-cyan)';
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

// Fizzle roughly every N face swaps so the effect is punctuation,
// not a constant strobe.
const DIE_FIZZLE_EVERY = 3;
let dieFaceSwapCount = 0;
function setDieFace(n) {
  const el = document.getElementById('die-face');
  if (!el) return;
  el.innerHTML = getDieFaceSVG(n);
  dieFaceSwapCount += 1;
  if (dieFaceSwapCount % DIE_FIZZLE_EVERY === 0) {
    el.classList.remove('die-fizzle');
    // Force reflow so the animation restarts even if the class was just removed.
    void el.offsetWidth;
    el.classList.add('die-fizzle');
  }
}

// Small d6 icon inside the "Roll" button — cycles forever.
let rollIconInterval = null;
function startRollIconCycle() {
  if (rollIconInterval) clearInterval(rollIconInterval);
  const el = document.getElementById('roll-die-icon');
  if (!el) return;
  let last = 0;
  const tick = () => {
    let f;
    do { f = Math.floor(Math.random() * 6) + 1; } while (f === last);
    last = f;
    el.innerHTML = getDieFaceSVG(f, {
      pipFill: 'currentColor',
      stroke: 'currentColor',
      fill: 'transparent',
      strokeWidth: 6,
      dashed: false,
    });
  };
  tick();
  rollIconInterval = setInterval(tick, 500);
}

// ============================================
// Preferences
// ============================================

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : { theme: null, leftHanded: false, defaultView: 'expanded', mood: 'all' };
  } catch {
    return { theme: null, leftHanded: false, defaultView: 'expanded', mood: 'all' };
  }
}

function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function applyPrefs() {
  const prefs = loadPrefs();
  const theme = prefs.theme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-left-handed', String(prefs.leftHanded));
  updateMoreMenuState();
  setView(prefs.defaultView || 'expanded');
  applyMood(prefs.mood || 'all', { skipReroll: true });
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
}

// ============================================
// Theme & Left-Handed Toggles
// ============================================

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
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

  if (mode === 'expanded') {
    cards.forEach(c => c.classList.add('expanded'));
    if (btnExpanded) {
      btnExpanded.classList.add('active');
      btnExpanded.setAttribute('aria-pressed', 'true');
    }
    if (btnCompressed) {
      btnCompressed.classList.remove('active');
      btnCompressed.setAttribute('aria-pressed', 'false');
    }
  } else {
    cards.forEach(c => c.classList.remove('expanded'));
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
  if (labelEl) labelEl.textContent = MOOD_LABELS[mood] || mood;
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
  const prefs = loadPrefs();
  savePrefs({ ...prefs, mood });
  applyMood(mood);
  closeMoodListbox();
  document.getElementById('mood-combobox')?.focus();
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
  // Flag the section for a card-level pulse once renderCards rebuilds the DOM.
  pulseAfterRender.add(sectionKey);
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

  const container = document.getElementById('die-container');
  if (container) container.classList.add('die-shaking');

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
      generateNightmare();
      const resultsContainer = document.getElementById('results-container');
      if (resultsContainer) {
        resultsContainer.classList.add('crt-boot');
        setTimeout(() => resultsContainer.classList.remove('crt-boot'), 700);
      }
      if (container) container.classList.remove('die-shaking');
      isFirstRoll = false;
      isRolling = false;
      startDieIdleCycle();
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
        // Swap content at midpoint
        setTimeout(() => generateNightmare(), 325);
        setTimeout(() => {
          tumbleContainer.classList.remove(dir);
          if (container) container.classList.remove('die-shaking');
          isRolling = false;
          startDieIdleCycle();
        }, 650);
      } else {
        setTimeout(() => {
          generateNightmare();
          if (container) container.classList.remove('die-shaking');
          isRolling = false;
          startDieIdleCycle();
        }, 325);
      }
    } else {
      setTimeout(() => {
        generateNightmare();
        if (container) container.classList.remove('die-shaking');
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

function renderCards() {
  if (!buildState) return;

  const container = document.getElementById('results-container');
  const prefs = loadPrefs();
  const viewMode = prefs.defaultView || 'expanded';

  const prev = lastRenderedSnapshot;
  const current = snapshotTraitTexts(buildState);
  // On first render, don't fizzle anything (the CRT boot handles it).
  const changedKeys = prev
    ? new Set(Object.keys(current).filter(k => current[k] !== prev[k]))
    : new Set();

  renderLogline(changedKeys);

  const sections = [
    { key: 'hero', title: 'THE HERO', display: 'The Hero', icon: 'person' },
    { key: 'villain', title: 'THE VILLAIN', display: 'The Villain', icon: 'skull' },
    { key: 'squad', title: 'THE SQUAD', display: 'The Squad', icon: 'groups' },
    { key: 'setting', title: 'THE SETTING', display: 'The Setting', icon: 'location_on' },
    { key: 'obstacles', title: 'OBSTACLES', display: 'Obstacles', icon: 'warning' },
  ];

  container.innerHTML = sections.map(({ key, title, display }) => {
    const section = buildState.sections[key];
    const isLocked = section.locked;
    const expandedClass = viewMode === 'expanded' ? ' expanded' : '';
    const lockedClass = isLocked ? ' locked' : '';

    let traitsHtml = '';
    let summaryText = '';

    if (key === 'setting') {
      traitsHtml = renderSettingTraits(section, changedKeys);
      summaryText = `${section.when.text} — ${section.where.text}`;
    } else {
      traitsHtml = renderSectionTraits(key, section, changedKeys);
      const firstTrait = section.traits?.[0];
      summaryText = firstTrait ? firstTrait.text : '';
    }

    const contentId = `card-content-${key}`;
    const isExpanded = viewMode === 'expanded';
    return `
      <section class="card${expandedClass}${lockedClass}" data-section="${key}" aria-labelledby="card-title-${key}">
        <div class="card-header">
          <h2 class="card-header-title" id="card-title-${key}"><span class="card-header-prefix" aria-hidden="true">&gt;&gt;</span> ${title}</h2>
          <div class="card-header-actions">
            <button class="btn-icon" onclick="rerollSection('${key}')" aria-label="Re-roll this card" title="Re-roll this card"${isLocked ? ' disabled' : ''}>
              <span class="material-symbols-outlined" aria-hidden="true">casino</span>
            </button>
            <button class="btn-icon lock-icon ${isLocked ? 'icon-filled' : ''}"
              onclick="toggleSectionLock('${key}')"
              aria-label="${isLocked ? 'Unlock' : 'Lock'} this card"
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
        <div class="card-summary">${summaryText}...</div>
        <div class="card-content" id="${contentId}">
          <div class="card-body">${traitsHtml}</div>
        </div>
      </section>
    `;
  }).join('');

  // Apply queued card pulses (from section re-rolls). Scoped to just the
  // specific cards so full-build rolls don't pulse everything.
  if (pulseAfterRender.size > 0) {
    pulseAfterRender.forEach(key => {
      const card = document.querySelector(`.card[data-section="${key}"]`);
      if (card) {
        card.classList.remove('card-pulse');
        void card.offsetWidth;
        card.classList.add('card-pulse');
        setTimeout(() => card.classList.remove('card-pulse'), 500);
      }
    });
    pulseAfterRender.clear();
  }

  lastRenderedSnapshot = current;
  updateUndoButton();
}

// The logline reads from these state paths. If any of them change between
// renders the logline re-renders with a fizzle. Other trait changes (e.g.
// hero trait 2) don't trigger a re-render since they aren't quoted here.
const LOGLINE_SOURCE_KEYS = [
  'setting:where',
  'setting:when',
  'hero:traits:0',
  'villain:traits:0',
  'squad:traits:0',
  'obstacles:traits:0',
];

function buildLoglineText(state) {
  if (!state || !state.sections) return '';
  const s = state.sections;
  const parts = [];
  const where = s.setting?.where?.text;
  const when = s.setting?.when?.text;
  if (where && when) parts.push(`In ${where}, ${when}.`);
  const hero0 = s.hero?.traits?.[0]?.text;
  const villain0 = s.villain?.traits?.[0]?.text;
  if (hero0 && villain0) parts.push(`${hero0} meets ${villain0}.`);
  const squad0 = s.squad?.traits?.[0]?.text;
  const obstacle0 = s.obstacles?.traits?.[0]?.text;
  if (squad0 && obstacle0) parts.push(`${squad0} gets dragged in. ${obstacle0}.`);
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
    textEl.classList.remove('logline-fizzle');
    // Force reflow so the animation restarts cleanly.
    void textEl.offsetWidth;
    textEl.classList.add('logline-fizzle');
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
  navigator.clipboard.writeText(text).then(() => {
    showToast('Logline copied');
    flashCopyCheck(trigger);
  }).catch(() => {
    showToast('Copy failed');
  });
}

function renderSectionTraits(sectionKey, section, changedKeys) {
  let html = '';

  if (section.traits) {
    html += section.traits.map((trait, i) =>
      renderTraitLine('>', trait.text, trait.locked, sectionKey, 'traits', i, false, changedKeys)
    ).join('');
  }

  if (section.weakness) {
    html += renderTraitLine('WEAK:', section.weakness.text, section.weakness.locked, sectionKey, 'weakness', null, true, changedKeys);
  }

  if (section.trauma) {
    html += renderTraitLine('TRAUMA:', section.trauma.text, section.trauma.locked, sectionKey, 'trauma', null, true, changedKeys);
  }

  return html;
}

function renderSettingTraits(section, changedKeys) {
  let html = '';
  html += renderTraitLine('WHEN:', section.when.text, section.when.locked, 'setting', 'when', null, true, changedKeys);
  html += renderTraitLine('WHERE:', section.where.text, section.where.locked, 'setting', 'where', null, true, changedKeys);
  return html;
}

function renderTraitLine(prefix, text, locked, sectionKey, traitType, index, isLabel, changedKeys) {
  const lockedClass = locked ? ' trait-locked' : '';
  const snapshotKey = index !== null && index !== undefined
    ? `${sectionKey}:${traitType}:${index}`
    : `${sectionKey}:${traitType}`;
  const fizzleClass = changedKeys && changedKeys.has(snapshotKey) ? ' trait-fizzle' : '';
  const lockIcon = locked ? 'lock' : 'lock_open';
  const iconClass = locked ? ' icon-filled' : '';
  const idxArg = index !== null && index !== undefined ? `,${index}` : '';
  const lockClickHandler = `toggleTraitLock('${sectionKey}','${traitType}'${idxArg})`;
  const swapClickHandler = `rerollSingleTrait('${sectionKey}','${traitType}'${idxArg})`;

  const prefixHtml = isLabel
    ? `<span class="trait-label">${prefix}</span>`
    : `<span class="trait-prefix">${prefix}</span>`;

  const truncated = text.length > 40 ? text.slice(0, 40) + '…' : text;
  const swapLabel = `Swap trait: ${escapeHtml(truncated)}`;
  const swapTitle = locked ? 'Unlock to swap' : 'Swap this one';
  const lockLabel = locked ? 'Release this' : 'Keep this';

  return `
    <div class="trait-line${lockedClass}${fizzleClass}">
      ${prefixHtml}
      <span class="trait-text">${escapeHtml(text)}</span>
      <div class="trait-actions">
        <button class="btn-icon trait-swap"
          onclick="${swapClickHandler}"
          aria-label="${swapLabel}"
          title="${swapTitle}"${locked ? ' disabled' : ''}>
          <span class="material-symbols-outlined" aria-hidden="true">replay</span>
        </button>
        <button class="btn-icon trait-lock" onclick="${lockClickHandler}"
          aria-label="${lockLabel}"
          title="${lockLabel}"
          aria-pressed="${locked}">
          <span class="material-symbols-outlined${iconClass}" aria-hidden="true">${lockIcon}</span>
        </button>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================
// Card Expand/Collapse
// ============================================

function toggleCardExpand(sectionKey) {
  // Non-mobile keeps every card expanded — collapse is a mobile-only affordance.
  if (window.matchMedia('(min-width: 768px)').matches) return;
  const card = document.querySelector(`.card[data-section="${sectionKey}"]`);
  if (!card) return;
  card.classList.toggle('expanded');
  const expanded = card.classList.contains('expanded');
  const chevron = card.querySelector('.card-chevron');
  if (chevron) {
    chevron.setAttribute('aria-expanded', String(expanded));
    // Find the section display name for the accessible label.
    const sectionLabels = {
      hero: 'The Hero', villain: 'The Villain', squad: 'The Squad',
      setting: 'The Setting', obstacles: 'Obstacles',
    };
    const label = sectionLabels[sectionKey] || sectionKey;
    chevron.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${label}`);
  }
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
  const labels = {
    hero: 'The Hero', villain: 'The Villain', squad: 'The Squad',
    setting: 'The Setting', obstacles: 'Obstacles',
  };
  announce(`${labels[sectionKey] || sectionKey} ${willBeLocked ? 'locked' : 'unlocked'}`);
}

function toggleTraitLock(sectionKey, traitType, index) {
  if (!buildState) return;
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
      showToast("Locked — it'll survive your next roll");
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
  if (!section) return;

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

function updateUndoButton() {
  const btn = document.getElementById('btn-undo');
  if (!btn) return;
  const wasDisabled = btn.disabled;
  const shouldDisable = history.length === 0;
  btn.disabled = shouldDisable;
  btn.title = shouldDisable ? 'Nothing to undo yet' : 'Undo last roll';

  // Transition from disabled → enabled: flash the "Undo roll" label for 1.5s.
  if (wasDisabled && !shouldDisable) {
    btn.classList.add('btn-undo-label-visible');
    if (undoLabelTimeout) clearTimeout(undoLabelTimeout);
    undoLabelTimeout = setTimeout(() => {
      btn.classList.remove('btn-undo-label-visible');
    }, 1500);
  } else if (!shouldDisable && !wasDisabled) {
    // Subsequent pushes: retrigger the label so it pops again.
    btn.classList.remove('btn-undo-label-visible');
    void btn.offsetWidth;
    btn.classList.add('btn-undo-label-visible');
    if (undoLabelTimeout) clearTimeout(undoLabelTimeout);
    undoLabelTimeout = setTimeout(() => {
      btn.classList.remove('btn-undo-label-visible');
    }, 1500);
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

function copyBuild(event) {
  if (!buildState) return;
  const text = formatBuildText();
  const trigger = event?.currentTarget;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied');
    flashCopyCheck(trigger);
  }).catch(() => {
    showToast('Copy failed');
  });
}

function formatBuildText() {
  const s = buildState.sections;
  let text = 'POCKET DYSTOPIA - Story Seed\n============================\n\n';

  text += '>> THE HERO\n';
  s.hero.traits.forEach(t => { text += `> ${t.text}\n`; });
  text += `WEAK: ${s.hero.weakness.text}\n`;
  text += `TRAUMA: ${s.hero.trauma.text}\n\n`;

  text += '>> THE VILLAIN\n';
  s.villain.traits.forEach(t => { text += `> ${t.text}\n`; });
  text += `WEAK: ${s.villain.weakness.text}\n\n`;

  text += '>> THE SQUAD\n';
  s.squad.traits.forEach(t => { text += `> ${t.text}\n`; });
  text += '\n';

  text += '>> THE SETTING\n';
  text += `WHEN: ${s.setting.when.text}\n`;
  text += `WHERE: ${s.setting.where.text}\n\n`;

  text += '>> OBSTACLES\n';
  s.obstacles.traits.forEach(t => { text += `> ${t.text}\n`; });

  return text;
}

// ============================================
// Screenshot
// ============================================

async function saveScreenshot(event) {
  const container = document.getElementById('results-container');
  const trigger = event?.currentTarget;
  if (!container || typeof html2canvas === 'undefined') {
    showToast('Screenshot failed');
    return;
  }

  try {
    const canvas = await html2canvas(container, {
      backgroundColor: getComputedStyle(document.documentElement)
        .getPropertyValue('--bg-primary').trim(),
      scale: 2,
      useCORS: true,
      logging: false,
    });
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pocket-dystopia-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Screenshot saved');
      flashCopyCheck(trigger);
    }, 'image/png');
  } catch {
    showToast('Screenshot failed');
  }
}

// ============================================
// Share / Load Build Codes
// ============================================

function encodeBuild(state) {
  return btoa(encodeURIComponent(JSON.stringify(state)));
}

function decodeBuild(code) {
  try {
    const json = JSON.parse(decodeURIComponent(atob(code)));
    if (!json.version || !json.sections) throw new Error('Invalid');
    return json;
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

function buildShareUrl(state) {
  const code = encodeBuild(state);
  const safe = toUrlSafeBase64(code);
  return `${location.origin}${location.pathname}#build=${safe}`;
}

function tryLoadFromHash() {
  const hash = window.location.hash || '';
  const match = hash.match(/^#build=(.+)$/);
  if (!match) return false;

  const decoded = decodeBuild(fromUrlSafeBase64(match[1]));
  // Always strip the hash so a reload doesn't re-trigger, even on failure.
  // Use window.history explicitly — `history` is shadowed by the undo stack.
  window.history.replaceState(null, '', window.location.pathname);

  if (!decoded) {
    // Delay the toast so it doesn't fire before the intro paints.
    setTimeout(() => showToast("That build code didn't work. Starting fresh."), 300);
    return false;
  }

  buildState = decoded;
  isFirstRoll = false;
  saveBuildState();
  showResults();
  renderCards();
  return true;
}

function openShareModal() {
  if (!buildState) return;
  const code = encodeBuild(buildState);
  document.getElementById('share-code').value = code;

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
      title: 'Pocket Dystopia — my build',
      text: "Here's a dystopian story seed I rolled.",
      url,
    });
  } catch {
    // User cancelled or share failed — silently ignore.
  }
}

function copyShareLink(event) {
  if (!buildState) return;
  const url = buildShareUrl(buildState);
  const trigger = event?.currentTarget;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link copied');
    flashCopyCheck(trigger);
  }).catch(() => {
    showToast('Copy failed');
  });
}

function copyShareCode(event) {
  const textarea = document.getElementById('share-code');
  const trigger = event?.currentTarget;
  navigator.clipboard.writeText(textarea.value).then(() => {
    showToast('Code copied');
    flashCopyCheck(trigger);
  }).catch(() => {
    textarea.select();
    document.execCommand('copy');
    showToast('Code copied');
  });
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
    errorEl.textContent = 'Please paste a build code';
    return;
  }

  const decoded = decodeBuild(code);
  if (!decoded) {
    errorEl.textContent = 'Invalid build code';
    return;
  }

  errorEl.textContent = '';
  buildState = decoded;
  isFirstRoll = false;
  saveBuildState();
  showResults();
  renderCards();
  showToast('Build loaded!');
}

// ============================================
// Persistence
// ============================================

function saveBuildState() {
  if (!buildState) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(buildState));
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      if (state && state.version && state.sections) {
        return state;
      }
    }
  } catch {
    // Ignore
  }
  return null;
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
  }
}

function executeReset() {
  closeConfirm();
  localStorage.removeItem(STORAGE_KEY);
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

function initShakeDetection() {
  let lastShake = 0;
  const threshold = 15;
  const cooldown = 1000;

  function handleMotion(e) {
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;
    const { x, y, z } = acc;
    if (Math.abs(x) > threshold || Math.abs(y) > threshold || Math.abs(z) > threshold) {
      const now = Date.now();
      if (now - lastShake > cooldown) {
        lastShake = now;
        rollDie();
      }
    }
  }

  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    document.addEventListener('click', async function reqPerm() {
      try {
        const perm = await DeviceMotionEvent.requestPermission();
        if (perm === 'granted') window.addEventListener('devicemotion', handleMotion);
      } catch {
        // Silently fail
      }
      document.removeEventListener('click', reqPerm);
    }, { once: true });
  } else if (typeof DeviceMotionEvent !== 'undefined') {
    window.addEventListener('devicemotion', handleMotion);
  }
}

// ============================================
// Keyboard Support
// ============================================

function initKeyboard() {
  document.getElementById('die-container')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      rollDie();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeShareModal();
      closeConfirm();
      closePinnedPanel();
      closeShortcutsPanel();
      closeMoreMenu();
    }
  });
}

// ============================================
// Home / Pinned Panel stubs
// ============================================

// Non-destructive home: goes back to the intro without touching the saved build.
// Phase 8 will add the resume row; for now the intro just reappears.
function goHome() {
  closeMoreMenu();
  showIntro();
}

// ============================================
// Pinned Builds (6-slot system)
// ============================================

const PINS_KEY = 'pocket-dystopia-pins';
const PIN_SLOTS = 6;
let pinnedReplaceMode = false;

function loadPins() {
  try {
    const raw = localStorage.getItem(PINS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.slots) && parsed.slots.length === PIN_SLOTS) {
        return parsed;
      }
    }
  } catch {
    // Ignore, fall through to default.
  }
  return { version: 1, slots: Array(PIN_SLOTS).fill(null) };
}

function savePins(pins) {
  localStorage.setItem(PINS_KEY, JSON.stringify(pins));
}

function defaultPinLabel(state) {
  const text = state?.sections?.hero?.traits?.[0]?.text || 'Build';
  return text.length > 40 ? text.slice(0, 40) + '…' : text;
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

function renderPinnedSlots() {
  const container = document.getElementById('pinned-slots');
  const description = document.getElementById('pinned-description');
  const actions = document.getElementById('pinned-modal-actions');
  if (!container || !description) return;

  const pins = loadPins();
  const filled = pins.slots.filter(s => s !== null);
  const allEmpty = filled.length === 0;
  const allFull = filled.length === PIN_SLOTS;

  if (pinnedReplaceMode) {
    description.textContent = 'All 6 slots are full. Pick one to replace.';
    if (actions) actions.hidden = false;
  } else if (allEmpty) {
    description.textContent = 'Six slots for builds you want to keep. Tap + to pin the current one.';
    if (actions) actions.hidden = true;
  } else {
    description.textContent = '';
    if (actions) actions.hidden = true;
  }

  container.innerHTML = pins.slots.map((slot, i) => renderPinSlot(slot, i, pinnedReplaceMode)).join('');
}

function renderPinSlot(slot, index, replaceMode) {
  if (!slot) {
    const disabled = !buildState;
    const disabledClass = disabled ? ' disabled' : '';
    const title = disabled ? 'Roll something first' : 'Pin current build';
    return `
      <button type="button" class="pin-slot pin-slot-empty${disabledClass}"
        onclick="pinCurrentToSlot(${index})"
        ${disabled ? 'disabled' : ''}
        aria-label="${title}"
        title="${title}">
        <span class="material-symbols-outlined" aria-hidden="true">add</span>
      </button>
    `;
  }

  const label = escapeHtml(slot.label || defaultPinLabel(slot.state));
  const when = relativeTime(slot.createdAt);

  if (replaceMode) {
    return `
      <button type="button" class="pin-slot pin-slot-filled pin-slot-replace"
        onclick="replaceSlot(${index})"
        aria-label="Replace slot ${index + 1}"
        title="Replace this one">
        <span class="pin-slot-label">${label}</span>
        <span class="pin-slot-time">${when}</span>
        <span class="pin-slot-replace-overlay">Replace this one</span>
      </button>
    `;
  }

  return `
    <div class="pin-slot pin-slot-filled" data-slot="${index}">
      <div class="pin-slot-body">
        <div class="pin-slot-label-row">
          <span class="pin-slot-label" data-pin-label="${index}">${label}</span>
          <input type="text" class="pin-slot-label-input" data-pin-input="${index}"
            value="${label}" placeholder="Name this build" hidden>
        </div>
        <span class="pin-slot-time">${when}</span>
      </div>
      <div class="pin-slot-actions">
        <button type="button" class="btn-secondary pin-slot-load" onclick="loadPin(${index})">
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

function pinCurrentToSlot(index) {
  if (!buildState) return;
  const pins = loadPins();
  if (pins.slots[index] !== null) {
    // Shouldn't happen (button is only rendered for empty slots) but guard anyway.
    return;
  }
  pins.slots = pins.slots.map((s, i) => i === index ? {
    state: JSON.parse(JSON.stringify(buildState)),
    label: defaultPinLabel(buildState),
    createdAt: Date.now(),
  } : s);
  savePins(pins);
  renderPinnedSlots();
  showToast(`Pinned to slot ${index + 1}`);
}

function replaceSlot(index) {
  if (!buildState) return;
  const pins = loadPins();
  pins.slots = pins.slots.map((s, i) => i === index ? {
    state: JSON.parse(JSON.stringify(buildState)),
    label: defaultPinLabel(buildState),
    createdAt: Date.now(),
  } : s);
  savePins(pins);
  pinnedReplaceMode = false;
  renderPinnedSlots();
  showToast(`Replaced slot ${index + 1}`);
}

function loadPin(index) {
  const pins = loadPins();
  const slot = pins.slots[index];
  if (!slot) return;
  pushHistory();
  buildState = JSON.parse(JSON.stringify(slot.state));
  isFirstRoll = false;
  saveBuildState();
  closePinnedPanel();
  showResults();
  renderCards();
  showToast(`Loaded pin ${index + 1}`);
}

function startRenamePin(index) {
  const labelEl = document.querySelector(`[data-pin-label="${index}"]`);
  const inputEl = document.querySelector(`[data-pin-input="${index}"]`);
  if (!labelEl || !inputEl) return;
  labelEl.hidden = true;
  inputEl.hidden = false;
  inputEl.focus();
  inputEl.select();

  const commit = () => {
    const newLabel = inputEl.value.trim() || defaultPinLabel(loadPins().slots[index]?.state);
    const pins = loadPins();
    pins.slots = pins.slots.map((s, i) => i === index && s ? { ...s, label: newLabel } : s);
    savePins(pins);
    renderPinnedSlots();
  };

  inputEl.addEventListener('blur', commit, { once: true });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inputEl.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      inputEl.value = labelEl.textContent;
      inputEl.blur();
    }
  });
}

let pendingDeleteIndex = null;

function confirmDeletePin(index) {
  pendingDeleteIndex = index;
  const overlay = document.getElementById('confirm-overlay');
  const msg = document.getElementById('confirm-msg');
  const yes = document.getElementById('confirm-yes');
  if (msg) msg.textContent = "This slot will be empty again. Your other pins and your current build aren't affected.";
  if (yes) {
    yes.textContent = 'Delete';
    yes.onclick = executePinDelete;
  }
  overlay.classList.add('active');
  overlay.dataset.mode = 'pin-delete';
}

function executePinDelete() {
  if (pendingDeleteIndex === null) return;
  const pins = loadPins();
  pins.slots = pins.slots.map((s, i) => i === pendingDeleteIndex ? null : s);
  savePins(pins);
  pendingDeleteIndex = null;
  // Restore the confirm dialog to its default (reset) wiring.
  const yes = document.getElementById('confirm-yes');
  if (yes) {
    yes.textContent = 'Clear it';
    yes.onclick = executeReset;
  }
  closeConfirm();
  renderPinnedSlots();
  showToast('Unpinned');
}

// Invoked from the top-bar Pin button AND from the P keyboard shortcut.
// `mode === 'pin'` triggers the pin-current flow.
function openPinnedPanelForPinning() {
  if (!buildState) {
    // No current build to pin — fall through to the view mode so the user
    // can still browse existing pins (all will be empty on fresh install).
    openPinnedPanel();
    return;
  }
  const pins = loadPins();
  const firstEmpty = pins.slots.findIndex(s => s === null);
  if (firstEmpty === -1) {
    pinnedReplaceMode = true;
    renderPinnedSlots();
    openModal(document.getElementById('pinned-modal'));
    showToast('All 6 slots are full. Pick one to replace.');
  } else {
    openPinnedPanel();
  }
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
  const modals = ['share-modal', 'pinned-modal', 'shortcuts-modal', 'confirm-overlay'];
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

    // `?` always works (even with modals open), and Escape is handled elsewhere.
    if (key === '?') {
      e.preventDefault();
      openShortcutsPanel();
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
        openPinnedPanelForPinning();
        return;
      case 'l': case 'L':
        e.preventDefault();
        toggleTheme();
        return;
      case '1': case '2': case '3': case '4': case '5': {
        e.preventDefault();
        const keys = ['hero', 'villain', 'squad', 'setting', 'obstacles'];
        const idx = Number(key) - 1;
        if (keys[idx]) rerollSection(keys[idx]);
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

  // Priority: URL hash share > saved state > fresh intro.
  // Hash-loads skip the CRT boot animation because it isn't a "roll".
  if (tryLoadFromHash()) return;

  const saved = loadSavedState();
  if (saved) {
    buildState = saved;
    isFirstRoll = false;
    showResults();
    renderCards();
  } else {
    startDieIdleCycle();
  }
}

document.addEventListener('DOMContentLoaded', init);
