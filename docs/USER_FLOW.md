# Blankrace — User Flow and Screens

A brief for UI generation (Figma Make, Google Stitch). Source of truth: spec issue #3, `GLOSSARY.md`, `docs/adr/`.

## The product in one paragraph

Blankrace is a free, real-time spelling race in the browser. You see a picture and a row of Blanks, one per letter, and race to spell the word. No install, no sign-up to play: a visitor arrives as a **Guest** with a generated name (e.g. SwiftFox84). A **Match** is 5 **Rounds** of 15 seconds. Up to 10 people per **Room**. Play alone (Solo), with friends (Private, shared by link/code) or with strangers (Public). Signing in with Google turns a Guest into an **Account** with a username and stats. Mobile first.

## Visual direction

- **Background**: `#FDFDFC` everywhere. Light only, no dark mode.
- **Feel**: a little crayon-like, but polished. Hand-drawn warmth from the pictures and small accents (a wobbly underline, a crayon-textured highlight); the layout, type and controls stay clean and crisp.
- **Pictures**: crayon-style illustrations on a white/transparent ground, like the reference (a pomegranate with a dark crayon outline, textured fill, small yellow "pop" marks). Shown **without borders, frames or card backgrounds**: the picture sits directly on the page.
- **Fonts**: _to be chosen by the designer_ — display: `____`, body/UI: `____`.
- **Colours**: _to be defined_ — main action, secondary action, correct (solved), near miss ("Almost!"), wrong, timer warning.

## Flow

```
Open site ──► Home (Guest name assigned)
               ├─ Create Solo ──────────► Room: Lobby ─► Start
               ├─ Create Private/Public ► Room: Lobby (share code/link) ─► Host starts
               ├─ Enter code ───────────► Room (or "Room ended" / refusal message)
               ├─ Pick Public Room ─────► Room (Lobby, or Spectating if a Match is on)
               └─ Sign in with Google ──► Choose Username (first time) ─► back
Room:  Lobby ─► [Countdown 3s ─► Round 15s ─► Reveal 5s] × 5 ─► Podium ─► Play again ─► Countdown
Link /r/CODE ─► straight into that Room
```

## Screens

### 1. Home (`/`)
- Logo / wordmark.
- Your name: the Guest handle, editable (max 15 chars; inline error for too long or not allowed). Accounts see their username instead, with a link to Profile.
- Three create buttons: **Play solo**, **Private room**, **Public room**.
- **Join with code**: 6-character input (letters/digits, no 0/O/1/I/L), Join button.
- **Public rooms** list: each row shows the code, headcount (e.g. 4/10) and "In a match" or "Waiting". Busiest first; refreshes on its own every 10 s. Empty state: "No public rooms right now — start one".
- **Sign in with Google** (Guests only), with a note: "Guests' results aren't saved".

### 2. Room — Lobby (`/r/CODE`, before a Match)
- Room code, big, with **Copy link** / share (hidden for Solo).
- Roster: everyone in the Room, live. Each row: identity icon (Guest vs Account — must look different), name, a Host badge, "you" marker.
- Host: **Start** button. Others: "Waiting for {Host} to start".
- **Leave room** (asks to confirm).
- Guests can rename here.

### 3. Countdown (3 s)
- Large 3 · 2 · 1 over the Room; Round number ("Round 2 of 5").

### 4. Round (15 s)
- Round number and a visible 15-second **timer** (warning state near the end).
- The **picture**, large, centred, no border.
- **Blanks**: one slot per letter. Hint Letters (given) appear pre-filled and visually different; the cursor skips them. Current slot is highlighted.
- States: typing; **wrong** (Blanks shake, letters kept); **"Almost!"** (near miss, no position shown); **solved** (Blanks lock, success state).
- **On-screen A–Z keyboard** with backspace on phones (no native keyboard). Desktop types with the physical keyboard.
- Compact roster: who has solved (tick), not what they typed; your score.

### 5. Reveal (5 s, after each Round)
- The word spelled out in the Blanks.
- Points earned this Round per Player (up to 100), updated totals, ordered.
- (The next picture is preloading; no UI needed.)

### 6. Podium (end of Match)
- Placings 1–3 on a podium, then the rest in a list; shared places for ties (1, 1, 3). Points per Player.
- Host: **Play again** (Solo: **Play again**). Others: waiting for Host.
- Guests: nudge to sign in with Google to keep a record.
- **Leave room**.

### 7. Spectating
- Joined mid-Match: sees the Round/Reveal views read-only (no keyboard), with a "You'll play from the next match" banner.

### 8. Choose Username (after first Google sign-in)
- Input pre-filled with the current Guest name; rules: max 15 chars, unique. Inline errors ("taken", "not allowed"). **Continue**.

### 9. Profile (signed in only)
- Username (editable), Matches played, Matches won, best Match score. Sign out.

### 10. Room ended / can't join
- "This room has ended" for an old code, with **Back home**.
- Same layout for refusals: Solo room (private to its creator), Room full (10), Room not found.

## States to design on every screen
Loading, empty, error, reconnecting ("Reconnecting…" — your Seat is kept for 30 s), and the mobile (≈390 px) and desktop layouts.
