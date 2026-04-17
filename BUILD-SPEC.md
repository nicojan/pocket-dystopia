# Pocket Dystopia — Build Specification

> A satirical dystopian story-seed generator. Roll a die to randomize a hero, villain, squad, setting, and obstacles. Lock what you like, re-roll the rest, share the result via a link. Elementary-school-safe humor with a CRT/terminal aesthetic.
>
> This document describes the **current implemented build** as of the latest commit on `main`. For the original pre-implementation design intent, see [`spec.md`](spec.md).

---

## 1. Overview

| Item | Value |
|---|---|
| Type | Static client-side web app (single page) |
| Build step | None (open `index.html` directly or serve the directory) |
| Runtime dependencies | Google Fonts, Material Symbols, html2canvas (all CDN) |
| Persistence | `localStorage` |
| Sharing | URL hash (`#build=...`) or base64 code, with Web Share API on supported devices |
| Offline support | Works offline after first load (fonts may fall back) |
| Deployment | Flat file host (currently `classwith.nicojan.com/pocket-dystopia/`) |

### File layout

```
Pocket Dystopia/
├── index.html        # Markup: intro + results screens, 4 modals, toast, sr-only announcer
├── styles.css        # ~2170 lines: tokens, components, animations, responsive, a11y
├── data.js           # Trait pools, tagged with mood categories
├── app.js            # ~2100 lines: state, rolling, rendering, pins, shortcuts, modal focus, a11y
├── spec.md           # Original pre-build design spec (historical)
├── BUILD-SPEC.md     # This document
├── favicon.ico, favicon-16.png, favicon-32.png
├── icon-192.png, icon-512.png, apple-touch-icon.png
└── og-image-v2.png   # 1200×630 Open Graph image
```

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Markup / logic | Vanilla HTML + JS (no framework) | Two `<script>` tags: `data.js`, then `app.js` |
| Styling | Plain CSS with custom properties | Dark mode default; `[data-theme="light"]` override |
| Fonts | `Space Grotesk` (display), `Space Mono` (body) via Google Fonts | Loaded via stylesheet `<link>` |
| Icons | Material Symbols Outlined via Google Fonts | Variable font: `opsz 20..48, wght 100..700, FILL 0..1, GRAD -50..200` |
| Screenshot | `html2canvas` 1.4.1 via cdnjs | Loaded `defer`; guarded by `typeof html2canvas === 'undefined'` fallback |
| Persistence | `localStorage` | Three keys: `pocket-dystopia-state`, `pocket-dystopia-prefs`, `pocket-dystopia-pins` |
| Share codes | `btoa(encodeURIComponent(JSON.stringify(state)))` | URL-safe variant for `#build=...` links (see §4.6) |

### CDN links (from `index.html`)

```html
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" defer></script>
```

---

## 3. Data Model

### 3.1 Trait pool shape (`data.js`)

All pools live under a single `DATA` object. Every item is `{ text: string, mood: string[] }`. The `mood` array tags the trait with one or more mood categories; an empty array marks a neutral item that fits any mood.

```js
const DATA = {
  heroTraits:       [{ text, mood }, ...],  // 26 items
  heroWeaknesses:   [{ text, mood }, ...],  // 20 items
  heroTraumas:      [{ text, mood }, ...],  // 20 items
  villainTraits:    [{ text, mood }, ...],  // 26 items
  villainWeaknesses:[{ text, mood }, ...],  // 20 items
  squadMembers:     [{ text, mood }, ...],  // 26 items
  settings:         [{ text, mood }, ...],  // 26 items
  times:            [{ text, mood }, ...],  // 20 items
  obstacles:        [{ text, mood }, ...],  // 25 items
};
```

### 3.2 Mood categories

Four soft-tagged moods plus the default:

| Value | Label in UI |
|---|---|
| `all` | All moods |
| `corporate` | Corporate dystopia |
| `post-apocalyptic` | Post-apocalyptic |
| `ai-takeover` | AI takeover |
| `political` | Political satire |

### 3.3 Build state (runtime + persisted)

Unchanged from original. `version: 1`, backward-compatible with pre-revision-1 share codes.

```js
{
  version: 1,
  timestamp: <number>,         // ms since epoch of last mutation
  mood: 'all' | 'corporate' | 'post-apocalyptic' | 'ai-takeover' | 'political',
  sections: {
    hero: {
      locked: boolean,
      traits: [{ text, locked }, { text, locked }, { text, locked }],
      weakness: { text, locked },
      trauma:   { text, locked },
    },
    villain: {
      locked: boolean,
      traits: [{ text, locked } × 3],
      weakness: { text, locked },
    },
    squad: {
      locked: boolean,
      traits: [{ text, locked } × 3],
    },
    setting: {
      locked: boolean,
      when:  { text, locked },
      where: { text, locked },
    },
    obstacles: {
      locked: boolean,
      traits: [{ text, locked } × 2],
    },
  },
}
```

