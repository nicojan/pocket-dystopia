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
  updateThemeIcon(theme);
  setView(prefs.defaultView || 'expanded');
  document.getElementById('mood-filter').value = prefs.mood || 'all';
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
  }
}

// ============================================
// Theme & Left-Handed Toggles
// ============================================

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  updateThemeIcon(next);
  const prefs = loadPrefs();
  savePrefs({ ...prefs, theme: next });
}

function toggleLeftHanded() {
  const current = document.documentElement.getAttribute('data-left-handed') === 'true';
  const next = !current;
  document.documentElement.setAttribute('data-left-handed', String(next));
  const prefs = loadPrefs();
  savePrefs({ ...prefs, leftHanded: next });
  showToast(next ? 'Left-handed mode on' : 'Left-handed mode off');
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

function setMood(mood) {
  const prefs = loadPrefs();
  savePrefs({ ...prefs, mood });
}

function getCurrentMood() {
  return document.getElementById('mood-filter')?.value || 'all';
}

// ============================================
// Random Selection with Mood Weighting
// ============================================

function getWeightedItems(pool, count, mood) {
  if (mood === 'all') {
    return shuffleAndPick(pool, count);
  }
  const weighted = pool.flatMap(item =>
    (item.mood && item.mood.includes(mood)) ? [item, item, item] : [item]
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
  const dieNum = document.getElementById('die-num');

  if (dieIdleInterval) {
    clearInterval(dieIdleInterval);
    dieIdleInterval = null;
  }

  // Fast number cycle
  const rollEnd = Date.now() + 900;
  function fastTick() {
    if (dieNum) {
      dieNum.textContent = Math.floor(Math.random() * 20) + 1;
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

      const container = dieWrapper.parentElement;
      if (container) {
        container.classList.add(dir);
        // Swap content at midpoint
        setTimeout(() => generateNightmare(), 325);
        setTimeout(() => {
          container.classList.remove(dir);
          isRolling = false;
          startDieIdleCycle();
        }, 650);
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
  const dieNum = document.getElementById('die-num');
  if (!dieNum) return;
  dieIdleInterval = setInterval(() => {
    dieNum.textContent = Math.floor(Math.random() * 20) + 1;
  }, 600);
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
  isFirstRoll = true;
  startDieIdleCycle();
}

function renderCards() {
  if (!buildState) return;

  const container = document.getElementById('results-container');
  const prefs = loadPrefs();
  const viewMode = prefs.defaultView || 'expanded';

  const sections = [
    { key: 'hero', title: 'THE HERO', icon: 'person' },
    { key: 'villain', title: 'THE VILLAIN', icon: 'skull' },
    { key: 'squad', title: 'THE SQUAD', icon: 'groups' },
    { key: 'setting', title: 'THE SETTING', icon: 'location_on' },
    { key: 'obstacles', title: 'OBSTACLES', icon: 'warning' },
  ];

  container.innerHTML = sections.map(({ key, title }) => {
    const section = buildState.sections[key];
    const isLocked = section.locked;
    const expandedClass = viewMode === 'expanded' ? ' expanded' : '';
    const lockedClass = isLocked ? ' locked' : '';

    let traitsHtml = '';
    let summaryText = '';

    if (key === 'setting') {
      traitsHtml = renderSettingTraits(section);
      summaryText = `${section.when.text} — ${section.where.text}`;
    } else {
      traitsHtml = renderSectionTraits(key, section);
      const firstTrait = section.traits?.[0];
      summaryText = firstTrait ? firstTrait.text : '';
    }

    return `
      <div class="card${expandedClass}${lockedClass}" data-section="${key}">
        <div class="card-header" onclick="toggleCardExpand('${key}')">
          <span class="card-header-title">&gt;&gt; ${title}</span>
          <div class="card-header-actions">
            <button class="btn-icon lock-icon ${isLocked ? 'icon-filled' : ''}"
              onclick="event.stopPropagation(); toggleSectionLock('${key}')"
              aria-label="${isLocked ? 'Unlock' : 'Lock'} ${title.toLowerCase()} section"
              aria-pressed="${isLocked}">
              <span class="material-symbols-outlined ${isLocked ? 'icon-filled' : ''}">${isLocked ? 'lock' : 'lock_open'}</span>
            </button>
            <button class="btn-icon" onclick="event.stopPropagation(); rerollSection('${key}')" aria-label="Re-roll ${title.toLowerCase()}"${isLocked ? ' disabled' : ''}>
              <span class="material-symbols-outlined">sync</span>
            </button>
          </div>
        </div>
        <div class="card-summary">${summaryText}...</div>
        <div class="card-content">
          <div class="card-body">${traitsHtml}</div>
        </div>
      </div>
    `;
  }).join('');

  updateUndoButton();
}

function renderSectionTraits(sectionKey, section) {
  let html = '';

  if (section.traits) {
    html += section.traits.map((trait, i) =>
      renderTraitLine('>', trait.text, trait.locked, sectionKey, 'traits', i)
    ).join('');
  }

  if (section.weakness) {
    html += renderTraitLine('WEAK:', section.weakness.text, section.weakness.locked, sectionKey, 'weakness', null, true);
  }

  if (section.trauma) {
    html += renderTraitLine('TRAUMA:', section.trauma.text, section.trauma.locked, sectionKey, 'trauma', null, true);
  }

  return html;
}

function renderSettingTraits(section) {
  let html = '';
  html += renderTraitLine('WHEN:', section.when.text, section.when.locked, 'setting', 'when', null, true);
  html += renderTraitLine('WHERE:', section.where.text, section.where.locked, 'setting', 'where', null, true);
  return html;
}

function renderTraitLine(prefix, text, locked, sectionKey, traitType, index, isLabel) {
  const lockedClass = locked ? ' trait-locked' : '';
  const lockVisibleClass = locked ? ' visible' : '';
  const lockIcon = locked ? 'lock' : 'lock_open';
  const iconClass = locked ? ' icon-filled' : '';
  const clickHandler = index !== null && index !== undefined
    ? `toggleTraitLock('${sectionKey}','${traitType}',${index})`
    : `toggleTraitLock('${sectionKey}','${traitType}')`;

  const prefixHtml = isLabel
    ? `<span class="trait-label">${prefix}</span>`
    : `<span class="trait-prefix">${prefix}</span>`;

  return `
    <div class="trait-line${lockedClass}">
      ${prefixHtml}
      <span class="trait-text">${escapeHtml(text)}</span>
      <button class="btn-icon trait-lock${lockVisibleClass}" onclick="${clickHandler}"
        aria-label="${locked ? 'Unlock' : 'Lock'} trait" aria-pressed="${locked}">
        <span class="material-symbols-outlined${iconClass}" style="font-size:16px">${lockIcon}</span>
      </button>
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
  const card = document.querySelector(`.card[data-section="${sectionKey}"]`);
  if (card) card.classList.toggle('expanded');
}

// ============================================
// Locking
// ============================================

function toggleSectionLock(sectionKey) {
  if (!buildState) return;
  const section = buildState.sections[sectionKey];
  buildState = {
    ...buildState,
    sections: {
      ...buildState.sections,
      [sectionKey]: { ...section, locked: !section.locked },
    },
  };
  saveBuildState();
  renderCards();
}

function toggleTraitLock(sectionKey, traitType, index) {
  if (!buildState) return;
  const section = { ...buildState.sections[sectionKey] };

  if (index !== undefined && index !== null) {
    const traits = section.traits.map((t, i) =>
      i === index ? { ...t, locked: !t.locked } : t
    );
    section.traits = traits;
  } else {
    section[traitType] = { ...section[traitType], locked: !section[traitType].locked };
  }

  buildState = {
    ...buildState,
    sections: { ...buildState.sections, [sectionKey]: section },
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

function updateUndoButton() {
  const btn = document.getElementById('btn-undo');
  if (btn) btn.disabled = history.length === 0;
}

// ============================================
// Copy to Clipboard
// ============================================

function copyBuild() {
  if (!buildState) return;
  const text = formatBuildText();
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy');
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

async function saveScreenshot() {
  const container = document.getElementById('results-container');
  if (!container || typeof html2canvas === 'undefined') {
    showToast('Screenshot not available');
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
      showToast('Screenshot saved!');
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

function openShareModal() {
  if (!buildState) return;
  const code = encodeBuild(buildState);
  document.getElementById('share-code').value = code;
  document.getElementById('share-modal').classList.add('active');
}

function closeShareModal() {
  document.getElementById('share-modal').classList.remove('active');
}

function copyShareCode() {
  const textarea = document.getElementById('share-code');
  navigator.clipboard.writeText(textarea.value).then(() => {
    showToast('Code copied!');
  }).catch(() => {
    textarea.select();
    document.execCommand('copy');
    showToast('Code copied!');
  });
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
  document.getElementById('confirm-overlay').classList.add('active');
}

function closeConfirm() {
  document.getElementById('confirm-overlay').classList.remove('active');
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
  toast.textContent = message;
  toast.classList.add('visible');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2000);
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
}

// ============================================
// Init
// ============================================

function init() {
  applyPrefs();
  initKeyboard();
  initModals();
  initShakeDetection();

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
