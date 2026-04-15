# Pocket Dystopia - Build Specification

> A satirical dystopian story seed generator. Roll a d20 to generate randomized character traits, settings, and obstacles for absurd dystopian narratives. Elementary-school-safe humor meets satirical exaggeration.

---

## 1. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Vanilla HTML/CSS/JS (single page) | Matches current site; no build step; fast load |
| Fonts | Space Grotesk (headings), Space Mono (body) via Google Fonts | Replaces VT323; better readability, same terminal feel |
| Icons | Google Material Symbols Outlined via CDN | Free, web-native, 2500+ icons, outlined style matches terminal aesthetic |
| Screenshot | html2canvas v1.4+ via CDN | Client-side DOM-to-canvas; no server needed |
| Persistence | localStorage | Stores last build + locked state; survives tab close |
| Encoding | Native btoa/atob with URI encoding | For shareable base64 build codes |

### CDN Links

```html
<!-- Fonts -->
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">

<!-- Material Symbols Outlined -->
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet">

<!-- html2canvas -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
```

---

## 2. Design System (from Figma tokens)

### 2.1 Colors

```css
:root {
  /* Dark mode (default) */
  --bg-primary: #080A0D;
  --bg-secondary: #0D1117;
  --bg-elevated: #161B22;
  --bg-overlay: #1E2329;
  --text-primary: #E6EDF3;
  --text-secondary: #8B949E;
  --text-tertiary: #4A5568;
  --text-inverse: #080A0D;
  --accent-cyan: #00E5FF;
  --accent-cyan-muted: #00ACC1;
  --accent-cyan-dim: #006064;
  --accent-amber: #FFB020;
  --accent-amber-muted: #E09000;
  --accent-amber-dim: #804D00;
  --accent-red: #FF4D4D;
  --accent-red-muted: #CC3333;
  --accent-red-dim: #801A1A;
  --accent-green: #4ADE80;
  --accent-green-muted: #22C55E;
  --border-default: #30363D;
  --border-subtle: #21262D;
  --border-accent: #00E5FF;
}

/* Light mode */
[data-theme="light"] {
  --bg-primary: #FFFFFF;
  --bg-secondary: #F6F8FA;
  --bg-elevated: #FFFFFF;
  --bg-overlay: #F0F2F5;
  --text-primary: #1F2937;
  --text-secondary: #6B7280;
  --text-tertiary: #9CA3AF;
  --text-inverse: #FFFFFF;
  --accent-cyan: #0891B2;
  --accent-cyan-muted: #06B6D4;
  --accent-amber: #D97706;
  --accent-red: #DC2626;
  --accent-green: #16A34A;
  --border-default: #D1D5DB;
  --border-subtle: #E5E7EB;
  --border-accent: #0891B2;
}
```

### 2.2 Spacing Scale (bound to CSS custom properties)

```css
:root {
  --space-2xs: 2px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-2xl: 32px;
  --space-3xl: 48px;
  --space-4xl: 64px;
}
```

### 2.3 Border Radii

```css
:root {
  --radius-none: 0px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 24px;  /* pills */
}
```

### 2.4 Typography

```css
:root {
  --font-display: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'Space Mono', 'Courier New', monospace;
}

/* Scale */
.text-display   { font: 700 clamp(2rem, 6vw, 3.5rem)/1.1 var(--font-display); letter-spacing: 4px; }
.text-heading    { font: 700 1.25rem/1.3 var(--font-display); }
.text-subheading { font: 700 0.875rem/1.4 var(--font-body); text-transform: uppercase; }
.text-body       { font: 400 0.875rem/1.5 var(--font-body); }
.text-caption    { font: 400 0.75rem/1.4 var(--font-body); }
.text-micro      { font: 400 0.625rem/1.3 var(--font-body); }
```

### 2.5 Material Symbols Usage

```css
.material-symbols-outlined {
  font-variation-settings:
    'FILL' 0,
    'wght' 300,
    'GRAD' 0,
    'opsz' 24;
  font-size: 20px;
  vertical-align: middle;
  user-select: none;
}

/* Filled variant (for locked state) */
.icon-filled {
  font-variation-settings: 'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 24;
}
```

### 2.6 Icon Map