### 3.4 Preferences (persisted separately)

```js
{
  theme: 'dark' | 'light' | null,     // null = follow OS
  leftHanded: boolean,                 // default false
  defaultView: 'expanded' | 'compressed',
  mood: <one of the mood values>,
  hasSeenLockHint: boolean,            // one-time lock tutorial toast
}
```

### 3.5 Pinned builds (new in revision 1)

```js
{
  version: 1,
  slots: [
    { state: <full build state>, label: string, createdAt: number } | null,
    ...  // always length 6, null for empty
  ],
}
```

Six fixed slots. Label defaults to `state.sections.hero.traits[0].text` truncated to 40 chars. On load the schema is validated; a malformed payload is discarded and rebuilt as empty slots.

### 3.6 Storage keys

| Key | Payload |
|---|---|
| `pocket-dystopia-state` | Current build state JSON |
| `pocket-dystopia-prefs` | Preferences JSON |
| `pocket-dystopia-pins` | Pinned builds JSON |

---

## 4. Core Behavior

### 4.1 Rolling

Three entry points, all funnelling through the same code path:

1. **Intro-screen die** (`onclick="rollDie()"` on `#die-container`). First roll triggers CRT-boot animation on the results container.
2. **Top-bar "roll all" button** on the results screen. Plays a tumble animation; swaps content at animation midpoint (325 ms).
3. **Shake-to-roll** on mobile via `devicemotion` (threshold 15 m/s², cooldown 1 s). iOS `DeviceMotionEvent.requestPermission()` is attached to a one-shot click listener so permission is prompted at first interaction.
4. **Keyboard shortcut** `R` on the results screen.

Rolling is guarded by `isRolling` to prevent re-entry.

### 4.2 Weighted selection (mood)

`getWeightedItems(pool, count, mood)` in `app.js`:

- `mood === 'all'` → simple shuffle with de-dupe on `text`.
- Otherwise → expand the pool so items whose `mood` array includes the selected mood appear **8×** (a soft bias, not a hard filter).

Dedupe keys on `item.text`.

### 4.3 Re-roll granularity

- **Whole build**: `rollDie()` → `generateNightmare()` replaces unlocked sections only.
- **Section**: `rerollSection(sectionKey)` replaces the unlocked traits/fields within one card.
- **Per trait** (new in revision 1): `rerollSingleTrait(sectionKey, traitType, index?)` replaces a single trait's text, avoiding siblings to prevent duplicates. Pushes to history.
- **Lock precedence**: both trait-level and section-level locks block re-rolls.

### 4.4 Undo

`history` array, max 20 entries (`MAX_HISTORY = 20`). `pushHistory()` deep-clones via `JSON.parse(JSON.stringify(...))` before any destructive mutation (`rollDie`, `rerollSection`, `rerollSingleTrait`, `loadPin`). `undo()` pops the last snapshot and re-renders. The Undo button's `disabled` attribute reflects `history.length === 0`.

When history transitions from empty → non-empty (or increments while already enabled), the Undo button briefly shows an "Undo roll" label (1.5 s), with hover/focus pinning it visible.

Note: lock toggles do **not** push to history.

### 4.5 Persistence lifecycle

On `DOMContentLoaded` → `init()` runs `applyPrefs()`, then checks for a `#build=...` URL hash, then falls back to `loadSavedState()`:

1. If `#build=` decodes, the build loads straight into the results view (no CRT boot — not a roll). The hash is stripped via `history.replaceState(null, '', pathname)`.
2. Else a saved state restores without the intro.
3. Else the intro renders with the die idle cycle.

If the hash is malformed, intro loads normally and a toast fires after ~300 ms: "That build code didn't work. Starting fresh."

Every mutation (`saveBuildState`) writes the current build. Preferences and pins persist across resets; only `pocket-dystopia-state` is cleared by Clear this build.

### 4.6 Share codes + URL hashes

```js
encodeBuild(state) = btoa(encodeURIComponent(JSON.stringify(state)))
decodeBuild(code)  = JSON.parse(decodeURIComponent(atob(code)))
```

For URL fragments, the payload is made URL-safe:
- `+` → `-`
- `/` → `_`
- `=` padding → stripped

`buildShareUrl(state)` returns `${origin}${pathname}#build=<url-safe-base64>`. `fromUrlSafeBase64()` reverses the mapping on load.

Decode validates that `version` and `sections` exist; returns `null` on failure.

### 4.7 Logline (new in revision 1)

A one-line stitched summary rendered above the card grid:

```
In {setting.where}, {setting.when}.
{hero.traits[0]} meets {villain.traits[0]}.
{squad.traits[0]} gets dragged in. {obstacles.traits[0]}.
```

Derived from 6 state keys listed in `LOGLINE_SOURCE_KEYS`. The logline re-renders on every `renderCards()` but only plays the fizzle animation when one of those source keys changed since the last render. A "Copy logline" button beside the logline box writes the plain text to clipboard.

