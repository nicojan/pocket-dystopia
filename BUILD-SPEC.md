# Pocket Dystopia — Build Specification

> A satirical dystopian story-seed generator. Roll a die to randomize a hero, villain, squad, setting, and obstacles. Lock what you like, re-roll the rest, share the result via a link. Elementary-school-safe humor with an amber-phosphor terminal aesthetic.
>
> This document describes the **current implemented build** (revision 2: the UX-audit pass, plus the present view, printable worksheet, expanded trait pools and automated tests; see [`UX-AUDIT-2026-10-13.md`](UX-AUDIT-2026-10-13.md) for the audit findings) with the 2026-10-14 visual and motion redesign applied on top (palette, type, lock rendering and motion system, §6 and §7; rationale in [`VISUAL-AUDIT-2026-10-14.md`](VISUAL-AUDIT-2026-10-14.md)). For the original pre-implementation design intent, see [`spec.md`](spec.md).

---

## 1. Overview

| Item | Value |
|---|---|
| Type | Static client-side web app (single page) |
| Build step | None (open `index.html` directly or serve the directory) |
| Runtime dependencies | Google Fonts and a Material Symbols icon subset (both CDN). No scripts from third parties |
| Persistence | `localStorage` |
| Sharing | URL hash (`#b=...`, a ~28-character index-packed code) or the bare code, with Web Share API on supported devices. Legacy `#build=...` links still load |
| Offline support | No service worker. Works offline only from the browser cache; fonts and icons come from the CDN and may fall back |
| Installable | `manifest.webmanifest` (standalone display, 192/512 icons) |
| Deployment | Cloudflare Workers static assets at `pocketdystopia.forhuman.ca` (see `wrangler.toml`: no Worker script, the repo root is served as-is minus `.assetsignore`). **A push to `main` deploys** via Cloudflare Workers Builds (the GitHub check "Workers Builds: pocket-dystopia"); no local `wrangler` login is needed. The e2e suite runs as a separate check and does not gate the deploy |

### File layout