| Action | Icon name | Notes |
|--------|-----------|-------|
| Roll All | `casino` | In top bar CTA |
| Re-roll section | `sync` | Per-card header |
| Lock / Unlock | `lock` / `lock_open` | Per-card, toggles fill |
| Undo | `undo` | Top bar |
| Copy text | `content_copy` | Top bar |
| Save screenshot | `download` | Top bar, triggers html2canvas |
| Share code | `share` | Top bar, opens modal |
| Reset | `restart_alt` | Top bar or settings |
| Theme toggle | `dark_mode` / `light_mode` | Top bar |
| Expand / Collapse | `expand_more` / `expand_less` | Card or view toggle |
| Filter / Mood | `tune` | Pre-roll filter |
| Left-hand mode | `back_hand` | Settings |
| Close modal | `close` | Modal X button |

---

## 3. Page Structure

### 3.1 Screens & States

```
INTRO STATE
+-----------------------------------------+
|           POCKET DYSTOPIA                |
|     Roll a satirical dystopian seed      |
|                                          |
|      [base64 input field]               |
|      [Load Build]                        |
|                                          |
|            (( d20 die ))                 |
|            tap to roll                   |
|                                          |
|       built with love by Nico Jan        |
+-----------------------------------------+

RESULTS STATE
+-----------------------------------------+
| POCKET DYSTOPIA  [undo][copy][save][die] |
|-----------------------------------------|
| [Compressed / Expanded]  [mood filter]   |
|-----------------------------------------|
| >> THE HERO            [lock] [re-roll]  |
| > trait 1                                |
| > trait 2                                |
| > trait 3                                |
| WEAK: weakness         [lock]            |
| TRAUMA: trauma         [lock]            |
|-----------------------------------------|
| >> THE VILLAIN         [lock] [re-roll]  |
| ...                                      |
|-----------------------------------------|
| >> THE SQUAD           [lock] [re-roll]  |
| ...                                      |
|-----------------------------------------|
| >> THE SETTING         [lock] [re-roll]  |
| ...                                      |
|-----------------------------------------|
| >> OBSTACLES           [lock] [re-roll]  |
| ...                                      |
|-----------------------------------------|
|       built with love by Nico Jan        |
+-----------------------------------------+

SAVE/SHARE MODAL
+-----------------------------------------+
|          SAVE YOUR BUILD        [close]  |
|                                          |
| Your build code:                         |
| +-------------------------------------+ |
| | eyJoZXJvIjp7InRyYWl0cyI6Wy...     | |
| +-------------------------------------+ |
| [Copy Code]                              |
|                                          |
| Screenshot saved to downloads.           |
+-----------------------------------------+
```

### 3.2 Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| < 600px | Single column, stacked cards, bottom-sheet style |
| 600-1024px | Single column, wider cards |
| > 1024px | 2+3 card grid (Hero/Villain top, Squad/Setting/Obstacles bottom) |

### 3.3 Left-Handed Mode

When enabled (stored in localStorage):
- Top bar: Die CTA moves to LEFT side, title follows
- Card headers: Lock + re-roll icons move to LEFT side of section title
- Compact cards: Expand indicator moves to LEFT
- Text stays left-aligned (reading direction preserved)
- Toggle via settings or `back_hand` icon in top bar

---

## 4. Feature Specifications

### 4.1 Die Animation (Intro)

The d20 die icon on the intro screen cycles through random die face numbers to convey randomness.

```
BEHAVIOR:
- On page load, the die number text cycles every 600ms (idle state)
- Numbers 1-20, randomly selected
- On click/tap:
  - Fast cycle (~60fps) for 900ms
  - CRT boot animation plays on first roll (600ms)
  - Die tumble animation on subsequent rolls (650ms, random axis)
  - Content swaps at animation midpoint (325ms)
- Die floats with gentle bob animation (3s ease-in-out loop)
- Cyan glow pulses (4s ease-in-out loop)
```

### 4.2 Locking

**Section-level locking:**
- Each card header has a lock icon (right side, or left side in LH mode)
- Tap lock icon to toggle locked state
- Locked cards: `lock` icon (filled), subtle cyan border, content preserved on Roll All
- Unlocked cards: `lock_open` icon (outlined), default border

