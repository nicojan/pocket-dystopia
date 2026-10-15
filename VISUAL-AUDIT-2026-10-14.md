# Visual and motion audit: pocketdystopia.forhuman.ca (2026-10-14)

Scope: the design system (tokens, type, colour, containers) and motion. The functional UX audit from the day before is `UX-AUDIT-2026-10-13.md` and is not repeated here. Evidence: screenshots in Chrome at 1440×900 (dark and light) and 390×844 (phone), taken mid-roll and in the results, locked and share states, and read against `styles.css` and the Human ban list (`mcp-designer-for-human`, `AP-*` ids).

## The diagnosis in one paragraph

The app doesn't look like it made one choice. It looks like several defaults stacked up. The dark palette is GitHub's Primer tokens copied verbatim (`#0D1117`, `#161B22`, `#21262D`, `#30363D`, `#8B949E`, `#E6EDF3`). The light palette is Tailwind's gray/red/green scale (`#6B7280`, `#D1D5DB`, `#DC2626`, `#16A34A`). The accent is neon cyan `#00E5FF` with glows (AP-17). The headline face is Space Grotesk (AP-50, banned by name). On top of that sit tracked all-caps headings (AP-06), coloured accent stripes (AP-02 family) and a CRT "glitch" effect on every change. Each piece is competent, but none of them is distinctly *Pocket Dystopia*. That matches the ban list's meta-tell: "every element competent, nothing chosen".

The fix is not "remove the personality". A retro terminal is a fine idea for a satirical dystopia generator aimed at kids. The fix is to commit to **one** version of it and draw it ourselves: one typeface, a palette we chose, one signature motion. Then cut everything that only fills space.

## P1: the AI tells (what you noticed, and its siblings)

### 1. Coloured accent borders, in four places
- **Logline box:** `border-left: 2px solid rgba(0,229,255,.35)` (`styles.css:902`). It's the classic left-border callout (AP-02, the single most recognisable AI tell). It's also the thing you spotted.
- **Hero/Villain cards:** a 2px green/red top stripe (`styles.css:1012-1028`). The same device turned 90°.
- **Locked trait rows:** a 2px amber left border (`styles.css:1218, 1236`), combined with a whole-card amber border *plus* an amber glow when the card is locked (`styles.css:1035-1038`).
- **Print/present view:** `box-shadow: inset 0.14em 0 0 var(--accent-lock)` (`styles.css:2470`). This is the left-border trick again, done through a shadow.