Source-key changes are announced via the sr-only live region so screen-reader users hear the new stitched sentence without re-scanning each card.

### 4.8 Pinned builds (new in revision 1)

Six fixed slots. Invoked by the top-bar pin icon or the `P` shortcut.

- **Top-bar click**: opens the panel in "view" mode. Empty slots show `+`; filled slots show label, relative time, and Load/Rename/Delete controls.
- **`P` shortcut / `+` click**: pins the current build to the first empty slot. If all slots are full, enters "choose a slot to replace" mode with red overlay per slot and a Cancel button.
- **Label editing**: pencil button swaps the label for an inline input that commits on blur or Enter.
- **Delete**: reuses the confirm dialog with "Delete this pin?" copy; the dialog's Yes handler is hijacked via `data-mode="pin-delete"` and restored to the default `executeReset` on close.

### 4.9 Copy build (plain text)

`formatBuildText()` emits the same terminal-style layout as the original build:

```
POCKET DYSTOPIA - Story Seed
============================

>> THE HERO
> <trait 1>
> <trait 2>
> <trait 3>
WEAK: <weakness>
TRAUMA: <trauma>

>> THE VILLAIN
...
```

Clipboard write via `navigator.clipboard.writeText`. On success: "Copied" toast + green check icon flash on the trigger button for 1 s. On failure: "Copy failed" toast.

### 4.10 Screenshot

`saveScreenshot()` calls `html2canvas(resultsContainer, { scale: 2, useCORS: true, backgroundColor: <current --bg-primary>, logging: false })`, converts to a blob, and triggers a download as `pocket-dystopia-<timestamp>.png`. On success: "Screenshot saved" toast + icon flash. If `html2canvas` failed to load: "Screenshot failed" toast.

### 4.11 Reset

`confirmReset()` opens the reset dialog with title "Clear this build?" and body "Your current roll and all your locks go away. Your pinned builds and settings stay." Buttons: `Keep it` (cancel) / `Clear it` (destructive red). On confirm:

- Clears `pocket-dystopia-state`
- Leaves `pocket-dystopia-prefs` and `pocket-dystopia-pins` intact
- Returns to intro

The Home icon in the top bar is **non-destructive**: it opens the intro with the build state preserved. If a saved build exists, the intro shows a resume row under the die: "You have a build in progress. [Resume] [Clear it]".

---

## 5. UI Structure

### 5.1 Screens

Two root containers, swapped via classes:

- `#intro-screen` — the landing screen. Hidden via `.hidden`.
- `#results-screen` — the build view. Shown via `.active`.

Rendering is imperative: `showResults()` and `showIntro()` toggle the classes and reset state as needed.

### 5.2 Intro screen

- `h1.text-display` title "POCKET DYSTOPIA" in `--text-primary` with a cyan glow halo.
- 2-line subtitle: "Roll a satirical dystopian seed. / Lock what you love, re-roll the rest."
- Tappable die (`#die-container`, `role="button"`) with pip-based SVG face. Idle cycle animates face swaps every 600 ms. `aria-label="Roll the die"`; the visible hint ("tap to roll" on touch, "click to roll" on pointer+hover) is `aria-hidden`.
- Conditional resume row (visible iff `pocket-dystopia-state` exists): "You have a build in progress. [Resume] [Clear it]".
- Collapsible "Have a build code?" disclosure — collapsed by default, expands inline to reveal input + Load button. Autofocuses the input on expand.
- Footer credit line with heart and outbound link.

### 5.3 Results screen

**Top bar** (`.top-bar`, sticky) — icon row with (right-handed, left-to-right):

1. Home icon (mobile only) / "POCKET DYSTOPIA" logo (desktop). Non-destructive — opens intro without clearing state.
2. Undo (`disabled` until history is non-empty; shows "Undo roll" label for 1.5 s on transitions from disabled → enabled).
3. Share (opens the export hub modal).
4. Pinned builds (opens the pinned panel).
5. More overflow (`more_vert` icon) — popover containing theme toggle, left-handed toggle (mobile only), keyboard shortcuts, and the destructive "Clear this build" action.
6. **Roll** primary button with a continuously cycling d6 icon.

**Controls bar** (below top bar):

- Custom mood combobox (replaces native `<select>`): button + listbox with full ARIA (combobox/listbox/option), arrow-key navigation, cyan checkmark on the selected option. Capped at 280 px width on desktop; takes the full row on narrow mobile.
- View toggle (Expanded / Compressed) — demoted visually: smaller, outlined, 12 pt uppercase. Mobile only; hidden on `≥ 1024 px`.

**Logline** — renders between the controls bar and the cards grid, above the first card. See §4.7.

**Cards grid** (`#results-container`): 5 cards rendered by `renderCards()` in this order: Hero, Villain, Squad, Setting, Obstacles. Desktop layout is a 2-column grid.