**Trait-level locking:**
- Each individual trait line has a small lock icon on hover/tap
- Locked traits stay when the parent section is re-rolled
- Visual: locked trait gets a subtle left-border highlight in `--accent-cyan-dim`

**Roll All behavior with locks:**
- Iterates all sections
- Skips sections where section-level lock is active
- For unlocked sections, re-rolls all traits EXCEPT individually locked traits
- Locked traits stay in place; unlocked traits get new random values

### 4.3 Undo / History

```
STATE:
- history[] array (max 20 entries)
- Each entry is a full snapshot of the current build state
- Push to history before every roll

BEHAVIOR:
- Undo button in top bar
- Restores previous build state (traits, locks, everything)
- Disabled when history is empty
- Single-level undo pops last entry; multiple presses walk back through history
```

### 4.4 Copy to Clipboard

```
BEHAVIOR:
- Copies formatted plain text of the current build
- Format:

  POCKET DYSTOPIA - Story Seed
  ============================

  >> THE HERO
  > found a book, now thinks they are 'The One'
  > rebellious streak (hates beige)
  > has a robot arm or glowy eye
  WEAK: abandonment issues (classic)
  TRAUMA: parents taken by men in masks

  >> THE VILLAIN
  ...

- Shows brief toast: "Copied to clipboard!"
- Uses navigator.clipboard.writeText()
```

### 4.5 Save / Screenshot + Share Code

**Screenshot (download):**
```
BEHAVIOR:
- Uses html2canvas to capture the results container
- Converts to PNG blob
- Triggers browser download as "pocket-dystopia-{timestamp}.png"
- Background color set to --bg-primary for clean capture
```

**Share Code (modal):**
```
BEHAVIOR:
- Serializes current build state to JSON
- Encodes: btoa(encodeURIComponent(JSON.stringify(state)))
- Opens modal with:
  - Read-only textarea showing the base64 code
  - "Copy Code" button
  - Instructions text
- User can share this code with others
```

**Load Build (intro screen):**
```
BEHAVIOR:
- Input field below the die on intro screen
- Placeholder: "Paste a build code to restore..."
- "Load Build" button
- Decodes: JSON.parse(decodeURIComponent(atob(code)))
- Validates the decoded state has expected structure
- If valid: loads the build, transitions to results state
- If invalid: shows inline error "Invalid build code"
```

### 4.6 Cookie/localStorage Persistence

```
KEY: 'pocket-dystopia-state'
VALUE: JSON string of current build state

BEHAVIOR:
- Auto-save to localStorage after every roll, lock change, or trait edit
- On page load:
  - Check localStorage for saved state
  - If found: auto-load the build, skip intro, show results
  - If not found: show intro screen as default
- Reset button:
  - Clears localStorage
  - Returns to intro screen
  - Clears all trait data and lock states
  - Shows brief toast: "Build cleared"

KEY: 'pocket-dystopia-prefs'
VALUE: JSON string of user preferences
  {
    "theme": "dark" | "light",
    "leftHanded": false | true,
    "defaultView": "expanded" | "compressed"
  }
```

### 4.7 Mood / Theme Filter

```
MOODS:
- "All" (default - full random)
- "Corporate Dystopia" (CEO, tech-bro, office, subscription)
- "Post-Apocalyptic" (wasteland, survival, radiation)
- "AI Takeover" (robots, algorithms, uploads)
- "Political Satire" (politicians, regimes, propaganda)

BEHAVIOR:
- Filter selector on results screen (below toggles)
- Biases the random pool: mood-tagged traits are weighted 3x
- Each trait in the data model has an optional mood[] tag
- Filter is cosmetic weighting, not hard exclusion
- Stored in preferences
```

### 4.8 Shake to Roll (Mobile)

```
BEHAVIOR:
- Uses DeviceMotionEvent API
- Threshold: acceleration > 15 on any axis
- Debounce: 1000ms cooldown between shake triggers
- Triggers same generateNightmare() function as die tap
- Request permission on iOS (DeviceMotionEvent.requestPermission)
- Graceful degradation: if API unavailable, feature silently disabled
```

### 4.9 Compressed / Expanded View Toggle