**Fix:** Drop all four. Let the logline be the hero of the page instead of a boxed aside: no box, larger type, flush left above the cards (see #5). Mark role with the heading alone; the coloured "THE HERO" / "THE VILLAIN" title already does that job, so the stripe is redundant. Show lock with the filled lock icon and a quiet tinted row (one flat `--lock-tint` background), not with borders and glows. One signal per state.

### 2. Typeface: Space Grotesk plus Space Mono
Space Grotesk is on the banned "default AI font stack" list (AP-50). Space Mono as the *body* face also hurts reading. Every trait is set in a monospace at 17px, so lines are wide and ragged. On the phone, traits wrap after 2–3 words (see the phone screenshot: "thinks they are / invincible / (spoiler: / absolutely not)").

**Fix:** Keep monospace as the *flavour*, not the body. Options, best first:
- **One characterful mono used sparingly** (JetBrains Mono, IBM Plex Mono, Berkeley Mono if licensed) for labels, the wordmark and prefixes, with trait and logline text in a proportional face (IBM Plex Sans pairs naturally with Plex Mono). Same terminal feel, about 30% more characters per line, far fewer wraps on the phone.
- Or the Human web brand stack for body text, and mono only for the `>` / `WEAK:` scaffolding.

### 3. Tracked-out all-caps everywhere
`POCKET DYSTOPIA` (3px tracking), `THE SETTING` / `THE HERO` (1.5px), `EXPANDED / COMPRESSED` (`styles.css:736`), `WEAK: / TRAUMA: / WHEN:` (`styles.css:1262`). That's four levels all shouting in the same voice (AP-06). As a result, hierarchy comes only from colour.

**Fix:** Sentence- or title-case card headings at a real size step (`The hero`, about 20px, weight 600). Keep caps for **one** thing only: the short field labels (`WEAK`, `WHEN`), which are genuinely labels, and there with no letter-spacing. The wordmark can stay custom, but as one deliberate lockup, not the same treatment as every heading.

### 4. Neon-on-dark glow
There are 16 glow/shadow-glow rules: a glowing wordmark (`text-shadow: 0 0 30px` cyan), a glowing die with an infinitely pulsing `drop-shadow`, a cyan text glow on every re-rolled trait, an amber glow on locked cards, and a full-bleed cyan Roll button (AP-17). Cyan `#00E5FF` on near-black also vibrates, and in light mode it becomes a different cyan (`#0891B2`), so the brand colour isn't stable across themes.

**Fix:** Choose an accent we own. For a dystopia, a sodium-lamp amber or a phosphor green reads more "screen in a bunker" than cyberpunk cyan. Note that amber is currently spent on *lock*; if amber becomes the accent, lock moves to a neutral filled state. Use it flat, with no glows. Allow one exception at most: the die itself.

## P1: motion that reads as glitchy, not smooth

### 5. The roll swaps everything at once, behind a "fizzle"
On a re-roll, `generateNightmare()` fires at 325ms (`app.js:583`) and **every** unlocked trait runs `trait-fizzle`: 460ms, `steps(10)`, blur + brightness + hue-rotate + skew + clip-path + a scanline background (`styles.css:1801-1890`). Stepped timing is jerky by design, and it's applied to 15–20 rows at once. Card heights also snap instantly when the new text is a different length, so the grid jumps underneath the effect. The die shake (`die-shake`, 110ms linear, ±6px, `styles.css:531`) adds a second jitter on top.

**Fix:** a single, smooth sequence.
- New text arrives **row by row**: opacity 0→1 and translateY 4px→0, 220ms, `cubic-bezier(0.2, 0, 0, 1)`, staggered 25–35ms per row in reading order (setting → hero → villain → squad → obstacles). The roll feels like it's being *dealt*.
- Animate card height changes. `interpolate-size: allow-keywords` (Chrome 129+) gets you `height: auto` transitions for free; otherwise use a FLIP measure on the cards. This removes the jump.
- Keep **one** CRT gesture, the first-roll `crt-boot` (it's good and happens once). Remove the per-row fizzle and the scanline sweep.
- Replace the shake with the tumble alone (it already exists, `tumble-*` 650ms). Give it a spring-ish ease (`cubic-bezier(0.34, 1.3, 0.64, 1)`) instead of `ease-in-out`, so it lands instead of stopping.

### 6. The die face fizzle clips the die in half mid-roll
`die-fizzle` animates `clip-path: inset(40% 0 40% 0)` → `inset(0 0 55% 0)` with `steps(8)`. In the 250ms screenshot the intro die is literally cut off at its middle. For 900ms the die flickers between half-faces, which reads as broken, not as "static".

**Fix:** swap faces with a quick 60ms cross-fade, or with no transition at all (real dice don't fade), and let the tumble carry the motion.

### 7. No motion system, just 15 one-off values
Here are the durations and easings in `styles.css`: `0.2s ease` (20 times), `200ms ease` (6), `150ms ease` (5), `0.15s ease` (4), `0.3s ease` (4), `400ms ease-out`, `0.25s`, `0.1s`, `650ms ease-in-out`, `steps(8)`, `steps(10)`, one `cubic-bezier`. The browser's default `ease` starts slowly, which is what makes hovers and toggles feel sluggish rather than crisp.

**Fix:** four tokens on `:root` and nothing else.
```css
--ease-out: cubic-bezier(0.2, 0, 0, 1);      /* things arriving */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1); /* things moving */
--dur-fast: 120ms;  /* hover, press, colour */
--dur-base: 220ms;  /* rows, toggles, menus */
--dur-slow: 360ms;  /* modals, card height, sheets */
```

### 8. Modals and menus snap in and out
`.modal-overlay` goes `display: none` → `display: flex` with no transition (`styles.css:1348-1356`). The same is true of the More menu and the mood listbox. They are the most "app-like" moments and they're the least smooth.

**Fix:** backdrop fade with `--dur-base`; panel opacity + `scale(.98)→1` (desktop) or `translateY(16px)→0` (phone, as a bottom sheet) with `--dur-slow --ease-out`. `@starting-style` plus `transition-behavior: allow-discrete` animates out of `display: none` with no JS.

### 9. Ambient motion that never stops
The intro die floats (`die-float` 3s infinite) *and* pulses its glow (`glow-pulse` 4s infinite). Two simultaneous infinite loops pull attention away from the one call to action (AP-53). Pick one gentle idle (the float, at 4px rather than 8px) or none.

Reduced motion is handled well already: there's a global override plus per-effect opt-outs. Keep it.

## P2: system consistency

### 10. The light theme is an afterthought
- The **CRT scanline overlay** (`body::before`, `styles.css:118`) is still on in light mode. On white, it shows as visible grey banding across the whole page. (In the full-page light screenshot the stripes stop at the fold, because the overlay is `position: fixed`.)
- Cards are tinted grey `#F6F8FA` with grey borders on a white page, so card + border + tint read as the generic "rounded card" (AP-8/AP-12).
- The accent changes hue between themes (see #4).

**Fix:** disable scanlines in light mode. For light, choose *either* hairline borders *or* tint, not both. Derive both themes from one hue so the accent is the same colour.

### 11. Inverted hierarchy: the summary is smaller than the details
The logline (the one sentence a kid would read out loud) is `0.9rem` (`styles.css:910`), smaller than every trait (`1.0625rem`). It sits in a box at the top but whispers.

**Fix:** set it at 20–22px, proportional face, no box, so it's the first thing the eye lands on. The cards then become the "workings" under it.

### 12. Typographic noise: `>>` and `>` prefixes
`>> THE SETTING` plus `>` before every bullet repeats the terminal joke 25 times per screen. Keep the `>` on traits (it's the prompt metaphor) or the `>>` on headings, not both, and set the prefix in the accent colour at reduced weight so it recedes.

### 13. Card treatment and spacing rhythm
Every section is a card with the same 1px border, 12px radius and identical inner padding, on the same grid gap. Within a card, the trait rows also use identical spacing for wrapped vs single-line items. Nothing in the layout groups the setting with the story or Hero vs Villain as a pair.

**Fix:** drop the outer border on cards in favour of a single surface step plus 1px hairline dividers between rows (AP-08). Use tighter spacing within a card and more between groups. Optionally pair Hero | Villain visually as the "versus" row, since the content is literally an opposition.

## What already works (keep it)
- The thumb-zone action bar on phones and the Undo/Roll pairing.
- The CRT boot on the first roll: one memorable moment, and it's the right place for it.
- Lock semantics (amber = held, red = destructive only) are thought through. Only the *rendering* is too loud.
- Reduced-motion and high-contrast handling.
- The die as the central object; it's the right metaphor and the right affordance.

## Suggested order
1. **Motion tokens + roll sequence** (#5–#8). This is the biggest perceived-quality gain, it's contained to CSS plus about 30 lines of JS, and it needs no design decision.
2. **Strip the accent borders and glows** (#1, #4 minus the accent choice, #9, #10 scanlines). Mostly deletions.
3. **Type system** (#2, #3, #11, #12). This needs a typeface decision.
4. **Accent colour + light theme** (#4, #10). This needs a palette decision.

## Outcome (same day)

The operator asked for the best call on both open decisions, and all 13 findings were acted on.

- **Typeface:** Atkinson Hyperlegible Next for everything you read (the Human web body face, and built for legibility, which suits kids), with its sibling Atkinson Hyperlegible Mono only for the terminal scaffolding: the wordmark, the `>` prompts, the `WHEN`/`WEAK` labels, kbd and share codes. No tracked caps anywhere.
- **Accent:** amber phosphor (`#FFB224`, ink `#8F5400` on paper) on warm near-black or warm paper. Lock moved to a neutral state (filled icon, tinted row, neutral card border) so it no longer shares a colour with Roll. Every text tone passes AA on every surface in both themes.
- **The one flourish:** a static amber block cursor after the wordmark. The die keeps a single still halo; every other glow, stripe, rule and the scanline overlay are gone.
- **Motion:** five tokens (three durations, ease-out, a spring for the die). New text is dealt in row by row (fade and 4px rise, 28ms stagger); cards glide to their new height (FLIP); the die tumbles with a landing overshoot and no shake or flicker; dialogs and menus fade and lift in through `@starting-style`. The first-roll CRT boot stays as the single retro moment.
- **Carried through:** present view, printed worksheet, share image, OG image (`og-image-v4.png`) and the app icons (new source `tools/icon.html`, `tools/render-icons.mjs`). The two em dashes in kid-facing copy were removed.
- **Follow-up, same evening:** the fade-and-rise alone made a change easy to miss, so changed text now gets an amber afterglow too: it lands amber with a soft halo and decays over 1.4s (a row wash was tried and dropped at the operator's call: text only), like new text on an amber CRT. It stays on under reduced motion, because it is a colour fade rather than movement and it is how you see what changed.