**Footer**: same credit line as intro.

### 5.4 Card anatomy

Each card:

- Header: plain `<h2>` title `>> <TITLE>` with the `>>` as aria-hidden `--text-tertiary` decoration. Title color: Hero green, Villain red, others `--text-primary`.
- Role-coded 2 px top stripe (Hero green, Villain red). Others plain.
- Action strip (consistent order at both levels, spec'd in phase 2): **re-roll → lock → chevron (mobile only)**.
- Summary line (one-liner, visible only when collapsed).
- Body: a list of `.trait-line` rows. Each row has either a `>` prefix or a `WEAK` / `TRAUMA` / `WHEN` / `WHERE` label (all `--text-secondary`), the trait text, and a per-trait action group (swap + lock).
- Locking a card paints an amber ring + soft glow. Locking a trait paints an amber 2 px left border on the row.
- Per-trait action buttons: 20 % opacity by default, 70 % on hover/focus, full opacity when locked. Swap uses the `replay` icon; lock uses `lock_open` / `lock`.

Cards are collapsible on mobile only via the chevron button (≥ 768 px always expanded; chevron hidden).

### 5.5 Modals and dialogs

All dialogs use a shared focus manager (`openModal` / `closeModal` in app.js): initial focus moves to the first focusable, Tab is trapped inside, focus returns to the trigger on close.

- **Share modal** (`#share-modal`): export hub with Web Share API button (shown only if `navigator.share` exists), Copy link (primary), Copy as text, Save as image, and a collapsed "Or share as code" disclosure revealing the base64 textarea + Copy code button.
- **Pinned builds panel** (`#pinned-modal`): 2-column grid (mobile) / 3-column (desktop). Shows description when empty; replace-mode shows overlay + Cancel button.
- **Keyboard shortcuts panel** (`#shortcuts-modal`): 2-column on desktop, single-column on mobile. Each row is a styled `<kbd>` + description. "Got it" close button.
- **Confirm dialog** (`#confirm-overlay`): title + body + two buttons. Copy adapts between reset flow ("Clear this build?") and pin-delete flow ("Delete this pin?") via `dataset.mode`.
- **Toast** (`#toast`, `role="status"`, `aria-live="polite"`, `aria-atomic="true"`): 2-second auto-dismiss. Duplicate strings re-announce via clear-then-set pattern.
- **Silent announcer** (`#sr-announce`, `aria-live="polite"`): hidden via `.sr-only`. Used for state changes that don't warrant a visible toast (lock toggles, logline updates).

### 5.6 More overflow menu

Popover triggered by the `more_vert` button. Items:

- Light mode / Dark mode (label reflects current theme)
- Left-handed layout (`role="menuitemcheckbox"`, mobile-only via `@media (min-width: 1024px) { display: none }`)
- Keyboard shortcuts (opens shortcuts modal)
- Divider
- Clear this build (destructive red)

Arrow-key navigation, Home/End, Escape to close, click outside to close. `aria-haspopup="menu"` on the trigger, `role="menu"` on the panel.

---

## 6. Design System

### 6.1 Color tokens

**Dark (default)** — from `:root` in `styles.css`:

| Token | Value | Role |
|---|---|---|
| `--bg-primary` | `#080A0D` | Page background |
| `--bg-secondary` | `#0D1117` | Card surface |
| `--bg-elevated` | `#161B22` | Inputs, modal, elevated buttons |
| `--bg-overlay` | `#1E2329` | Hover surface |
| `--text-primary` | `#E6EDF3` | Body text |
| `--text-secondary` | `#8B949E` | Muted text, data labels (WEAK, TRAUMA, WHEN, WHERE) |
| `--text-tertiary` | `#737B85` | Very muted (bumped from `#4A5568` for WCAG AA) |
| `--text-inverse` | `#080A0D` | Text on cyan buttons |
| `--accent-cyan` | `#00E5FF` | **CTA-only**: Roll pill, focus outlines, menu checkmarks, primary modal buttons |
| `--accent-hero` | `#4ADE80` | Hero heading + top stripe |
| `--accent-villain` | `#FF4D4D` | Villain heading + top stripe, destructive actions, errors, heart glyph |
| `--accent-amber` | `#FFB020` | Reserved (was used for data labels; now none) |
| `--accent-lock` | `#FFB020` | Lock state (amber, framed as "held / preserved") |
| `--accent-lock-glow` | `rgba(255, 176, 32, 0.35)` | Lock ring halo |
| `--border-default` | `#30363D` | Default borders |
| `--border-subtle` | `#21262D` | Subtle dividers |
| `--border-accent` | `#00E5FF` | Focus / accent borders |

**Light (`[data-theme="light"]`)**: lighter bg palette, `#0891B2` cyan, `#16A34A` hero, `#DC2626` villain, `#D97706` lock amber.

### 6.2 Role color assignment

- **Hero** `THE HERO` — green, 2 px top stripe.
- **Villain** `THE VILLAIN` — red, 2 px top stripe.
- **Squad / Setting / Obstacles** — `--text-primary` heading, no stripe.
- **WEAK / TRAUMA / WHEN / WHERE labels** — `--text-secondary` (demoted from amber in phase 12).

### 6.3 Spacing scale

```
--space-2xs  2px
--space-xs   4px
--space-sm   8px
--space-md   12px
--space-lg   16px
--space-xl   24px
--space-2xl  32px
--space-3xl  48px
--space-4xl  64px
```

### 6.4 Border radii

```
--radius-none 0px
--radius-sm   4px
--radius-md   8px
--radius-lg   12px
--radius-xl   24px
```

### 6.5 Typography

Two families:

- `--font-display`: `'Space Grotesk', system-ui, sans-serif` — titles, logo.
- `--font-body`: `'Space Mono', 'Courier New', monospace` — everything else.

Type scale is HIG-aligned:

| Class | Size | HIG role |
|---|---|---|
| `.text-display` | `clamp(1.75rem, 5.5vw, 2.5rem)` | Title1 → Large Title |
| `.text-heading` | `1.25rem` | Title3 (20 pt) |
| `.text-subheading` | `1.0625rem` bold uppercase | Headline (17 pt) |
| `.text-body` | `1.0625rem` | Body (17 pt) |
| `.text-caption` | `0.8125rem` | Footnote (13 pt) |
| `.text-micro` | `0.6875rem` | Caption2 (11 pt) |

### 6.6 Iconography

Material Symbols Outlined, variation settings `'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24`. `.icon-filled` switches `FILL` to `1` — used for the locked state.

Notable icon choices:

- Card-level re-roll: `casino`
- Trait-level swap: `replay` (distinct from card-level)
- Card lock / trait lock: `lock_open` / `lock`
- Chevron (card disclosure): `expand_more`, rotates 180° on expand
- Share: `share`
- Web Share API: `share` (platform-neutral)
- Pin: `push_pin`
- More: `more_vert`
- Copy: `content_copy`, swaps to `check` for 1 s on success
- Home: `home`

### 6.7 Focus indicators

Global `:focus-visible { outline: 2px solid var(--accent-cyan); outline-offset: 2px; }`. Skip link materializes on focus.

---

## 7. Animations & Motion

All animations respect `prefers-reduced-motion: reduce` — the global rule overrides animation-duration to 0.01 ms and collapses transitions. Several effects (CRT scanlines, die fizzle, shake, trait glow, card pulse) are explicitly disabled. The CRT scanline overlay is also disabled under `prefers-contrast: more`.

| Animation | Duration | Where it fires |
|---|---|---|
| `die-float` | 3 s loop | Idle vertical bob on the intro die |
| `glow-pulse` | 4 s loop | Cyan drop-shadow pulse on the intro die |
| `die-fizzle` | 260 ms, 8-step | CRT static on the intro die face; every 3rd face swap |
| `die-shake` | 110 ms loop | While `isRolling` is true |
| `tumble-{x,x-neg,y,y-neg,diag}` | 650 ms | Top-bar "roll all" tumble; random pick avoids immediate repeats |
| `trait-fizzle` + `trait-fizzle-scan` | 460 ms, 10-step | Applied only to traits whose text changed between renders |
| `trait-glow` (new) | 550 ms | Cyan text-shadow pulse on the same trait rows that fizzle |
| `crt-boot` | 600 ms cubic-bezier | First-roll transition from intro to results |
| `logline-fizzle` (new) | 460 ms | When any `LOGLINE_SOURCE_KEYS` state changes |
| `card-pulse` (new) | 400 ms | Only on section-level re-rolls (not whole-build or trait swap). Role-colored for Hero (green) and Villain (red); cyan otherwise |
| Lock border / ring transition | 150 ms | Trait-row border and card ring fade in/out on lock toggle |
| Chevron rotation | 200 ms | Card disclosure expand/collapse |
| Undo label slide | 250 ms | Inline "Undo roll" label expands/collapses on disabled→enabled transition |
| Scanline overlay | static | `body::before` linear-gradient at `100% 3px`, 0.06 alpha, `mix-blend-mode: multiply` (disabled under reduced motion + prefers-contrast more) |

The fizzle diff uses `snapshotTraitTexts(state)` to build a flat `{ "sectionKey:traitPath": text }` map, compared to the previous render's snapshot. First render (no prior snapshot) skips fizzle entirely because `crt-boot` already carries the animation weight.

---

## 8. Responsive Behavior

Breakpoints:

| Width | Changes |
|---|---|
| `< 360 px` | Trait text drops to 1 rem with tighter letter-spacing; card-action buttons drop to 32×32 |
| `< 480 px` | Mood combobox takes full row via `flex: 1 1 100%` |
| `< 600 px` | Hide `.top-bar-left` (logo). Show `#btn-home` home button. Cards collapsible. Mobile-optimized card padding. More menu flips to anchor-left |
| `600–1023 px` | Cards grid capped at 700 px and centered |
| `≥ 768 px` | Cards permanently expanded. Card chevron hidden |
| `≥ 1024 px` | 2-column grid. Hide `.view-toggle` and the left-handed menu item entirely. Mood combobox capped at 280 px |

Mobile polish:
- `#btn-roll-all` uses `margin-left: auto` (right-handed) or `margin-right: auto` (row-reversed left-handed) to push the die button to the far edge of the top bar.
- Top-bar icon buttons shrink to 36×36 min size (from 44×44) on results screen.

Left-handed mode (`[data-left-handed="true"]`):
- Flips `.top-bar`, `.top-bar-left`, `.top-bar-right`, `.card-header`, `.card-header-actions` to `flex-direction: row-reverse`.
- The per-trait `.trait-actions` group reorders via `order: -1`.
- More menu anchors left instead of right.
- Persisted in prefs; toggled via the More menu.

---

## 9. Accessibility

### 9.1 Landmarks & structure

- `<a class="skip-link" href="#main-content">` for keyboard bypass; appears on focus.
- `role="main"` on intro; `<main id="main-content">` on results.
- Visually-hidden `<h1>Your build</h1>` on results screen so the heading tree has a root.
- Cards are `<section aria-labelledby="card-title-<key>">` with `<h2>` titles.

### 9.2 ARIA patterns

- Card chevron button: `aria-expanded`, `aria-controls`, dynamic `aria-label` ("Collapse The Hero" / "Expand The Hero").
- All lock buttons: `aria-pressed` reflects state; labels use "Lock this card" / "Keep this" / "Release this".
- Segmented view toggle: `role="group" aria-label="View mode"` with `aria-pressed` on each option.
- Toast: `role="status" aria-live="polite" aria-atomic="true"`. `showToast()` clears then re-sets text so duplicate strings re-announce.
- Silent announcer (`#sr-announce`): `aria-live="polite" aria-atomic="true"`. Fires on section/trait lock state changes and logline source updates.
- Load-error region: `role="alert" aria-live="polite"`.
- Modals: `role="dialog" aria-modal="true" aria-labelledby` on all four (share, pinned, shortcuts, confirm). Real focus trap (see below).
- Die container: `role="button" tabindex="0" aria-label="Roll the die"`.
- More menu: trigger has `aria-haspopup="menu" aria-expanded`; panel is `role="menu"`; left-handed item is `role="menuitemcheckbox"` with `aria-checked`.
- Mood combobox: `role="combobox" aria-haspopup="listbox" aria-expanded aria-controls`; panel is `role="listbox"`; options are `role="option"` with `aria-selected`.

### 9.3 Modal focus management

On modal open:
1. Remember the triggering element.
2. Move focus to the first focusable inside the modal.
3. Trap Tab / Shift+Tab to cycle within the modal.

On close:
1. Restore focus to the remembered trigger.

Implemented via `modalFocusStack`, `openModal()`, `closeModal()`, `trapTab()`, `initModalFocusTrap()` in app.js. All four modals route through these helpers.

### 9.4 Labels

- Decorative icons: `aria-hidden="true"`.
- `sr-only` class for visually hidden form labels, the results h1, and the announcer region.
- Trait swap buttons inline the trait text into the accessible name ("Swap trait: <escaped text>" truncated to 40 chars).
- Share code textarea: `tabindex="-1"` so screen-reader users skip the base64 noise; label explicitly says "copy with the Copy code button".
- Die hint ("tap to roll" / "click to roll") is `aria-hidden`; the die itself carries the accessible name.

### 9.5 Touch & motion

- 44×44 minimum touch target on all top-bar and intro buttons.
- 36×36 on in-card density buttons (card action strip, trait action buttons, logline copy, pin-slot icons, view toggle). Spec'd trade-off for density.
- `-webkit-tap-highlight-color: transparent` on the die.
- `prefers-reduced-motion: reduce` disables scanline overlay, die shake, fizzle animations, card pulse scale, trait glow, chevron rotation, undo label transition.
- `prefers-contrast: more` additionally disables the scanline overlay.

### 9.6 Contrast

All text tokens meet WCAG AA against their paired bg in both themes (`--text-tertiary` bumped in the revision 1 audit from `#4A5568` to `#737B85` to pass). Villain red, amber lock, hero green, and secondary grey verified at 4.5:1+ against card bg. Lighthouse accessibility score: **100/100** on both desktop and mobile.

### 9.7 Keyboard shortcuts

See §10.1.

---

## 10. Event & Input Map

### 10.1 Keyboard

Global shortcut handler suppresses shortcuts when any input/textarea/contenteditable is focused, or when any modal is open (except `?` and Escape).

| Key | Context | Action |
|---|---|---|
| Enter / Space | `#die-container` focused | `rollDie()` |
| `R` | Results screen | Roll all |
| `Z` | Results screen | Undo (toast if empty) |
| `C` | Results screen | Copy as text |
| `S` | Results screen | Open share modal |
| `P` | Results screen | Open pinned panel in pin-current mode |
| `L` | Results screen | Toggle light / dark |
| `1` – `5` | Results screen | Re-roll card 1 through 5 (Hero, Villain, Squad, Setting, Obstacles) |
| `?` | Anywhere | Open keyboard shortcuts panel |
| Escape | Any time | Close any open modal or menu |
| Tab / Shift+Tab | All | Standard focus traversal; trapped inside open modals |
| Arrow keys | More menu, mood listbox | Navigate items / options |

Modifier combos (Cmd/Ctrl/Alt) are never hijacked; single keys only.

### 10.2 Pointer

- Clicks on dialog overlays dismiss (checks `e.target === e.currentTarget` to avoid bubbling from inside the dialog).
- Click outside the More menu, mood listbox, or share-code disclosure closes them.

### 10.3 Device motion

`initShakeDetection()` attaches `devicemotion`. On iOS (`DeviceMotionEvent.requestPermission` present), the first user click triggers the permission prompt once, then attaches the listener on grant. Threshold: any axis > 15 m/s². Cooldown: 1 s between triggered rolls.

---

## 11. Functions of Note (app.js)

| Function | Purpose |
|---|---|
| `init()` | Entry point; wires up all listeners, applies prefs, checks URL hash, restores state |
| `applyPrefs()` / `loadPrefs()` / `savePrefs()` | Preferences read/write with fallback defaults |
| `applyMood()` / `selectMood()` | Mood combobox state sync |
| `getDieFaceSVG()` / `setDieFace()` / `startRollIconCycle()` / `startDieIdleCycle()` | Die rendering + idle cycles |
| `rollDie()` | Orchestrates the full roll animation + state update |
| `generateNightmare()` / `createBuildState()` | Produces a build state, respecting locks |
| `rerollSection(key)` | Section-scoped re-roll |
| `rerollSingleTrait(key, type, index?)` | Single-trait swap, avoiding duplicates |
| `getWeightedItems()` / `shuffleAndPick()` / `pickOne()` | Mood-weighted random selection |
| `renderCards()` | Imperative DOM render with fizzle diffing + card-pulse queue |
| `renderLogline()` / `buildLoglineText()` / `copyLogline()` | Logline rendering + clipboard |
| `snapshotTraitTexts()` | Flattens state to a key→text map for diffing |
| `toggleSectionLock()` / `toggleTraitLock()` | Immutable lock updates + sr-only announcements |
| `pushHistory()` / `undo()` / `updateUndoButton()` | History stack + Undo label animation |
| `copyBuild()` / `formatBuildText()` | Plain-text clipboard export |
| `saveScreenshot()` | html2canvas → PNG download |
| `encodeBuild()` / `decodeBuild()` / `toUrlSafeBase64()` / `fromUrlSafeBase64()` / `buildShareUrl()` | Share-code codec + URL-safe variant |
| `tryLoadFromHash()` | Reads `#build=...` on init, strips hash via `window.history.replaceState` |
| `openShareModal()` / `closeShareModal()` / `copyShareLink()` / `copyShareCode()` / `shareViaWebShareApi()` / `toggleShareCodeDisclosure()` | Share modal controller |
| `loadBuildFromInput()` / `toggleLoadDisclosure()` | Intro-screen share-code restore |
| `saveBuildState()` / `loadSavedState()` | `localStorage` I/O |
| `confirmReset()` / `closeConfirm()` / `executeReset()` / `goHome()` / `resumeBuild()` | Reset flow + non-destructive Home |
| `loadPins()` / `savePins()` / `pinCurrentToSlot()` / `replaceSlot()` / `loadPin()` / `startRenamePin()` / `confirmDeletePin()` / `executePinDelete()` / `renderPinnedSlots()` / `openPinnedPanel()` / `closePinnedPanel()` / `openPinnedPanelForPinning()` / `cancelReplaceMode()` | Pinned builds system |
| `openMoreMenu()` / `closeMoreMenu()` / `toggleMoreMenu()` / `handleMenuAction()` / `updateMoreMenuState()` / `initMoreMenu()` | More overflow menu |
| `openShortcutsPanel()` / `closeShortcutsPanel()` / `initShortcuts()` | Keyboard shortcuts |
| `openModal()` / `closeModal()` / `trapTab()` / `getFocusable()` / `initModalFocusTrap()` | Modal focus manager |
| `toggleMoodListbox()` / `openMoodListbox()` / `closeMoodListbox()` / `initMoodCombobox()` | Custom mood combobox |
| `showToast()` / `announce()` | Visible toast + silent sr-only announcer |
| `flashCopyCheck()` | Brief green-check icon swap on successful copy |
| `escapeHtml()` | DOM-based HTML escaper |

Immutable update discipline: all state-mutating helpers (`rerollSection`, `rerollSingleTrait`, `toggleSectionLock`, `toggleTraitLock`) return fresh `buildState` objects via spread. `pushHistory` deep-clones via JSON round-trip.

---

## 12. Meta & Social

From `index.html`:

- `<title>`: "Pocket Dystopia"
- `<meta name="description">`: "Roll a satirical dystopian story seed. Lock traits, re-roll sections, share your build."
- `<meta name="theme-color">`: `#080A0D`
- Favicons: .ico (multi-size), 16 / 32 / 192 / 512 PNG, `apple-touch-icon.png` (180×180).
- Open Graph: title, description, `og:image` (1200×630), canonical URL.
- Twitter: `summary_large_image`.

The OG image is `og-image-v2.png`.

---

## 13. Known Trade-offs

- **No framework / no bundler**: `data.js` and `app.js` are global-scoped scripts. Cohesion is maintained via comment banners rather than module boundaries.
- **Imperative DOM rendering**: `renderCards()` rewrites `innerHTML` on every state change. Fine at this scale; the fizzle diff prevents re-animating unchanged rows.
- **`document.execCommand('copy')` fallback**: legacy path used in `copyShareCode()` when `navigator.clipboard` rejects.
- **`html2canvas` CDN dependency**: offline-first first load is possible but screenshot won't work until the CDN asset is cached.
- **Left-handed mode CSS row-reverse**: keyboard tab order follows the DOM, so it reverses visually in left-handed mode. Treated as acceptable: thumb-proximate tab-first is arguably what the user wanted when they enabled this preference.
- **Share code textarea**: base64 noise, `tabindex="-1"` to keep screen readers away. The Copy code button is the intended interaction.
- **Trait pool duplication across moods**: a trait tagged `corporate` and `ai-takeover` can appear in either filter; dedupe is on `text`, so no double-picks in one render.

---

## 14. Testing Surface (manual)

Smoke path to verify the build end-to-end:

1. Hard reload intro → idle die cycles, 2-line subtitle, collapsed "Have a build code?" disclosure, no resume row.
2. Click die → shake, CRT boot, 5 cards render with a logline above them. Hero green + top stripe, Villain red + top stripe.
3. Lock a trait → amber left border. Re-roll that section → locked trait stays put. Card pulses briefly (cyan for non-role cards, role color for Hero/Villain).
4. Lock an entire section → amber ring + glow; section-level re-roll is disabled.
5. Swap a single trait via the row-level swap button → just that trait changes, row fizzles and glows, logline re-renders only if the swapped trait is a source key.
6. Switch mood via the custom combobox → unlocked traits re-shuffle under the new weighting.
7. Toggle view (mobile) → compressed shows only the first trait as a summary.
8. Open the More menu → Light/Dark, Left-handed (mobile only), Keyboard shortcuts, divider, Clear this build. Toggle theme, toggle left-handed.
9. Press `?` → shortcuts panel opens with styled `<kbd>` keys. Esc closes.
10. Press `R`, `Z`, `3`, `C`, `S`, `P`, `L` and verify each shortcut fires.
11. Undo → reverts last roll. "Undo roll" label flashes briefly after any destructive action.
12. Copy (from share modal or `C` shortcut) → clipboard contains the formatted plain-text build. Icon briefly flashes green check.
13. Save screenshot (from share modal) → PNG download.
14. Share → new modal shows Copy link as primary, Web Share API if available, Or share as code disclosure. Copy link → URL loads on fresh tab with no intro and no hash in address bar. Corrupt the hash → toast fires after ~300 ms.
15. Tap Pin icon → panel opens with 6 slots. Pin current build, rename, delete, load. Fill all 6 then press `P` → replace mode.
16. Tap Home → intro with resume row if a saved build exists. Resume or Clear it.
17. Clear this build (from More menu) → confirm dialog with "Clear it" destructive button. Pins and prefs persist after clear.
18. Toggle theme via More menu → palette swaps including all role colors. Reload → theme persists.
19. Toggle left-handed (mobile) → top bar flips, trait buttons move to the left of the text.
20. Shake a mobile device (after granting motion permission on iOS) → triggers a roll.
21. Reload the page after any of the above → state restores exactly.

### Accessibility check

- Lighthouse: 100/100 Accessibility on both desktop and mobile.
- All interactive elements keyboard-reachable; focus visible on every button.
- Modals trap focus; Escape closes and restores focus to trigger.
- Screen reader announces lock toggles, logline updates, and toast messages.
- Under `prefers-reduced-motion: reduce`, scanlines + motion effects disable.
- Under `prefers-contrast: more`, the CRT scanline overlay additionally disables.