```
BEHAVIOR:
- Segmented control: "Compressed" | "Expanded"
- Expanded (default after roll): Full card content with all traits
- Compressed: Card header + one summary line only
- Transition: CSS height animation with overflow hidden
- Stored in preferences as defaultView
```

### 4.10 Dark / Light Mode

```
BEHAVIOR:
- Toggle icon in top bar: dark_mode / light_mode
- Sets data-theme attribute on <html>
- CSS variables swap via [data-theme="light"] selector
- Stored in preferences
- Respects prefers-color-scheme on first visit
```

### 4.11 Reset

```
BEHAVIOR:
- Button in top bar or accessible from a settings area
- Confirmation: "Reset everything? This will clear your saved build."
- On confirm:
  - localStorage.removeItem('pocket-dystopia-state')
  - Resets to intro screen
  - Clears all trait data, locks, history
  - Shows toast: "Build cleared"
```

---

## 5. Data Model

### 5.1 Build State Schema

```javascript
const buildState = {
  version: 1,  // For future migration
  timestamp: Date.now(),
  mood: "all",
  sections: {
    hero: {
      locked: false,
      traits: [
        { text: "found a book, now thinks they are 'The One'", locked: false },
        { text: "rebellious streak (hates beige)", locked: false },
        { text: "has a robot arm or glowy eye", locked: false }
      ],
      weakness: { text: "abandonment issues (classic)", locked: false },
      trauma: { text: "parents taken by men in masks", locked: false }
    },
    villain: {
      locked: false,
      traits: [
        { text: "chad dictator with great hair", locked: false },
        { text: "CEO of Water (subscription required)", locked: false },
        { text: "scientist who says 'I am saving humanity by destroying it'", locked: false }
      ],
      weakness: { text: "monologues their evil plan every time", locked: false }
    },
    squad: {
      locked: false,
      traits: [
        { text: "loyal but terrified (Red Shirt number 1)", locked: false },
        { text: "scavenger who hoards spoons", locked: false },
        { text: "annoyingly optimistic despite acid rain", locked: false }
      ]
    },
    setting: {
      locked: false,
      when: { text: "the Year of Our AI Overlord", locked: false },
      where: { text: "underground bunker number 404", locked: false }
    },
    obstacles: {
      locked: false,
      traits: [
        { text: "drones with bad aim", locked: false },
        { text: "existential dread", locked: false }
      ]
    }
  }
};
```

### 5.2 Base64 Encode/Decode

```javascript
// Encode
function encodeBuild(state) {
  return btoa(encodeURIComponent(JSON.stringify(state)));
}

// Decode
function decodeBuild(code) {
  try {
    const json = JSON.parse(decodeURIComponent(atob(code)));
    if (!json.version || !json.sections) throw new Error('Invalid');
    return json;
  } catch (e) {
    return null; // Invalid code
  }
}
```

### 5.3 Expanded Trait Lists

All traits are safe for elementary school classrooms. Humor comes from satirical exaggeration of dystopian tropes, not from adult content.