```
Pocket Dystopia/
├── index.html        # ~380 lines. Markup: intro + results screens, phone action bar, 4 modals, present view, print worksheet, toast, sr-only announcer, credit footer
├── styles.css        # ~2440 lines: tokens, components, animations, responsive, a11y, present view, print
├── data.js           # ~320 lines. Trait pools (28–34 per pool), tagged with mood categories. APPEND-ONLY (see §3.1)
├── app.js            # ~2850 lines: state, rolling, rendering, validation, share codes, share image, pins, present view, worksheet, shortcuts, modal focus, a11y
├── manifest.webmanifest  # Web app manifest (name, colours, 192/512 icons, standalone)
├── wrangler.toml     # Cloudflare Workers static-assets deploy config
├── spec.md           # Original pre-build design spec (historical)
├── BUILD-SPEC.md     # This document
├── UX-AUDIT-2026-10-13.md  # The 27-finding UX audit and the fix chosen for each
├── VISUAL-AUDIT-2026-10-14.md  # The visual and motion audit: why the palette, type, lock and motion changed
├── favicon.ico, favicon-16.png, favicon-32.png
├── icon-192.png, icon-512.png, apple-touch-icon.png
├── og-image-v4.png   # 1200×630 Open Graph image (rendered from tools/og-image.html). (v3 retired and removed)
├── tools/            # og-image.html + render-og.mjs, icon.html + render-icons.mjs (not served)
├── tests/            # Playwright e2e suite, own package.json (not served; see §14)
└── .github/workflows/test.yml  # Runs the suite on push and PRs
```

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Markup / logic | Vanilla HTML + JS (no framework) | Two `<script>` tags: `data.js`, then `app.js` |
| Styling | Plain CSS with custom properties | Dark mode default; `[data-theme="light"]` override. `setThemeAttr()` also keeps `<meta name="theme-color">` in step with the theme |
| Fonts | `Atkinson Hyperlegible Next` (body, Human's web body face) and `Atkinson Hyperlegible Mono` (terminal scaffolding) via Google Fonts | Loaded via stylesheet `<link>`, with `preconnect` hints to `fonts.googleapis.com` and `fonts.gstatic.com`. See §6.5 |
| Icons | Material Symbols Outlined via Google Fonts, requested as an `icon_names` subset (~5 KB instead of ~4 MB) | Axes pinned to what the CSS uses: `opsz 24, wght 300, FILL 0..1, GRAD 0`. `display=block` so ligature names never flash as text |
| Share image | Native `<canvas>` 2D drawing | No library. See §4.10 |
| Persistence | `localStorage` | Three keys: `pocket-dystopia-state`, `pocket-dystopia-prefs`, `pocket-dystopia-pins` |
| Share codes | v2: pool indices packed into 21 bytes, base64url (~28 chars). v1 legacy: `btoa(encodeURIComponent(JSON.stringify(state)))` | See §4.6 |

### CDN links (from `index.html`)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:wght@400;700&family=Atkinson+Hyperlegible+Next:wght@400;500;600;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,300,0..1,0&icon_names=add,arrow_forward,back_hand,casino,check,chevron_right,close,content_copy,dark_mode,delete,download,edit,expand_more,keyboard,light_mode,link,lock,lock_open,more_vert,push_pin,replay,share,tune,undo,upload,vibration&display=block" rel="stylesheet">
<link rel="manifest" href="manifest.webmanifest">
```

`icon_names` must stay alphabetical, and a new icon name has to be added to that list before it is used or it renders as its ligature text. The viewport meta also carries `viewport-fit=cover` so the phone action bar can respect the safe-area insets.

---

## 3. Data Model

### 3.1 Trait pool shape (`data.js`)

All pools live under a single `DATA` object. Every item is `{ text: string, mood: string[] }`. The `mood` array tags the trait with one or more mood categories; an empty array marks a neutral item that fits any mood.

**`data.js` is append-only.** v2 share codes store each trait as its index in its pool, so reordering, inserting or deleting an entry silently changes what every previously shared link shows. New entries go at the END of a pool; to retire one, edit its text in place. Each pool must stay under 256 entries (one byte per index). A comment at the top of `data.js` says the same, and `tests/specs/data.spec.mjs` enforces it against `tests/fixtures/pool-snapshot.json` (regenerate that snapshot only after appending, never to paper over a reorder).

```js
const DATA = {
  heroTraits:       [{ text, mood }, ...],
  heroWeaknesses:   [{ text, mood }, ...],
  heroTraumas:      [{ text, mood }, ...],
  villainTraits:    [{ text, mood }, ...],
  villainWeaknesses:[{ text, mood }, ...],
  squadMembers:     [{ text, mood }, ...],
  settings:         [{ text, mood }, ...],
  times:            [{ text, mood }, ...],
  obstacles:        [{ text, mood }, ...],
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

The shape is unchanged and still `version: 1` (the `version` inside a build is the state schema, separate from the share-code version in §4.6). Every build that arrives from outside, meaning a URL hash, a pasted code, `localStorage` state or a pin, goes through `sanitizeBuild()` before use: known sections only with the expected field names and trait counts (hero 3 + weakness + trauma, villain 3 + weakness, squad 3, setting when/where, obstacles 2), each text a trimmed string of 1 to 200 characters that must also be an exact entry of its pool in `data.js` (so a crafted link can't put arbitrary words into the app), `locked` coerced to a boolean, `mood` falling back to `all` unless it is an own key of `MOOD_LABELS` (`isMood()`, so `constructor` and friends are rejected), and anything malformed rejected as a whole (returns `null`).

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
  shake: boolean,                      // shake-to-roll toggle; absent until first set
}
```

### 3.5 Pinned builds

```js
{
  version: 1,
  slots: [
    { state: <full build state>, label: string, createdAt: number } | null,
    ...  // always length 6, null for empty
  ],
}
```

Six fixed slots. Label defaults to the hero's first trait, sentence-cased and truncated to 40 chars; a user label is capped at 60. On load every slot's `state` goes through `sanitizeBuild()` (a bad slot becomes empty); a payload that isn't a six-slot array is discarded and rebuilt as empty slots.

### 3.6 Storage keys

| Key | Payload |
|---|---|
| `pocket-dystopia-state` | Current build state JSON |
| `pocket-dystopia-prefs` | Preferences JSON |
| `pocket-dystopia-pins` | Pinned builds JSON |

---

## 4. Core Behavior

### 4.1 Rolling

Four entry points, all funnelling through `rollDie()`:

1. **Intro-screen die** (`onclick="rollDie()"` on `#die-container`). First roll triggers CRT-boot animation on the results container.
2. **Roll button on the results screen.** Above 600 px it is the primary pill in the top bar with a cycling d6 icon and a visible "Roll" label. At 600 px and below it moves to the bottom action bar (§5.3). Plays a tumble animation (§7); swaps content at 300 ms, just past the midpoint, while the die is edge-on.
3. **Shake-to-roll** on touch devices with `DeviceMotionEvent`, controlled by a More-menu toggle (see §10.3). Threshold 15 m/s² on any axis, cooldown 1 s, ignored while a modal is open.
4. **Keyboard shortcut** `R` on the results screen.

Rolling is guarded by `isRolling` to prevent re-entry.

### 4.2 Weighted selection (mood)

`getWeightedItems(pool, count, mood)` in `app.js`:

- `mood === 'all'` → simple shuffle with de-dupe on `text`.
- Otherwise → expand the pool so items whose `mood` array includes the selected mood appear **8×** (a soft bias, not a hard filter).

Dedupe keys on `item.text`.

Changing the mood in the combobox re-rolls every unlocked trait immediately (the mood only means something if it applies) and says so in a toast: "Re-rolled for Corporate dystopia. Locks kept." (or "Re-rolled with all moods. Locks kept."). Undo covers it. Selecting the mood that is already active does nothing.

### 4.3 Re-roll granularity

- **Whole build**: `rollDie()` → `generateNightmare()` replaces unlocked sections only.
- **Section**: `rerollSection(sectionKey)` replaces the unlocked traits/fields within one card.
- **Per trait**: `rerollSingleTrait(sectionKey, traitType, index?)` replaces a single trait's text, avoiding siblings to prevent duplicates. Pushes to history.
- **Lock precedence**: a locked card holds everything in it. Its re-roll and per-trait swap buttons are disabled, its per-trait lock buttons render as held (disabled, tooltip "Card is locked"), `toggleTraitLock()` returns early, and `rerollSingleTrait()` refuses while the section is locked. A trait-level lock blocks re-rolls of that one trait within an unlocked card.

### 4.4 Undo

`history` array, max 20 entries (`MAX_HISTORY = 20`). `pushHistory()` deep-clones via `JSON.parse(JSON.stringify(...))` before any destructive mutation (`rollDie`, `rerollSection`, `rerollSingleTrait`, and every load of a build over an existing one via `adoptLoadedBuild`: shared link, pasted code, pin). `undo()` pops the last snapshot and re-renders. The Undo button's `disabled` attribute reflects `history.length === 0`; both Undo buttons (top bar and phone action bar) are kept in sync by `updateUndoButton()`.

In the top bar the "Undo" label is a floating pill positioned absolutely under the button, so nothing in the bar shifts. It shows for ~1.8 s the first time Undo becomes available in a page session, and on keyboard focus. On phones Undo lives in the bottom action bar with a permanent text label.

Note: lock toggles do **not** push to history.

### 4.5 Persistence lifecycle

On `DOMContentLoaded` → `init()` runs `applyPrefs()` and the other initialisers, then restores the saved build **before** looking at the hash, so a shared link opened on top of a saved build stays undoable. Then:

1. If a `#b=` or `#build=` hash decodes, the build loads straight into the results view through `adoptLoadedBuild()` (no CRT boot, since it is not a roll), pushing the previous build onto the undo history. The hash is stripped via `window.history.replaceState(null, '', pathname)` whether or not it decoded. If a build was already saved, a toast says "Shared build loaded. Undo to go back."
2. Else a saved state restores without the intro.
3. Else the intro renders with the die idle cycle.

If the hash is malformed, intro loads normally and a toast fires after ~300 ms: "That link didn't work. Starting fresh."

`init()` also re-renders the cards when the viewport crosses the 1024 px collapse breakpoint (rotating a tablet, resizing a window).

Every mutation (`saveBuildState`) writes the current build; the write is wrapped so a full or blocked `localStorage` doesn't break the session. Saved state is read back through `sanitizeBuild()`. Preferences and pins persist across resets; only `pocket-dystopia-state` is cleared by Clear this build.

### 4.6 Share codes + URL hashes

Two code formats, both ending up in the same place (`sanitizeBuild()`).

**v2 (current, `#b=`)**: the build packed into 21 bytes and base64url-encoded (`+`→`-`, `/`→`_`, padding stripped), about 28 characters. Byte layout:

| Byte(s) | Content |
|---|---|
| 0 | Code version (`2`) |
| 1 | Mood index into `MOOD_ORDER` (`all`, `corporate`, `post-apocalyptic`, `ai-takeover`, `political`) |
| 2 | Section-lock bits, one per section in the fixed `CODE_SECTION_ORDER` (setting, hero, villain, squad, obstacles) — deliberately independent of display order |
| 3–4 | Trait-lock bits, little-endian, one per slot in `CODE_SLOTS` order |
| 5–20 | Pool index of each of the 16 slots, in `CODE_SLOTS` order: setting when, setting where, hero traits ×3, hero weakness, hero trauma, villain traits ×3, villain weakness, squad ×3, obstacles ×2 |

The code carries indices, not text, which is why `data.js` is append-only (§3.1) and why a link can no longer smuggle arbitrary text into a page. Decoding rejects any code that isn't exactly 21 bytes with version 2 or that points past the end of a pool.

**v1 (legacy, `#build=`)**: `btoa(encodeURIComponent(JSON.stringify(state)))`, made URL-safe for fragments. Still decoded (through `sanitizeBuild()`, so only builds made of real `DATA` text load). The encoder remains as a fallback for when `encodeBuildV2()` returns `null`, which a sanitized build can't currently trigger. `decodeAnyCode()` never throws (a malformed `%` escape or bad base64 just yields `null`) and strips whitespace first, so a link a mail client wrapped onto two lines still loads.

`encodeBuild(state)` returns the v2 code, else the URL-safe v1 code (this is what the share modal's code box shows). `buildShareUrl(state)` returns `${origin}${pathname}#b=<v2>`, or `#build=<v1>` as the fallback.

`decodeAnyCode(input)` is the single decoder for everything a person might paste: a full link with `#b=` or `#build=`, a bare v2 code, or a bare v1 code (plain or URL-safe base64). Whitespace is stripped from bare codes. It returns a sanitized build or `null`.

### 4.7 Logline

A one-line stitched summary rendered above the card grid:

```
In {setting.where}, {setting.when}.
{hero.traits[0]} meets {villain.traits[0]}.
{squad.traits[0]} gets dragged in. {obstacles.traits[0]}.
```

Trait text is stored lowercase for list use, so each stitched sentence is sentence-cased (first letter capitalised, a closing full stop added unless it already ends in `.`, `!`, `?` or `…`). The source data is untouched.

Derived from 6 state keys listed in `LOGLINE_SOURCE_KEYS`. The logline re-renders on every `renderCards()` but only plays the `logline-enter` animation (§7) when one of those source keys changed since the last render. A "Copy logline" button beside the logline writes the plain text to clipboard. The logline is the page's headline, not a callout: no box, no left rule, 19 to 23 px at weight 500 (`clamp(1.1875rem, 1rem + 0.6vw, 1.4375rem)`), `max-width: 62ch`.

Source-key changes are announced via the sr-only live region so screen-reader users hear the new stitched sentence without re-scanning each card.

### 4.8 Pinned builds

Six fixed slots, opened from the top-bar pin icon.

- **"Pin this build" button** (primary, at the top of the panel): pins the current build to the first empty slot. If the build is already pinned the button reads "Pinned in slot N" and is disabled. If all slots are full it reads "Pin this build (replace one)" and enters "choose a slot to replace" mode (red overlay per slot plus a Cancel button).
- **`P` shortcut**: `pinCurrentBuild()` pins directly to the first free slot with a toast, without opening the panel. If all slots are full it opens the panel in replace mode. If the build is already pinned it toasts "Already pinned in slot N".
- **Empty-slot `+` tiles** still pin to that specific slot.
- **Duplicate detection**: `findPinnedSlot()` compares trait texts order-independently (locks and mood don't count), so the same build can't fill several slots.
- **Slot content**: filled slots show the label, a second line with the setting (`pinSubtitle()`, so two pins with the same hero look different), and relative time. The slot matching the build on screen is highlighted (`.pin-slot-current`), reads "On screen now" and its Load button is disabled.
- **Layout**: 2 columns, 3 at 600 px and up, one column at 480 px and below (so a filled pin has room for Load, rename and delete).
- **Label editing**: pencil button swaps the label for an inline input that commits on blur or Enter. Escape cancels only the rename (it stops propagating, so the panel stays open).
- **Delete**: reuses the confirm dialog ("Delete slot N?", button "Delete"), opened through `openModal()` so focus moves into it and is restored afterwards. The dialog's Yes handler is hijacked via `data-mode="pin-delete"` and restored to the default `executeReset` on close.
- **Load**: goes through `adoptLoadedBuild()`, so it is undoable ("Loaded slot N. Undo to go back.").

### 4.9 Copy build (plain text)

`formatBuildText()` emits a terminal-style layout. It is the one place the caps `title` of `SECTIONS` ("THE SETTING") and the `>>` prefix survive; everywhere visual (cards, present view, share image, worksheet) uses the title-case `display` ("The Setting"): header, the logline, the five sections in display order (`SECTIONS`), then the share URL:

```
POCKET DYSTOPIA - Story Seed
============================

<logline>

>> THE SETTING
WHEN: <when>
WHERE: <where>

>> THE HERO
> <trait 1>
> <trait 2>
> <trait 3>
WEAK: <weakness>
TRAUMA: <trauma>

>> THE VILLAIN
...

<share URL>
```

`copyText()` tries `navigator.clipboard.writeText` and falls back to a hidden-textarea `document.execCommand('copy')`. It is shared by every copy action (text, link, code, logline). On success: a toast ("Copied as text", "Link copied", "Code copied", "Logline copied") + green check icon flash on the trigger button for 1 s. On failure: "Copy failed. Select the text and copy it by hand."

### 4.10 Share image

`saveScreenshot()` (the share modal's "Save as image") draws a purpose-made **1080×1350** PNG on a `<canvas>`. No library and no screenshot of the UI, so the output is identical on every device.

- `renderShareImage(state)` reads the current theme's colour tokens (`--accent-ink` for the `>` prompts, `--accent` for the cursor block), waits for the Atkinson fonts (`document.fonts.load`), fills the background, and calls `layoutShareImage()` twice: first as a measuring pass that shrinks the type scale (down to 0.6×) until everything fits above a 90 px footer, then as the drawing pass.
- `layoutShareImage()` lays out the "Pocket Dystopia" wordmark in Atkinson Hyperlegible Mono with the amber block cursor drawn after it, the logline (Atkinson Next 500, no rule beside it), then the five sections in display order with their title-case `display` names (Hero green, Villain red, others in the primary text colour). Rows are Atkinson Next with the `>` prompts in accent ink and the WEAK/TRAUMA/WHEN/WHERE labels muted, each wrapped with `wrapLines()`. The footer is the host name in Atkinson Mono.
- On coarse pointers where `navigator.canShare({ files })` is true, the image goes to the share sheet (so it can reach Photos); cancelling is silent. Otherwise it downloads as `pocket-dystopia-<timestamp>.png` with an "Image saved" toast. Failures toast "Couldn't make the image" or "Couldn't share the image".

### 4.11 Reset

`confirmReset()` opens the reset dialog with title "Clear this build?" and body "Your current roll and all your locks go away. Your pinned builds and settings stay." Buttons: `Keep it` (cancel) / `Clear it` (destructive red). On confirm:

- Clears `pocket-dystopia-state` and the undo history
- Leaves `pocket-dystopia-prefs` and `pocket-dystopia-pins` intact
- Returns to intro

The "Pocket Dystopia" title in the top bar (a button labelled "Pocket Dystopia, back to start", so the accessible name contains the visible text) is **non-destructive**: it opens the intro with the build state preserved. If a saved build exists, the intro shows a resume row under the die: "You have a build in progress. [Resume] [Clear it]".

### 4.12 Present view (classroom screen)

`openPresent()` (More → "Present to class", or `F`) opens `#present-view`, a full-screen large-type rendering of the current build: brand line, the logline in large type (no rule), then the five sections (Setting full width with WHEN/WHERE side by side, then Hero, Villain, Squad, Obstacles in four columns, two between 761 and 1100 px). It requests browser fullscreen; leaving fullscreen (the browser swallows Esc there) also closes the view via `fullscreenchange`. Type is sized from the viewport (`clamp(15px, 1.25vw + 0.9vh, 40px)` × `--present-scale`) and `fitPresent()` lowers the scale in 0.05 steps (floor 0.45) until nothing overflows; at ≤ 760 px it stacks to one column and scrolls instead of shrinking. Roll / Undo / Exit controls sit bottom-right at 55% opacity (full on hover/focus, always full on touch). While presenting only `R`/Space (roll; Space is left to a focused button), PageDown/→ (roll) and PageUp/← (undo) for presentation clickers, `Z` (undo), `1`–`5` (re-roll a card), `F` and Esc (exit) work; every other shortcut, `?` included, is blocked. Opening it closes the More menu and puts focus on Roll. Titles use the title-case `display` name with no `>>`. Locked cards show a filled lock in lock ink after the title; held rows (locked trait, or any row of a locked card) get a `--lock-tint` background instead of a left rule. Only rows whose own text changed play `present-enter`, staggered in reading order by `--i` (`presentSectionHtml()` hands out the indices, the logline counting first when it changed). It goes through `openModal()`/`closeModal()`, so focus is trapped inside and restored on exit. `renderCards()` re-renders it whenever the build changes; a changed logline plays `present-enter`.

### 4.13 Printable worksheet

`printWorksheet()` (More → "Print worksheet") fills `#print-sheet` from the build and calls `window.print()`; a `beforeprint` listener does the same for Cmd/Ctrl+P. With a build on the results screen (not the intro), `html.has-print-sheet` makes `@media print` hide everything except the sheet; without one the page prints as-is. The sheet, black on white in Atkinson Hyperlegible Next (the title line in Atkinson Mono): the "Pocket Dystopia · Story seed" title with Name and Date blanks, the logline (no left rule), the five sections in two columns under title-case headings ("The Setting", "The Hero"…), then "Your turn" with six prompts (each with four ruled lines) that quote the build: describe the setting with three senses, introduce the hero by showing their first trait, the hero meets the villain, the squad arrives, get past the first obstacle, an ending that uses the hero's weakness. The footer carries the build's share URL so the class can reopen the exact seed. Prompts are built in `buildPrintSheetHtml()`; all build text goes through `escapeHtml()`.

---

## 5. UI Structure

### 5.1 Screens

Two root containers, swapped via classes:

- `#intro-screen` — the landing screen. Hidden via `.hidden`.
- `#results-screen` — the build view. Shown via `.active`.

Rendering is imperative: `showResults()` and `showIntro()` toggle the classes and reset state as needed.

### 5.2 Intro screen

- `h1.text-display` wordmark "Pocket Dystopia" (title case, Atkinson Mono) in `--text-primary`, followed by a static amber block cursor (`.wordmark-cursor`, `aria-hidden`, filled with `--accent`). No glow or text-shadow.
- 2-line subtitle: "Roll a satirical dystopian seed. / Lock what you love, re-roll the rest."
- Tappable die (`#die-container`, `role="button"`) with pip-based SVG face. Idle cycle swaps faces every 600 ms with no effect (the die floats 4 px over 4 s; §7). `aria-label="Roll the die"`; the visible hint ("tap to roll" on touch, "click to roll" on pointer+hover) is `aria-hidden`.
- Conditional resume row (visible iff `pocket-dystopia-state` exists): "You have a build in progress. [Resume] [Clear it]".
- Collapsible "Have a build code?" disclosure — collapsed by default, expands inline to reveal input + Load button. Autofocuses the input on expand. The input ("Paste a link or code…") accepts a full share link or a bare code; Enter loads. An error reads "That code didn't work. Paste the whole link or code exactly as it was shared." Loading over an existing build is undoable.
- Footer credit line with heart and outbound link: an ordinary `<footer class="forhuman-credit">` in the document flow (never fixed). The intro's min-height leaves room for it.

### 5.3 Results screen

**Top bar** (`.top-bar`, sticky), in natural reading order in both handedness modes:

1. "Pocket Dystopia" title button (mono, no cursor) (`aria-label="Pocket Dystopia, back to start"`): non-destructive, opens the intro without clearing state. Shown at every width (smaller on phones), so there is no separate home icon.
2. Undo (`disabled` until history is non-empty; the floating "Undo" label is described in §4.4). Hidden at ≤ 600 px, where Undo lives in the action bar.
3. Share (opens the export hub modal).
4. Pinned builds (opens the pinned panel).
5. More overflow (`more_vert` icon): popover containing theme toggle, left-handed toggle (below 1024 px only), shake-to-roll toggle (touch + DeviceMotion only), keyboard shortcuts, and the destructive "Clear this build" action.
6. **Roll** primary button with a continuously cycling d6 icon and a visible "Roll" label. Hidden at ≤ 600 px, where Roll lives in the action bar.

On phones (≤ 600 px) the top bar therefore shows only the title plus share, pin and more.

**Phone action bar** (`.action-bar`, ≤ 600 px only): a fixed bottom bar in the thumb zone with a secondary "Undo" button (permanent text label, mirrors `history.length === 0` as `disabled`) and a primary "Roll" button (cycling die icon, flex-grows, 52 px tall). It respects the safe-area insets. In left-handed mode it is mirrored (`row-reverse`, Roll on the left). The credit footer gains bottom padding and the toast is raised so neither sits under it.

**Controls bar** (below top bar):

- Custom mood combobox (replaces native `<select>`): button + listbox with full ARIA (combobox/listbox/option), arrow-key navigation, amber (`--accent-ink`) checkmark on the selected option. Capped at 280 px width on desktop; takes the full row at ≤ 480 px.
- View toggle (Expanded / Compressed): demoted visually: smaller, outlined, 13 px at weight 600, sentence case. Shown below 1024 px (phones and tablets); hidden at ≥ 1024 px.

**Logline**: renders between the controls bar and the cards grid, above the first card. See §4.7.

**Cards grid** (`#results-container`): 5 cards rendered by `renderCards()` from the `SECTIONS` constant, in this order: **Setting, Hero, Villain, Squad, Obstacles**. The order matches the logline (which opens with the setting), and the `1`–`5` shortcuts, the text export and the share image all follow `SECTIONS`. Below 1024 px it is a single column. At ≥ 1024 px it is a 2-column grid where Setting spans the full width as a "scene" card (WHEN and WHERE side by side), followed by Hero | Villain and Squad | Obstacles, so there is no empty cell.

**Footer**: the same in-flow credit line as the intro, below the cards.

### 5.4 Card anatomy

Each card:

- Header: plain `<h2>` with the title-case `display` name ("The Setting", "The Hero", "The Villain", "The Squad", "Obstacles"), 20 px at weight 700, no `>>` prefix. Title color: Hero green, Villain red, others `--text-primary`. Role is carried by the heading colour alone; there are no top stripes.
- Action strip (consistent order at both levels): **re-roll → lock → chevron (below 1024 px only)**.
- Summary line (visible only when collapsed): the first trait in full (the `where` for Setting), then a muted "+N more" counting the hidden rows. No trailing ellipsis.
- Body: a list of `.trait-line` rows. Each row has either a `>` prompt (Atkinson Mono, bold, `--accent-ink`) or a `WEAK` / `TRAUMA` / `WHEN` / `WHERE` label (Atkinson Mono, bold, caps with no letter-spacing, 13 px, `--text-secondary`), the trait text, and a per-trait action group (swap + lock).
- Lock is neutral, not amber (amber means "act"). Locking a trait gives its row a filled lock icon and a flat `--lock-tint` background. Locking a card switches its border to `--lock-border` and fills the card's lock icon (`--lock-ink`); every trait inside renders as held (filled lock, swap and lock buttons disabled; see §4.3) but its row is not tinted, so tints don't stack inside a card that already says "held". No ring, glow or coloured edge anywhere.
- Per-trait action buttons: always visible at a legible tertiary colour on `hover: none` devices. On hover-capable fine pointers they rest at 45 % opacity and go to full on row hover or focus. A locked trait's lock stays full strength in lock ink. Swap uses the `replay` icon; lock uses `lock_open` / `lock`.

Cards are collapsible below 1024 px (phones and tablets), the same breakpoint at which the view toggle is shown, via the chevron button. At ≥ 1024 px every card is always expanded and the chevron is hidden. Collapsing animates `grid-template-rows` from `0fr` to `1fr` rather than a `max-height`, so tall cards at 320 px are never clipped, and collapsed content is `inert` so its buttons leave the tab order and the accessibility tree.

### 5.5 Modals and dialogs

All dialogs use a shared focus manager (`openModal` / `closeModal` in app.js): initial focus moves to the first focusable, Tab is trapped inside, focus returns to the trigger on close.

- **Share modal** (`#share-modal`): export hub with Web Share API button (shown only if `navigator.share` exists), Copy link (primary), Copy as text, Save as image, and a collapsed "Or share as code" disclosure revealing a read-only, labelled code input (selects on focus) + Copy code button.
- **Pinned builds panel** (`#pinned-modal`): a "Pin this build" toolbar button above a slot grid (§4.8). Shows description when empty; replace-mode shows overlay + Cancel button.
- **Keyboard shortcuts panel** (`#shortcuts-modal`): 2-column on desktop, single-column on mobile. Each row is a styled `<kbd>` + description. "Got it" close button.
- **Confirm dialog** (`#confirm-overlay`): title + body + two buttons. Copy adapts between reset flow ("Clear this build?") and pin-delete flow ("Delete slot N?") via `dataset.mode`. Both open through `openModal()`.
- **Toast** (`#toast`, `role="status"`, `aria-live="polite"`, `aria-atomic="true"`): 2-second auto-dismiss. Duplicate strings re-announce via clear-then-set pattern. Sized `width: max-content` up to the viewport minus 16 px margins (so it no longer wraps to a narrow half-width column), and raised above the action bar on phones.
- **Silent announcer** (`#sr-announce`, `aria-live="polite"`): hidden via `.sr-only`. Used for state changes that don't warrant a visible toast (lock toggles, logline updates).

### 5.6 More overflow menu

Popover triggered by the `more_vert` button. Items:

- Light mode / Dark mode (label reflects current theme)
- Left-handed layout (`role="menuitemcheckbox"`, hidden at ≥ 1024 px via `@media (min-width: 1024px) { display: none }`)
- Shake to roll (`role="menuitemcheckbox"`, `hidden` unless the device has touch + `DeviceMotionEvent`; see §10.3). Stays open on toggle so the checkmark flip is visible, like left-handed
- Present to class (opens the present view; §4.12)
- Print worksheet (§4.13)
- Divider
- Keyboard shortcuts (opens shortcuts modal)
- Divider
- Clear this build (destructive red)

Arrow-key navigation, Home/End, Escape to close, click outside to close. `aria-haspopup="menu"` on the trigger, `role="menu"` on the panel. The menu is always anchored to the right edge of its button (the More button is at the right of the top bar at every width and in both handedness modes) and clamped to the viewport width, so it can't overflow on a phone.

---

## 6. Design System

### 6.1 Color tokens

One chosen look: an amber-phosphor terminal on warm near-black (dark, default) or warm paper (light). Amber is the single accent and means "act": the Roll button, focus rings, the `>` prompt, the die and the wordmark cursor. Lock is deliberately neutral so it never competes with Roll. Rationale: [`VISUAL-AUDIT-2026-10-14.md`](VISUAL-AUDIT-2026-10-14.md). The earlier GitHub-Primer dark and Tailwind light palettes, and the `--accent-cyan*`, `--accent-lock*`, `--accent-amber*` and `--border-accent` tokens, no longer exist.

All values below are from `:root` and `[data-theme="light"]` in `styles.css`.

| Token | Dark (`:root`) | Light | Role |
|---|---|---|---|
| `--bg-primary` | `#0F0E0C` | `#F5F2EA` | Page ground (paper in light) |
| `--bg-secondary` | `#171613` | `#FFFDF8` | Card surface |
| `--bg-elevated` | `#1E1C18` | `#FFFFFF` | Inputs, modal, elevated buttons |
| `--bg-overlay` | `#28251F` | `#ECE7DC` | Hover surface, floating Undo pill |
| `--text-primary` | `#EEE8DD` | `#1E1C18` | Body text |
| `--text-secondary` | `#ABA396` | `#5B544A` | Muted text, data labels (WEAK, TRAUMA, WHEN, WHERE) |
| `--text-tertiary` | `#968E81` | `#6B6458` | Very muted |
| `--text-inverse` | `#0F0E0C` | `#FFFFFF` | Inverse text (defined, not currently referenced by `styles.css`) |
| `--accent` | `#FFB224` | `#F2A516` | Fill: Roll button, die, wordmark cursor |
| `--accent-hover` | `#FFC456` | `#E39710` | Hover fill |
| `--accent-ink` | `#FFB224` | `#8F5400` | Amber as text, icons, focus rings, the `>` prompt, menu and listbox checkmarks |
| `--on-accent` | `#0F0E0C` | `#1E1C18` | Text and icons on an amber fill |
| `--accent-red` | `#FF7B67` | `#BC3626` | Destructive actions, errors |
| `--accent-red-muted` | `#E5604C` | `#A12C1E` | Muted red |
| `--accent-red-tint` | `rgba(255, 123, 103, 0.1)` | `rgba(188, 54, 38, 0.08)` | Red wash |
| `--on-destructive` | `#0F0E0C` | `#FFFFFF` | Text on `.btn-destructive` (7.6:1 dark, 5.7:1 light) |
| `--accent-green` | `#7FD48B` | `#2A7537` | Success (copy check) |
| `--accent-hero` | `#7FD48B` | `#2A7537` | Hero heading |
| `--accent-villain` | `#FF7B67` | `#BC3626` | Villain heading |
| `--lock-ink` | `#EEE8DD` | `#1E1C18` | Lock icon (filled when held) |
| `--lock-tint` | `rgba(238, 232, 221, 0.07)` | `rgba(30, 28, 24, 0.055)` | Locked row background; present view held rows |
| `--lock-border` | `#6A6357` | `#A39B8D` | Locked card border |
| `--border-default` | `#322E27` | `#DDD5C7` | Default borders |
| `--border-subtle` | `#25221D` | `#E8E2D6` | Subtle dividers |
| `--scrim` | `rgba(8, 7, 6, 0.72)` | `rgba(30, 28, 24, 0.4)` | Modal and confirm overlay |
| `--shadow-pop` | `0 12px 32px rgba(0, 0, 0, 0.45)` | `0 12px 32px rgba(30, 28, 24, 0.14)` | More menu and listbox shadow |

Accent split: `--accent` fills, `--accent-ink` draws. They are the same amber in dark; in light the fill stays bright and the ink darkens to `#8F5400` so amber text and focus rings stay legible on paper. Text on a fill always uses `--on-accent`.

### 6.2 Role color assignment

- **Hero** "The Hero": green heading, no stripe.
- **Villain** "The Villain": red heading, no stripe.
- **Squad / Setting / Obstacles**: `--text-primary` heading.
- **WEAK / TRAUMA / WHEN / WHERE labels**: `--text-secondary`, mono caps.
- **`>` prompts**: `--accent-ink`.
- **Lock**: neutral (`--lock-ink`, `--lock-tint`, `--lock-border`), never amber.

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
--radius-sm   6px
--radius-md   8px
--radius-lg   12px
--radius-xl   24px
```

### 6.5 Typography

One family pair, both Atkinson Hyperlegible from Google Fonts (Human's web body face and its mono sibling):

- `--font-body`: `'Atkinson Hyperlegible Next', system-ui, -apple-system, 'Segoe UI', sans-serif`. Everything you read: traits, logline, card titles, buttons, modals.
- `--font-mono`: `'Atkinson Hyperlegible Mono', ui-monospace, 'SF Mono', Menlo, monospace`. Terminal scaffolding only: the wordmark (intro title, top-bar title, present-view brand, worksheet title line), the `>` trait prompts (in accent ink), the WEAK / TRAUMA / WHEN / WHERE labels (caps, no letter-spacing), `kbd` and the share-code input.
- `--font-display`: `var(--font-mono)`. Used for the wordmark.

Space Grotesk and Space Mono are gone. There is no uppercase-plus-letter-spacing anywhere; the only caps in the UI are the four field labels (and the plain-text export, §4.9). The only tracking left is `-0.01em` on `.text-display`.

Type scale is HIG-aligned:

| Class | Size | HIG role |
|---|---|---|
| `.text-display` | `clamp(2rem, 6vw, 3rem)`, weight 700, mono | Title1 → Large Title |
| `.text-heading` | `1.25rem`, weight 700 | Title3 (20 pt) |
| `.text-subheading` | `1.0625rem`, weight 600 | Headline (17 pt) |
| `.text-body` | `1.0625rem` | Body (17 pt) |
| `.text-caption` | `0.8125rem` | Footnote (13 pt) |
| `.text-micro` | `0.6875rem` | Caption2 (11 pt) |

Card titles are 20 px at weight 700; the logline is 19 to 23 px at weight 500 (§4.7).

### 6.6 Iconography

Material Symbols Outlined, variation settings `'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24`, which are exactly the axes the subset request pins (`FILL` is the one free axis, `0..1`). `.icon-filled` switches `FILL` to `1` — used for the locked state. The font request lists every icon by name (`icon_names`, §2), so adding an icon means adding its name there.

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
- Shake to roll: `vibration`
- Undo: `undo`

### 6.7 Focus indicators

Global `:focus-visible { outline: 2px solid var(--accent-ink); outline-offset: 2px; }` (amber on dark, the darker amber on paper). Skip link materializes on focus.

---

## 7. Animations & Motion

One motion system. Every duration and easing in `styles.css` comes from tokens in `:root`: `--ease-out` `cubic-bezier(0.2, 0, 0, 1)` (things arriving decelerate), `--ease-in-out` `cubic-bezier(0.4, 0, 0.2, 1)`, `--ease-spring` `cubic-bezier(0.34, 1.32, 0.64, 1)` (the die lands with a little overshoot), `--dur-fast` 120 ms, `--dur-base` 220 ms, `--dur-slow` 360 ms and `--stagger` 28 ms. All transitions use them.

The signature gesture is **text-enter**: new text is dealt in with a fade and a 4 px rise (`@keyframes text-enter`, `--dur-base`, `--ease-out`, `both`), delayed by `calc(var(--i, 0) * var(--stagger))`. `renderCards()` numbers the changed rows in reading order (`--i`), and `presentSectionHtml()` does the same for the present view. It is the only effect on changed text; there is no fizzle, glow, scan or pulse.

All animations respect `prefers-reduced-motion: reduce`: a global rule sets `animation-duration` and `transition-duration` to 0.01 ms, `animation-iteration-count` to 1 and `animation-delay` to 0 (so the stagger collapses too), and a few components additionally set `transition: none` (chevrons, undo label). The FLIP height animation is skipped outright (`prefersReducedMotion()` in `app.js`).

| Animation | Duration / easing | Where it fires |
|---|---|---|
| `die-float` | 4 s loop, `--ease-in-out` | Idle 4 px vertical float on the intro die. The die carries one still warm drop-shadow halo (no pulse) |
| Die face swap | none | Idle cycle and roll swap faces with no effect; the tumble carries the motion |
| `tumble-{x,x-neg,y,y-neg,diag}` | 700 ms, `--ease-spring` | Die tumble on a roll; random pick avoids immediate repeats. Content swaps at 300 ms |
| `text-enter` via `.trait-enter` | `--dur-base`, `--ease-out`, staggered | On the text, `>` prefix or label of rows whose text changed between renders |
| `text-enter` via `.logline-enter` | same | When any `LOGLINE_SOURCE_KEYS` state changes |
| `text-enter` via `.present-enter` | same | Changed rows and a changed logline in the present view |
| FLIP card height | 360 ms, `--ease-out` | `renderCards()` records each card's height, re-renders, then animates the card from the old height to the new one with the Web Animations API (only when a height changed by more than 1 px and a trait changed), so cards glide when a re-roll changes text length. Skipped under reduced motion |
| `crt-boot` | 600 ms, `--ease-out` | First-roll transition from intro to results (kept as the one CRT nod) |
| Modals and confirm dialog | overlay `--dur-base`, panel `--dur-slow` | The scrim fades and the panel lifts (8 px, scale .985 to 1), using `@starting-style` and `transition-behavior: allow-discrete` so they animate out of `display: none` with no JS. A closing overlay or menu gets `pointer-events: none` at once, so it never catches the next click while it fades (Chrome already skips it; Safari may not) |
| More menu, mood listbox | `--dur-fast` opacity, `--dur-base` transform | Fade and drop 4 px (scale .98 to 1) the same way |
| Lock tint / card border | `--dur-base` | Row background and card border fade on lock toggle |
| Card collapse | `--dur-slow`, `--ease-out` | `grid-template-rows` `0fr → 1fr` plus a `--dur-base` opacity fade on `.card-content` |
| Chevron rotation | `--dur-base` | Card disclosure expand/collapse |
| Undo label fade | `--dur-base` | Floating "Undo" pill under the top-bar Undo button fades in/out (opacity + 4 px slide). Absolutely positioned, so no layout shift |

Removed in the redesign: the CRT scanline body overlay (both themes), the wordmark text-shadow glow, `glow-pulse`, `die-fizzle`, `die-shake`, `trait-fizzle`, `trait-fizzle-scan`, `trait-glow`, `logline-fizzle`, `present-fizzle`, `card-pulse` and its `pulseAfterRender` queue.

The row diff still uses `snapshotTraitTexts(state)` to build a flat `{ "sectionKey:traitPath": text }` map, compared to the previous render's snapshot. First render (no prior snapshot) animates no rows because `crt-boot` already carries the animation weight.

---

## 8. Responsive Behavior

Breakpoints:

| Width | Changes |
|---|---|
| `< 360 px` | Trait text drops to 1 rem; card titles to 1.125 rem; the top-bar title to 15 px; card-header buttons drop to 32×32 (even on coarse pointers) |
| `≤ 480 px` | Mood combobox takes full row via `flex: 1 1 100%`. Pinned builds panel goes to one column |
| `≤ 600 px` | Phone layout: top-bar Roll and Undo are hidden, the fixed bottom action bar (Undo + Roll) appears, the top-bar title shrinks to 16 px. Trait text 1 rem, tighter card padding. Footer and toast make room for the bar |
| `≥ 600 px` | Pinned builds panel is 3 columns; wider page gutters |
| `< 1024 px` | Cards can collapse: view toggle and card chevrons are shown (tablets included). Single-column cards. Left-handed menu item available |
| `≥ 1024 px` | 2-column grid with Setting full-width on top. Cards permanently expanded; `.view-toggle`, card summaries, chevrons and the left-handed menu item are hidden |

Phone layout (≤ 600 px):
- Roll is the app's primary action, so it sits in the thumb zone: a fixed bottom bar with Undo and a large labelled Roll. The top bar keeps only the title (doubles as home), share, pin and more.
- Desktop and tablet keep Roll in the top bar, now with a visible label.

Touch targets: on `(pointer: coarse)` top-bar and card-header buttons, trait swap/lock buttons (44×44), the view toggle, logline copy, intro buttons/input and pin-slot buttons are at least 44 px tall (HIG). To pay for the width, trait text drops to 1 rem at ≤ 600 px and the two trait buttons share a 2 px gap in one column. On fine pointers the top-bar icon buttons and in-card buttons stay at 36 px for density.

Left-handed mode (`[data-left-handed="true"]`) mirrors only what a thumb reaches:
- The phone action bar flips to `row-reverse` (Roll on the left).
- `.card-header` and `.card-header-actions` flip to `row-reverse`.
- The per-trait `.trait-actions` group reorders via `order: -1` (to the left of the text).
- The **top bar is deliberately not mirrored.** The top of a phone is out of thumb reach in either hand, and reversing it scrambled its reading order (home ended up last) and its tab order, and pushed the More menu off-screen. The More menu therefore stays right-anchored in both modes.
- Persisted in prefs; toggled via the More menu.

---

## 9. Accessibility

### 9.1 Landmarks & structure

- `<a class="skip-link" href="#main-content">` for keyboard bypass; appears on focus.
- `role="main"` on intro; `<main id="main-content">` on results.
- Visually-hidden `<h1>Your build</h1>` on results screen so the heading tree has a root.
- `#results-screen` is **not** a live region (it used to be `aria-live="polite"`, which queued every card's text on each re-render). Changes are announced deliberately through `#sr-announce` and the logline instead.
- Cards are `<section aria-labelledby="card-title-<key>">` with `<h2>` titles.

### 9.2 ARIA patterns

- Card chevron button: `aria-expanded`, `aria-controls`, dynamic `aria-label` ("Collapse The Hero" / "Expand The Hero"). Collapsed `.card-content` is `inert`, so hidden swap/lock buttons are neither tabbable nor announced.
- All lock buttons: `aria-pressed` reflects state; the card lock's name is "Lock <card>" with the title "Lock this card" / "Unlock this card", and trait locks are named "Keep: <trait>" with the title "Keep this" / "Release this" / "Card is locked" (inside a locked card they are `aria-pressed="true"` and `disabled`).
- Segmented view toggle: `role="group" aria-label="View mode"` with `aria-pressed` on each option.
- Toast: `role="status" aria-live="polite" aria-atomic="true"`. `showToast()` clears then re-sets text so duplicate strings re-announce.
- Silent announcer (`#sr-announce`): `aria-live="polite" aria-atomic="true"`. Fires on section/trait lock state changes and logline source updates.
- Load-error region: `role="alert" aria-live="polite"`.
- Roll buttons: the visible text "Roll" is the accessible name (no divergent `aria-label`, so voice control's "click Roll" works); the keyboard hint lives in `title`. The top-bar Undo keeps `aria-label="Undo last roll"`, which contains its visible "Undo" text; the floating label is `aria-hidden`.
- Phone action bar buttons take their names from their visible text ("Undo", "Roll").
- Modals: `role="dialog" aria-modal="true" aria-labelledby` on all four (share, pinned, shortcuts, confirm). Real focus trap (see below).
- Die container: `role="button" tabindex="0" aria-label="Roll the die"`.
- More menu: trigger has `aria-haspopup="menu" aria-expanded`; panel is `role="menu"`; the left-handed and shake items are `role="menuitemcheckbox"` with `aria-checked`.
- Mood combobox: `role="combobox" aria-haspopup="listbox" aria-expanded aria-controls`; panel is `role="listbox"`; options are `role="option"` with `aria-selected`.

### 9.3 Modal focus management

On modal open:
1. Remember the triggering element.
2. Move focus to the first focusable inside the modal.
3. Trap Tab / Shift+Tab to cycle within the modal.

On close:
1. Restore focus to the remembered trigger.

Implemented via `modalFocusStack`, `openModal()`, `closeModal()`, `trapTab()`, `initModalFocusTrap()` in app.js. All four modals route through these helpers, including the pin-delete confirm (which previously toggled its overlay class directly and skipped focus management). Escape closes one layer at a time (the More menu, else the topmost entry of `modalFocusStack`), so Escape on the pin-delete confirm returns to the pinned panel. Escape inside the pin-rename input cancels the rename and does not propagate. After a pin, replace, rename or delete re-renders the slots, `refocusPinned()` puts focus back on that slot's first usable control (or the panel's close button), so focus never falls behind the overlay.

### 9.4 Labels

- Decorative icons: `aria-hidden="true"`.
- `sr-only` class for visually hidden form labels, the results h1, and the announcer region.
- Trait swap buttons inline the trait text into the accessible name ("Swap: <text>", truncated to 40 chars), and lock buttons likewise ("Keep: <text>"). Every interpolated string goes through `escapeHtml()`, which escapes `& < > " '` so attributes can't be broken out of.
- Share code input: a real `<label>` (sr-only "Build code") on a read-only text input that selects on focus. The code is now short enough to be worth reading, so it is no longer hidden from the tab order.
- Die hint ("tap to roll" / "click to roll") is `aria-hidden`; the die itself carries the accessible name.

### 9.5 Touch & motion

- 44 px minimum touch targets on coarse pointers (top bar, card actions, trait buttons, logline copy, view toggle, intro buttons, pin-slot buttons); see §8.
- 36×36 on fine pointers for the top-bar icons and in-card buttons, a deliberate density trade-off where precision input makes it safe. Below 360 px the card-header buttons drop to 32×32.
- Trait actions are always visible on `hover: none` devices (they are the "lock what you love" mechanic and touch has no hover to reveal them).
- `-webkit-tap-highlight-color: transparent` on the die.
- `prefers-reduced-motion: reduce` collapses every animation and transition to 0.01 ms with no delay (so the text-enter stagger and the die float and tumble effectively stop), turns off chevron rotation and the undo label transition, and skips the FLIP card-height animation (§7). There is no scanline overlay to disable, so no `prefers-contrast` handling is needed.

### 9.6 Contrast

The redesigned palette is built so text tones meet WCAG AA (4.5:1) against every surface (`--bg-primary`, `--bg-secondary`, `--bg-elevated` and `--bg-overlay`) in both themes: primary, secondary and tertiary text, `--accent-ink` (`#FFB224` dark, `#8F5400` light), hero green, villain red and `--lock-ink`, and `--on-accent` on the amber fill. The lowest pair is light hero green on `--bg-overlay` at 4.61:1, computed from the token values. Lighthouse accessibility score: **100/100** on both desktop and mobile (measured in revision 1, not re-run since).

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
| `C` | Results screen | Copy as text (includes the logline and share URL) |
| `S` | Results screen | Open share modal |
| `P` | Results screen | Pin the current build straight to the first free slot (replace mode if all six are full; see §4.8) |
| `L` | Results screen | Toggle light / dark |
| `F` | Results screen | Open the present view; inside it, `F` or Esc exits (§4.12) |
| `R` / Space, `Z`, `1`–`5` | Present view | Roll, undo, re-roll a card — the only keys that work while presenting |
| `1` – `5` | Results screen | Re-roll one card, top to bottom: Setting, Hero, Villain, Squad, Obstacles (follows `SECTIONS`) |
| `?` | Anywhere | Open keyboard shortcuts panel |
| Escape | Any time | Close the open menu, else the topmost dialog |
| Tab / Shift+Tab | All | Standard focus traversal; trapped inside open modals |
| Arrow keys | More menu, mood listbox | Navigate items / options |

Modifier combos (Cmd/Ctrl/Alt) are never hijacked; single keys only.

### 10.2 Pointer

- Clicks on dialog overlays dismiss (checks `e.target === e.currentTarget` to avoid bubbling from inside the dialog).
- Click outside the More menu or mood listbox closes them.
- Enter in the intro's load input loads the pasted link or code.

### 10.3 Device motion (shake to roll)

Shake to roll is a **More-menu toggle**, shown only where `DeviceMotionEvent` exists and the primary pointer is coarse (`shakeSupported()`). The choice is stored as `prefs.shake`.

- Default when never set: **on** where no permission is needed (Android and most others), **off** on iOS (`DeviceMotionEvent.requestPermission` present).
- On iOS the permission is requested when the user switches the toggle on, since that tap is the user gesture the prompt needs. A refusal toasts "Motion access is off. Allow it in Settings to shake to roll." and leaves the toggle off. Previously the first tap anywhere on the page triggered the system prompt, usually the tap on the die.
- If an iOS user already opted in, the first click of a later visit re-confirms access (no prompt appears once granted) and then attaches the listener.
- `handleMotion()` fires `rollDie()` when any axis exceeds 15 m/s² with a 1 s cooldown, and ignores motion while a modal is open. Toggling off removes the listener.

---

## 11. Functions of Note (app.js)

| Function | Purpose |
|---|---|
| `init()` | Entry point; wires up all listeners, applies prefs, restores the saved build, then checks the URL hash |
| `applyPrefs()` / `loadPrefs()` / `savePrefs()` | Preferences read/write with fallback defaults |
| `setThemeAttr()` | Sets `data-theme` and keeps `<meta name="theme-color">` in sync (`#0F0E0C` dark, `#F5F2EA` light); used by `applyPrefs()` and `toggleTheme()` |
| `prefersReducedMotion()` | `matchMedia` check that gates the FLIP height animation |
| `sanitizeBuild()` / `sanitizeTrait()` | Validate any build from outside (hash, pasted code, `localStorage`, pins); §3.3 |
| `openPresent()` / `closePresent()` / `renderPresent()` / `fitPresent()` | Present view; §4.12 |
| `buildPrintSheetHtml()` / `preparePrintSheet()` / `printWorksheet()` | Printable worksheet; §4.13 |
| `applyMood()` / `selectMood()` | Mood combobox state sync |
| `getDieFaceSVG()` / `setDieFace()` / `startRollIconCycle()` / `startDieIdleCycle()` | Die rendering (stroke and pips in `--accent-ink`, so the light-theme die keeps 3:1 against the page) + idle cycles; face swaps carry no effect. The first-roll timeout releases `isRolling` in a `finally` |
| `rollDie()` | Orchestrates the full roll animation + state update |
| `generateNightmare()` / `createBuildState()` | Produces a build state, respecting locks |
| `rerollSection(key)` | Section-scoped re-roll |
| `rerollSingleTrait(key, type, index?)` | Single-trait swap, avoiding duplicates |
| `getWeightedItems()` / `shuffleAndPick()` / `pickOne()` | Mood-weighted random selection |
| `renderCards()` | Imperative DOM render of the `SECTIONS` cards; diffs against the last snapshot so only changed rows get `.trait-enter` (numbered with `--i` in reading order), and runs the FLIP height animation |
| `setCardExpanded()` / `toggleCardExpand()` | Collapse state (`expanded` class, `inert`, chevron ARIA); collapse only below 1024 px (`COLLAPSE_MQ`) |
| `renderLogline()` / `buildLoglineText()` / `copyLogline()` / `capitalize()` / `sentence()` | Logline rendering (sentence-cased) + clipboard |
| `snapshotTraitTexts()` | Flattens state to a key→text map for diffing |
| `toggleSectionLock()` / `toggleTraitLock()` | Immutable lock updates + sr-only announcements |
| `pushHistory()` / `undo()` / `updateUndoButton()` | History stack + Undo label animation |
| `copyText()` / `copyBuild()` / `formatBuildText()` / `sectionRows()` | Shared clipboard writer with `execCommand` fallback; plain-text export |
| `saveScreenshot()` / `renderShareImage()` / `layoutShareImage()` / `wrapLines()` | Canvas-drawn 1080×1350 share card; share sheet on coarse pointers, download otherwise |
| `encodeBuildV2()` / `decodeBuildV2()` / `encodeBuildV1()` / `decodeBuildV1()` / `encodeBuild()` / `buildShareUrl()` | Share-code codecs (v2 index-packed, v1 legacy JSON) |
| `decodeAnyCode()` | Decodes a full link, bare v2 code or bare v1 code to a sanitized build or `null` |
| `toUrlSafeBase64()` / `fromUrlSafeBase64()` / `bytesToBase64Url()` / `base64UrlToBytes()` | Base64url helpers |
| `adoptLoadedBuild()` | Replaces the current build with a loaded one, pushing undo history first |
| `tryLoadFromHash()` | Reads `#b=` / `#build=` on init, strips hash via `window.history.replaceState` |
| `openShareModal()` / `closeShareModal()` / `copyShareLink()` / `copyShareCode()` / `shareViaWebShareApi()` / `toggleShareCodeDisclosure()` | Share modal controller |
| `loadBuildFromInput()` / `toggleLoadDisclosure()` | Intro-screen link/code restore (Enter submits) |
| `saveBuildState()` / `loadSavedState()` | `localStorage` I/O |
| `confirmReset()` / `closeConfirm()` / `executeReset()` / `goHome()` / `resumeBuild()` | Reset flow + non-destructive Home |
| `loadPins()` / `savePins()` / `pinCurrentBuild()` / `pinCurrentToSlot()` / `replaceSlot()` / `loadPin()` / `findPinnedSlot()` / `pinSubtitle()` / `startRenamePin()` / `confirmDeletePin()` / `executePinDelete()` / `renderPinnedSlots()` / `renderPinSlot()` / `openPinnedPanel()` / `closePinnedPanel()` / `cancelReplaceMode()` | Pinned builds system |
| `openMoreMenu()` / `closeMoreMenu()` / `toggleMoreMenu()` / `handleMenuAction()` / `updateMoreMenuState()` / `initMoreMenu()` | More overflow menu |
| `shakeSupported()` / `shakeNeedsPermission()` / `requestMotionPermission()` / `toggleShake()` / `initShakeDetection()` / `handleMotion()` / `setShakeListening()` | Shake-to-roll toggle and listener |
| `openShortcutsPanel()` / `closeShortcutsPanel()` / `initShortcuts()` | Keyboard shortcuts. Auto-repeat (`e.repeat`) is ignored, so a held key fires once |
| `openModal()` / `closeModal()` / `trapTab()` / `getFocusable()` / `initModalFocusTrap()` | Modal focus manager |
| `toggleMoodListbox()` / `openMoodListbox()` / `closeMoodListbox()` / `initMoodCombobox()` | Custom mood combobox |
| `showToast()` / `announce()` | Visible toast + silent sr-only announcer |
| `flashCopyCheck()` | Brief green-check icon swap on successful copy |
| `escapeHtml()` | String-based escaper for `& < > " '`, used for every interpolation into `innerHTML` (text and attributes) |

Immutable update discipline: `rerollSingleTrait`, `toggleSectionLock` and `toggleTraitLock` replace `buildState` with fresh objects via spread; `rerollSection` still reassigns trait arrays on the existing section object (safe because `pushHistory` has already deep-cloned the prior state via JSON round-trip).

---

## 12. Meta & Social

From `index.html`:

- `<title>`: "Pocket Dystopia"
- `<meta name="description">`: "Roll a satirical dystopian story seed. Lock traits, re-roll sections, share your build."
- `<meta name="theme-color">`: `#0F0E0C` in the HTML, then rewritten by `setThemeAttr()` to match the active theme (`#F5F2EA` in light)
- `<meta name="viewport">` includes `viewport-fit=cover` for the phone action bar's safe-area padding.
- Favicons: .ico (16 and 32), 16 / 32 / 192 / 512 PNG, `apple-touch-icon.png` (180×180). All are rendered from `tools/icon.html` by `node tools/render-icons.mjs` (uses the Playwright under `tests/` and the system Chrome for the PNGs, and ImageMagick's `magick` to pack `favicon.ico`).
- `<link rel="manifest" href="manifest.webmanifest">`: `name` "Pocket Dystopia", `short_name` "Dystopia", `display: standalone`, `start_url`/`scope` `/`, background and theme colour `#0F0E0C`, the 192 and 512 icons.
- Open Graph: title, description, `og:image` (1200×630), `og:url` `https://pocketdystopia.forhuman.ca/`.
- Open Graph also sets `og:image:alt` and `og:type` `website`.
- Twitter: `summary_large_image`, plus `twitter:title`, `twitter:description` and `twitter:image` (as `name=` attributes).

The OG image is `og-image-v4.png` (v3 retired and removed): the amber die beside the title-case "Pocket Dystopia" wordmark with its cursor block, the pitch, a sample seed with the hero in green, and the URL, set in Atkinson Hyperlegible. Its source is `tools/og-image.html`; regenerate with `node tools/render-og.mjs og-image-vN.png` with a new N (the script refuses anything else; uses the Playwright under `tests/` and the system Chrome), then point the meta tags at it — platforms cache previews by URL.

---

## 13. Known Trade-offs

- **`data.js` is append-only.** v2 share codes store pool indices, so reordering, inserting or deleting an entry silently rewrites every previously shared link. Add at the end of a pool, retire by editing text in place, keep each pool under 256 entries. A content edit to an existing entry changes what old links show (by design: it is the same slot), so edit for wording, not meaning.
- **No framework / no bundler**: `data.js` and `app.js` are global-scoped scripts. Cohesion is maintained via comment banners rather than module boundaries.
- **Imperative DOM rendering**: `renderCards()` rewrites `innerHTML` on every state change. Fine at this scale; the snapshot diff prevents re-animating unchanged rows, and the FLIP height animation hides the jump when a card's height changes. Safe only because every interpolated string goes through `escapeHtml()` and every external build through `sanitizeBuild()`.
- **`document.execCommand('copy')` fallback**: legacy path inside `copyText()` when `navigator.clipboard` is missing or rejects.
- **Icon subset is a manual list**: a new Material Symbols icon must be added (alphabetically) to the `icon_names` list in `index.html`, or it shows its ligature name.
- **Share image needs the fonts loaded**: `renderShareImage()` waits on `document.fonts.load`, but offline with no cached Atkinson Hyperlegible Mono / Next it falls back to system fonts.
- **Legacy v1 links remain valid**: they carry free text, so they are accepted only after passing `sanitizeBuild()`, which requires every trait to be real `DATA` text. `data.js` has not changed since the first commit, so every genuine old link still loads.
- **Left-handed mode does not mirror the top bar**: deliberate. The top is out of thumb reach in either hand, and mirroring it reversed reading and tab order. Only the action bar, card-header actions and trait actions flip. Inside a card the `row-reverse` / `order: -1` mirroring means visual order differs from DOM (tab) order for those buttons; accepted, since thumb-proximate is what the user asked for and it no longer affects the top bar.
- **Shake is opt-in on iOS**: the permission prompt needs a user gesture, so it is behind a menu toggle rather than automatic.
- **Trait pool duplication across moods**: a trait tagged `corporate` and `ai-takeover` can appear in either filter; dedupe is on `text`, so no double-picks in one render.

---

## 14. Testing Surface

### Automated (Playwright)

`tests/` holds an end-to-end suite with its own `package.json` (kept out of the repo root so Cloudflare's build installs nothing). `cd tests && npm ci && npx playwright test`. The config serves the repo root with `python3 -m http.server` and runs two projects, desktop (1440×900) and phone (Pixel 7). Locally it drives the installed Google Chrome (`channel: 'chrome'`), because Little Snitch on the dev machine silently drops Playwright's bundled Chromium, even for localhost; CI (`.github/workflows/test.yml`, on push to `main` and PRs) uses the bundled browser.

- `data.spec.mjs`: `data.js` is append-only against the snapshot; pools < 256, no duplicate texts, known mood tags.
- `sharing.spec.mjs`: v2 codec round-trips 300 builds (locks and mood included); a share link is 28 code chars and reopens the same build; legacy `#build=` links load and stay undoable over a saved build; a script payload is rejected and never runs; non-`DATA` text and `mood: "constructor"` are rejected; malformed links fall back without errors; the load box takes a wrapped pasted link and Enter.
- `ui.spec.mjs`: Setting-first card order and sentence-cased logline with no console errors; a locked trait survives a roll and undo restores; a locked card holds its traits; mood change toasts; pinning, duplicate refusal, Escape layering and focus after delete; phone action bar, left-handed mirroring and no overflow; compressed view keeps a hand-opened card open; 44px touch targets (with CDP touch emulation, since device presets don't flip `pointer: coarse`); the present view (focus on Roll, R/Z/1/PageUp, blocked shortcuts, exit through leaving fullscreen when the browser grants it, F to exit) and that it fits 1024×768, 1280×720 and 1920×1080 without scrolling; printing shows only the filled worksheet. CI keeps a trace and screenshots of any failure.

### Manual

Smoke path to verify the build end-to-end:

1. Hard reload intro → amber die floats and cycles faces (no glow pulse or fizzle), "Pocket Dystopia" wordmark with a static amber block cursor, 2-line subtitle, collapsed "Have a build code?" disclosure, no resume row, credit footer in flow below.
2. Click die → tumble (about 700 ms, content swaps mid-spin), CRT boot, 5 cards render in the order The Setting, The Hero, The Villain, The Squad, Obstacles (title case, no `>>`) with a sentence-cased logline above them: no box or left rule, larger type than the traits. Hero heading green, Villain heading red, no top stripes. At ≥ 1024 px Setting spans the full width.
3. Lock a trait → filled lock icon and a faint neutral row tint, no amber and no left border. Re-roll that section → locked trait stays put; changed rows fade in and rise 4 px in reading order, and the card glides to its new height. The toast on the first lock reads "Locked. It'll survive your next roll."
4. Lock an entire section → the card border turns to the neutral lock border and its lock fills, with no ring or glow; rows inside are not tinted; section re-roll and every trait swap/lock inside it are disabled ("Card is locked").
5. Swap a single trait via the row-level swap button → just that trait changes and its text fades in (no fizzle or glow), the logline animates in only if the swapped trait is a source key.
6. Switch mood via the custom combobox → unlocked traits re-shuffle and a toast says "Re-rolled for <mood>. Locks kept."
7. Toggle view below 1024 px (phone and tablet) → compressed shows the first trait plus a muted "+N more", chevrons collapse and expand each card, collapsed buttons can't be tabbed to. At 320 px the Hero card is never clipped.
8. Open the More menu → Light/Dark, Left-handed (below 1024 px), Shake to roll (touch devices only), Keyboard shortcuts, divider, Clear this build. The menu stays on screen on a 390 px phone in both handedness modes.
9. Press `?` → shortcuts panel opens with styled `<kbd>` keys. Esc closes.
10. Press `R`, `Z`, `3`, `C`, `S`, `P`, `L` and verify each shortcut fires (`3` re-rolls Villain; `P` pins immediately with a toast).
11. Undo → reverts last roll. The floating "Undo" label appears under the top-bar button the first time it becomes available, with no layout shift.
12. Copy (from share modal or `C` shortcut) → clipboard contains the text build with logline and a share URL. Icon briefly flashes green check.
13. Save as image (from share modal) → a 1080×1350 PNG with the title-case wordmark and amber cursor block, the logline (no rule), and five sections with `>` prompts in amber, no UI controls. On a phone it opens the share sheet.
14. Share → modal shows Copy link as primary, Web Share API if available, Or share as code disclosure. The link is `…/#b=` plus ~28 characters. Copy link → URL loads on fresh tab with no intro and no hash in address bar; with a build already saved, a toast offers Undo and Undo restores it. Corrupt the hash → toast fires after ~300 ms. A legacy `#build=` link still loads. A crafted link with markup in a trait doesn't execute.
15. Paste a full link (or a bare code) into the intro's load box and press Enter → loads. Garbage → the "That code didn't work" message.
16. Tap Pin icon → panel opens with a "Pin this build" button and 6 slots. Pin, then the button reads "Pinned in slot N" and is disabled; pins show the setting as a second line and the current one is highlighted. Rename (Escape cancels only the rename), delete (confirm dialog traps focus), load (undoable). Fill all 6 then press `P` → replace mode. At ≤ 480 px the slots are one column.
17. Tap the title → intro with resume row if a saved build exists. Resume or Clear it.
18. Clear this build (from More menu) → confirm dialog with "Clear it" destructive button. Pins and prefs persist after clear.
19. Toggle theme via More menu → palette swaps between warm near-black and warm paper, including all role colors, and the browser theme colour follows. Reload → theme persists. With `prefers-reduced-motion` on, rolls show no stagger and no height glide.
20. At ≤ 600 px → bottom bar with Undo and Roll, top bar shows title + share/pin/more, toast and footer clear of the bar. Toggle left-handed → bar mirrors (Roll on the left), card-header and trait buttons move left, top bar stays in the same order.
21. Switch Shake to roll on in the More menu on a phone (grant motion permission on iOS when prompted) and shake → triggers a roll. Switch off → no longer rolls.
22. Press `F` → present view goes fullscreen and fits the screen; `R`/Space/PageDown roll, `Z`/PageUp undo, `2` re-rolls the Hero, `S`/`P`/`?` do nothing; locked cards show a neutral filled lock and held rows a faint tint (no left rule). Esc (or `F`) exits and focus returns.
23. More → Print worksheet → print preview shows only the worksheet (build, Name/Date, six prompts with ruled lines, share URL), black on white, title-case section headings, no rule beside the logline. Cmd+P from the intro prints the page itself.
24. Reload the page after any of the above → state restores exactly.

**Verification status (2026-10-13, before the visual and motion redesign).** Steps 1–20 and 22–24 were exercised in automated Chrome (desktop, 820 px touch tablet, 390 and 320 px touch phones) and by the e2e suite, against both the local server and production. The phone-only behaviours that need real hardware — iOS motion permission and shake (21), the image share sheet into Photos (13), the action bar clearing the iPhone home indicator (20), and links opened from iMessage/WeChat — were not tested on a device; the operator accepted them as working at close of the revision 2 session. Present view on a real projector and the worksheet on a real printer remain an open operator check in `_meta`. This status predates the 2026-10-14 redesign: the steps it changed (1 to 5, 13, 19, 22, 23) were re-checked by screenshot in automated Chrome (1440×900 and 390×844, both themes, mid-roll frames, present view at 1280×720, worksheet as PDF), and the e2e suite gained a reduced-motion test (nothing left animating after a re-roll; proven to fail without the guard).

### Accessibility check

- Lighthouse: 100/100 Accessibility on both desktop and mobile (measured in revision 1; re-run after revision 2).
- All interactive elements keyboard-reachable; focus visible on every button.
- Modals trap focus; Escape closes and restores focus to trigger.
- Screen reader announces lock toggles, logline updates, and toast messages, and no longer re-reads every card on each re-render.
- Under `prefers-reduced-motion: reduce`, animations and transitions collapse to 0.01 ms with no stagger delay and the card-height glide is skipped. There is no scanline overlay, so no `prefers-contrast` special case.