```javascript
const DATA = {
  heroTraits: [
    // Original (cleaned)
    "found a book, now thinks they are 'The One'",
    "too empathetic for this cruel world",
    "parkour expert (run, jump, repeat)",
    "can hack the mainframe in under 3 seconds",
    "rebellious streak (hates beige)",
    "obnoxious sense of justice",
    "thinking fast, acting not-so-smart",
    "the 'Chosen One' (Generic Variant B)",
    "has a robot arm or glowy eye",
    "super young but somehow can fix everything",
    "must find THE TRUTH (Caps Lock permanently on)",
    // Expanded
    "allergic to authority figures",
    "raised by library robots",
    "talks to plants (the plants talk back)",
    "drew a map on a napkin, calls it 'the plan'",
    "can smell danger (it smells like burnt toast)",
    "accidentally started the revolution by sneezing",
    "carries a broken compass for 'good luck'",
    "has memorized every air duct in the building",
    "refuses to use doors (windows only)",
    "makes motivational speeches nobody asked for",
    "best friends with every stray animal in the sector",
    "once read a self-help book, now unstoppable",
    "communicates only in dramatic whispers",
    "has a catchphrase they use way too often",
    "sleeps with one eye open (literally, it is glued)",
  ],

  heroWeaknesses: [
    "trusts the villain immediately every time",
    "abandonment issues (classic)",
    "guilt over something in Chapter 1",
    "punches walls when frustrated",
    "physically wobbly but has 'heart'",
    "thinks they are invincible (spoiler: absolutely not)",
    "will sacrifice everything for their pet",
    "cannot follow simple instructions",
    "panics when anything beeps",
    "trackable via their microchip",
    // Expanded
    "afraid of the dark (lives underground)",
    "cannot whisper, only shout-whispers",
    "terrible at lying but tries constantly",
    "allergic to the one thing that could save everyone",
    "always trips at the worst possible moment",
    "gets distracted by shiny objects mid-mission",
    "overshares personal feelings during battle",
    "refuses to ask for directions, gets lost in every sector",
    "believes every disguise works (none do)",
    "cannot remember anyone's name correctly",
  ],

  heroTraumas: [
    "parents taken away by mysterious masked figures",
    "house blew up (character building, apparently)",
    "boarding school for 'difficult' children",
    "skipped breakfast this morning (devastating)",
    "exiled for having non-regulation hair",
    "grew up in a bubble (literally)",
    "accidentally snitched once, never lived it down",
    "survived the 'Great Purge of Snacks'",
    "brainwashed by TV commercials",
    "tested on like a lab hamster",
    // Expanded
    "favorite toy was confiscated by the regime",
    "won a contest but the prize was a trap",
    "their goldfish was 'relocated' by the government",
    "told they were special, then put on a waiting list",
    "watched their treehouse get demolished for a parking lot",
    "assigned a 'happiness score' of 2 out of 10",
    "their lunchbox was classified as contraband",
    "made Employee of the Month but the company was evil",
    "pen pal turned out to be a surveillance bot",
    "birthday party was canceled due to 'resource allocation'",
  ],

  villainTraits: [
    "chad dictator with great hair",
    "a corrupted leader who took control of the entire city",
    "tech-bro uploading brains to the cloud (no refunds)",
    "angry general shouting at screens all day",
    "CEO of Water (subscription required)",
    "scientist who says 'I am saving humanity by destroying it'",
    "an evil robot who wants to destroy the world (classic)",
    "politician hiding aliens in the basement",
    "an alien emperor who wants to take over the planet",
    "AI who decided saving humanity means rebooting it",
    "the giant dragon who is, for some reason, always the bad guy",
    // Expanded
    "principal who banned recess permanently",
    "billionaire who bought the sun",
    "evil twin who is slightly taller",
    "former hall monitor who never gave up the power",
    "inventor of the homework machine (mandatory use)",
    "runs the only pizza place in town, charges outrageous prices",
    "controls the weather app (always says 'rain')",
    "librarian who banned all books except their own",
    "self-appointed king of the school cafeteria",
    "mad scientist whose experiments keep 'accidentally' escaping",
    "the neighbor who reports everyone for everything",
    "influencer with mind-control followers",
    "wizard who graduated from an online magic school",
    "time-traveler who keeps making things worse",
    "a very polite villain who apologizes before every evil deed",
  ],

  villainWeaknesses: [
    "monologues their evil plan every time",
    "forgot about the Power of Friendship",
    "forgot to update the firewall",
    "minions are forming a union",
    "obsessed with symmetry",
    "fragile ego (hates bad reviews)",
    "actually three kids in a trench coat",
    "secretly a fan of the hero's cooking",
    "hiding a very silly hat collection",
    "relies on outdated technology",
    // Expanded
    "cannot resist petting cute animals",
    "falls asleep during their own speeches",
    "allergic to their own secret weapon",
    "keeps a diary that anyone could find",
    "terrified of pigeons",
    "their evil lair has terrible WiFi",
    "gets homesick easily",
    "cannot operate the coffee machine",
    "trips over their own cape regularly",
    "gets emotional during sad movies",
  ],

  squadMembers: [
    "loyal but terrified (Red Shirt number 1)",
    "secretly in the resistance (has a cool tattoo to prove it)",
    "annoyingly optimistic despite acid rain",
    "scavenger who hoards spoons for no reason",
    "ex-government worker who keeps saying 'I should not say this but...'",
    "medic who uses questionable bandages",
    "elder who says 'I remember trees...'",
    "tech-kid who fixes everything with chewing gum",
    "silent brooding type (budget reasons)",
    "citizen who actually reads the Terms of Service",
    "the musician who is completely tone deaf",
    // Expanded
    "conspiracy theorist who is right about one thing",
    "robot who thinks it is human (nobody corrects it)",
    "chef who can make anything taste okay-ish",
    "navigator who only knows left turns",
    "historian who won't stop saying 'actually...'",
    "the one who always has snacks (very popular)",
    "hacker who only knows one password",
    "lookout who needs glasses badly",
    "former villain intern who switched sides",
    "translator who makes up half the translations",
    "pet that is probably smarter than everyone",
    "mechanic who 'fixes' things with a hammer",
    "the squad's self-appointed morale officer",
    "expert in a skill nobody has ever needed until now",
    "someone who just showed up and nobody knows why",
  ],

  settings: [
    "Sector 7 (it is always Sector 7)",
    "the tunnels (smells like wet dog)",
    "Zone A versus Zone Z",
    "Cloud City (oxygen subscription required)",
    "a rustic city that looks suspiciously like a movie set",
    "Radioactive Forest of Mild Danger",
    "rickety bridges between abandoned skyscrapers",
    "spooky laboratory with flickering lights",
    "Too Cold To Live: The City",
    "underground bunker number 404",
    "the high-tech lab that somehow always leaks",
    // Expanded
    "a shopping mall that has been 'temporarily closed' for 50 years",
    "the last library (guarded by feral librarians)",
    "a floating school bus that nobody can steer",
    "an amusement park where nothing is amusing",
    "the cafeteria to end all cafeterias",
    "a factory that only makes beige uniforms",
    "someone's attic, converted into rebel headquarters",
    "a zoo where the animals run the place",
    "the internet, but it is a physical place now",
    "a desert made entirely of recycled homework",
    "a train that never stops (bathroom breaks are complicated)",
    "a greenhouse the size of a small country",
    "the rooftop garden above the villain's headquarters",
    "a submarine made from recycled soda cans",
    "a cave with surprisingly good interior decorating",
  ],

  times: [
    "Tuesday, next week (economy is bad)",
    "2099 (everything is chrome now)",
    "the Year of Our AI Overlord",
    "after the Super-Flu, nobody remembers when exactly",
    "100 years after aliens pointed and laughed at us",
    "day 1 of the New Regime (orientation day)",
    "a timeline confusingly similar to right now",
    "the Age of Beige Uniforms",
    "Mars o'clock (Earth is a parking lot)",
    "alternate 1985 (everything went differently)",
    // Expanded
    "exactly 5 minutes in the future",
    "the year homework became illegal",
    "after the Great Wi-Fi Outage",
    "when dinosaurs came back (they are not happy)",
    "the summer that lasted three years straight",
    "right after nap time was canceled globally",
    "the moment someone pressed the big red button",
    "back when pizza was still free (the golden age)",
    "three days before the robots figure it out",
    "during the longest Monday in recorded history",
  ],

  obstacles: [
    "drones with really bad aim",
    "acid rain but more of a drizzle",
    "top 10 Anime-Style Betrayals",
    "vending machine is out of water again",
    "road closed (construction forever and ever)",
    "the timer is ticking on something important",
    "Mom calls via hologram to guilt trip",
    "the important gadget jammed at the worst moment",
    "existential dread (the invisible enemy)",
    "the rabbit chewed through the important cable",
    // Expanded
    "elevator music that never, ever stops",
    "a riddle that makes absolutely no sense",
    "the bridge is a drawbridge and nobody has the crank",
    "quicksand but it is actually just very sticky mud",
    "an alarm that will not stop beeping",
    "the map is upside down (or is the world upside down?)",
    "allergies acting up at the worst moment",
    "a pop quiz in the middle of the escape",
    "the getaway vehicle needs to be charged for 8 hours",
    "someone forgot the secret password",
    "the villain's pet is blocking the only exit",
    "a very long line with no skip option",
    "gravity keeps switching directions",
    "the instruction manual is in a language nobody speaks",
    "an unexpected field trip to the danger zone",
  ],
};
```

**Mood Tags** (add to each trait as an array):
```javascript
// Example: tag traits for mood filtering
{ text: "CEO of Water (subscription required)", mood: ["corporate"] }
{ text: "Radioactive Forest of Mild Danger", mood: ["post-apocalyptic"] }
{ text: "AI who decided saving humanity means rebooting it", mood: ["ai-takeover"] }
{ text: "politician hiding aliens in the basement", mood: ["political"] }
```

---

## 6. Animations & Transitions

### 6.1 CRT Boot (First Roll)

Retain from current build. The container scales from a horizontal line to full size with:
- Scanline sweep (cyan gradient line)
- Glow bloom (radial gradient pulse)
- Content flicker (opacity steps)
- Duration: ~600ms, cubic-bezier(0.2, 0.7, 0.2, 1)

### 6.2 Die Tumble (Subsequent Rolls)

Retain from current build. Random axis rotation:
- 5 variants: rotateX, rotateX-neg, rotateY, rotateY-neg, diagonal
- Duration: 650ms
- Content swaps at midpoint (325ms) when face is hidden
- Never repeat the same direction consecutively

### 6.3 Die Float (Idle)

- Gentle vertical bob: translateY(0) to translateY(-8px), 3s ease-in-out loop
- Glow pulse: drop-shadow intensity varies, 4s ease-in-out loop

### 6.4 Lock Toggle

```css
.lock-icon { transition: transform 0.2s ease, color 0.2s ease; }
.lock-icon:active { transform: scale(0.85); }
.card.locked { border-color: var(--accent-cyan-dim); transition: border-color 0.3s ease; }
```

### 6.5 Card Expand/Collapse

```css
.card-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.35s ease, opacity 0.25s ease;
  opacity: 0;
}
.card.expanded .card-content {
  max-height: 500px; /* generous upper bound */
  opacity: 1;
}
```

### 6.6 Toast Notification

```css
.toast {
  position: fixed; bottom: var(--space-xl); left: 50%;
  transform: translateX(-50%) translateY(20px);
  opacity: 0;
  transition: all 0.3s ease;
}
.toast.visible {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}
```

---

## 7. Accessibility (WCAG 2.1 AA)

| Requirement | Implementation |
|-------------|---------------|
| Keyboard navigation | All interactive elements focusable with Tab; Enter/Space to activate |
| Focus indicators | 2px cyan outline on focus-visible, offset 2px |
| Screen reader labels | aria-label on all icon buttons; aria-live="polite" on results area |
| Reduced motion | @media (prefers-reduced-motion: reduce) disables all animations |
| Color contrast | 4.5:1 minimum for body text, 3:1 for large text; test both themes |
| Touch targets | Minimum 44x44px for all interactive elements |
| Skip link | Hidden "Skip to content" link at top of page |
| Semantic HTML | Proper heading hierarchy (h1, h2); landmark regions (header, main, footer) |
| Lock state | aria-pressed on lock toggles; aria-label updates ("Lock hero section" / "Unlock hero section") |
| Toast announcements | aria-live="assertive" on toast container |

---

## 8. File Structure

```
pocket-dystopia/
  index.html          # Single-page app, all markup
  styles.css           # All styles, CSS variables, animations
  app.js               # App logic, state management, rolling
  data.js              # Trait data arrays with mood tags
  og-image-v1.png      # Open Graph social image
  apple-touch-icon.png # PWA icon
  favicon.ico          # Favicon
```

---

## 9. Implementation Notes

### 9.1 Screenshot with html2canvas

```javascript
async function saveScreenshot() {
  const container = document.getElementById('results-container');
  const canvas = await html2canvas(container, {
    backgroundColor: getComputedStyle(document.documentElement)
      .getPropertyValue('--bg-primary').trim(),
    scale: 2,  // Retina quality
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
  }, 'image/png');
}
```

### 9.2 Shake Detection

```javascript
function initShakeDetection() {
  let lastShake = 0;
  const threshold = 15;
  const cooldown = 1000;

  function handleMotion(e) {
    const { x, y, z } = e.accelerationIncludingGravity || {};
    if (Math.abs(x) > threshold || Math.abs(y) > threshold || Math.abs(z) > threshold) {
      const now = Date.now();
      if (now - lastShake > cooldown) {
        lastShake = now;
        generateNightmare();
      }
    }
  }

  // iOS 13+ requires permission
  if (typeof DeviceMotionEvent?.requestPermission === 'function') {
    // Request on first user interaction
    document.addEventListener('click', async function reqPerm() {
      const perm = await DeviceMotionEvent.requestPermission();
      if (perm === 'granted') window.addEventListener('devicemotion', handleMotion);
      document.removeEventListener('click', reqPerm);
    }, { once: true });
  } else if (window.DeviceMotionEvent) {
    window.addEventListener('devicemotion', handleMotion);
  }
}
```

### 9.3 Die Face Animation

Instead of a static "6" on the die, cycle through stylized die face representations using SVG:

```javascript
// Array of d20 face numbers
const dieFaces = Array.from({length: 20}, (_, i) => i + 1);

function startDieIdleCycle() {
  setInterval(() => {
    const num = dieFaces[Math.floor(Math.random() * dieFaces.length)];
    document.getElementById('die-num').textContent = num;
  }, 600);
}

// Fast spin during roll
function rollDieCycle(duration) {
  const end = Date.now() + duration;
  function tick() {
    document.getElementById('die-num').textContent =
      dieFaces[Math.floor(Math.random() * dieFaces.length)];
    if (Date.now() < end) requestAnimationFrame(tick);
    else startDieIdleCycle();
  }
  requestAnimationFrame(tick);
}
```

### 9.4 Random Selection with Mood Weighting

```javascript
function getWeightedItems(pool, count, mood) {
  if (mood === 'all') {
    return shuffleAndPick(pool, count);
  }
  // Weight mood-matching items 3x
  const weighted = pool.flatMap(item =>
    (item.mood && item.mood.includes(mood))
      ? [item, item, item]  // 3x weight
      : [item]
  );
  return shuffleAndPick(weighted, count);
}

function shuffleAndPick(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  // Deduplicate (since mood weighting creates duplicates)
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
```

---

## 10. CRT Scanline Overlay

Retain from current build. Full-viewport pseudo-element with:
```css
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background:
    linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.25) 50%),
    linear-gradient(90deg, rgba(255,0,0,0.06), rgba(0,255,0,0.02), rgba(0,0,255,0.06));
  background-size: 100% 2px, 3px 100%;
  pointer-events: none;
  z-index: 999;
}
```
This overlay should be toggle-able in reduced motion mode.

---

## 11. Open Graph / Meta

```html
<meta property="og:title" content="Pocket Dystopia">
<meta property="og:description" content="Roll a satirical dystopian story seed. Lock traits, re-roll sections, share your build.">
<meta property="og:image" content="https://classwith.nicojan.com/pocket-dystopia/og-image-v1.png">
<meta property="og:url" content="https://classwith.nicojan.com/pocket-dystopia/">
<meta property="twitter:card" content="summary_large_image">
```

---

## 12. Testing Checklist

- [ ] Roll generates unique content each time
- [ ] Lock section prevents re-roll of that section
- [ ] Lock individual trait preserves it during section re-roll
- [ ] Undo restores previous state
- [ ] Copy produces correctly formatted text
- [ ] Screenshot downloads as PNG
- [ ] Share code modal shows valid base64
- [ ] Load build from base64 restores full state
- [ ] localStorage persists across page reloads
- [ ] Reset clears storage and returns to intro
- [ ] Left-handed mode flips interactive elements
- [ ] Dark/light theme toggles and persists
- [ ] Mood filter biases results appropriately
- [ ] Shake to roll works on mobile (iOS + Android)
- [ ] Compressed/expanded toggle animates cards
- [ ] CRT boot animation plays on first roll only
- [ ] Die tumble plays on subsequent rolls with random direction
- [ ] All touch targets meet 44px minimum
- [ ] Keyboard navigation works throughout
- [ ] Screen reader announces state changes
- [ ] Reduced motion disables animations
- [ ] All traits are elementary-school appropriate
