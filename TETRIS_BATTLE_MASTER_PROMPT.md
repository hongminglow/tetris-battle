# TETRIS BATTLE — MASTER PROMPT (v1.0)

> **You are an autonomous coding agent.** Your task is to build a complete,
> playable, browser-based Tetris Battle game (1 human vs heuristic AI) in
> an empty directory, following this specification end-to-end. Do not stop
> at "good enough" — implement every detail. The spec is exhaustive on
> purpose; deviations are graded as failures.
>
> Hand this single document to the agent. No other files. The agent should
> produce a working `dist/` plus all source code, tests, and a README.

---

## 0 · Mission

Build a TypeScript + Vite + Canvas2D web app that implements **modern
guideline-faithful Tetris** as a 1-human-vs-CPU battle:

- Two side-by-side 10×20 playfields.
- Human plays the left board with the keyboard.
- A Dellacherie heuristic AI plays the right board.
- Line clears send garbage lines to the opponent (with FIFO cancellation).
- First top-out loses; rematch with same seed; new seed via title screen.
- Polished: line-clear particles, screen shake, KO splash, garbage warning
  flash, responsive layout.
- Deterministic: one match seed → reproducible run.

---

## 1 · Tech stack (LOCKED — use exactly these)

- Node 20+, package manager `npm`.
- `typescript@^5.6.0` strict mode, target ES2022, `noUncheckedIndexedAccess: true`.
- `vite@^6.0.0` with `build.target: "es2022"`.
- `vitest@^2.0.0` for unit tests (`tests/` directory, `*.test.ts`).
- `@types/node@^20.0.0`.
- **NO** UI framework (no React/Vue/Svelte).
- **NO** game engine (no Phaser/Pixi).
- **NO** CSS framework (no Tailwind/Bootstrap).
- **NO** other runtime deps. The only `dependencies` block in package.json
  should be empty; only `devDependencies` are populated.

---

## 2 · Folder layout (LOCKED — use these exact paths)

```
tetris-battle/                    # everything inside this folder
├── README.md
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── public/
│   └── favicon.svg
├── src/
│   ├── main.ts                   # bootstrap + screen state machine + render loop
│   ├── styles.css
│   ├── app/
│   │   ├── App.ts
│   │   └── Loop.ts               # fixed-timestep RAF loop (60 Hz)
│   ├── engine/                   # pure, deterministic, no-DOM
│   │   ├── types.ts
│   │   ├── tetrominoes.ts
│   │   ├── kicks.ts
│   │   ├── rng.ts
│   │   ├── board.ts
│   │   ├── piece.ts
│   │   ├── scoring.ts
│   │   ├── tspin.ts
│   │   └── game.ts
│   ├── ai/
│   │   └── dellacherie.ts
│   ├── render/
│   │   ├── theme.ts
│   │   ├── board-renderer.ts
│   │   ├── hud-renderer.ts
│   │   ├── particles.ts
│   │   └── shake.ts
│   ├── input/
│   │   └── keyboard.ts
│   └── match/
│       ├── Battle.ts
│       └── ai-driver.ts
└── tests/
    ├── ai.test.ts
    ├── board.test.ts
    ├── kicks.test.ts
    ├── piece.test.ts
    ├── rng.test.ts
    ├── scoring.test.ts
    └── tspin.test.ts
```

---

## 3 · Engine spec — every constant

### Board

- 10 columns, 40 rows total (top 20 rows are a hidden buffer above the
  visible playfield; bottom 20 rows are visible).
- Indexed as `board[y][x]` with `y=0` at the top of the buffer, `y=39` at
  the bottom. Visible top edge is at `y=20`.
- Cells are `0` (empty), one of `'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'`,
  or `'G'` (garbage).

### Tetromino spawn

- Spawn position for all pieces: bounding-box top-left at `(x=3, y=18)`.
- The shape data places the piece's first visible cells at the top of the
  visible playfield (rows 19–21 depending on shape).
- Spawn rotation is `0` for every piece. Rotation 0 conventions:
  - **I**: horizontal in row 1 of a 4×4 box → cells `(0,1),(1,1),(2,1),(3,1)`.
  - **O**: 2×2 in upper-left of a 3×3 box → cells `(1,0),(2,0),(1,1),(2,1)`.
  - **T**: bump up (T-shape pointing up) → cells `(1,0),(0,1),(1,1),(2,1)`.
  - **S**: standard S → cells `(1,0),(2,0),(0,1),(1,1)`.
  - **Z**: standard Z → cells `(0,0),(1,0),(1,1),(2,1)`.
  - **J**: standard J → cells `(0,0),(0,1),(1,1),(2,1)`.
  - **L**: standard L → cells `(2,0),(0,1),(1,1),(2,1)`.

### SRS wall-kick tables (LOCKED)

Coordinate convention: **+y is DOWN** (screen-space). The published SRS
spec uses +y up; the tables below are the y-flipped form.

When attempting a rotation, walk the offsets in order; the first that
produces a non-colliding placement wins. If none succeed, the rotation is
rejected.

**KICKS_JLSTZ** (used by J, L, S, T, Z):

```
"0->1": [(0,0), (-1,0), (-1, 1), (0,-2), (-1,-2)]
"1->0": [(0,0), ( 1,0), ( 1,-1), (0, 2), ( 1, 2)]
"1->2": [(0,0), ( 1,0), ( 1,-1), (0, 2), ( 1, 2)]
"2->1": [(0,0), (-1,0), (-1, 1), (0,-2), (-1,-2)]
"2->3": [(0,0), ( 1,0), ( 1, 1), (0,-2), ( 1,-2)]
"3->2": [(0,0), (-1,0), (-1,-1), (0, 2), (-1, 2)]
"3->0": [(0,0), (-1,0), (-1,-1), (0, 2), (-1, 2)]
"0->3": [(0,0), ( 1,0), ( 1, 1), (0,-2), ( 1,-2)]
```

**KICKS_I** (used by I-piece):

```
"0->1": [(0,0), (-2,0), ( 1,0), (-2,-1), ( 1, 2)]
"1->0": [(0,0), ( 2,0), (-1,0), ( 2, 1), (-1,-2)]
"1->2": [(0,0), (-1,0), ( 2,0), (-1, 2), ( 2,-1)]
"2->1": [(0,0), ( 1,0), (-2,0), ( 1,-2), (-2, 1)]
"2->3": [(0,0), ( 2,0), (-1,0), ( 2, 1), (-1,-2)]
"3->2": [(0,0), (-2,0), ( 1,0), (-2,-1), ( 1, 2)]
"3->0": [(0,0), ( 1,0), (-2,0), ( 1,-2), (-2, 1)]
"0->3": [(0,0), (-1,0), ( 2,0), (-1, 2), ( 2,-1)]
```

**O-piece**: returns the single offset `[(0,0)]` for every transition.

**180° rotations**: out of scope for SRS spec; provide a no-op `[(0,0)]`
table (rotation only succeeds in free space).

### Gravity table (ms per cell drop)

Index is level. Level 0 is unused; clamp level to ≤ 20 when reading.

```
[1000, 1000, 793, 617, 472, 355, 262, 189, 134, 93,
   64,   43,  28,  18,  11,   7,   4,   3,   2,  1, 1]
```

### Lock delay

- 500 ms when piece is grounded (cannot move down).
- Each successful move/rotate while grounded resets the timer.
- Reset cap: 15 resets per piece. After 15, the piece locks regardless.
- Soft drop while grounded does NOT lock the piece; only hard drop or
  the timer expiring locks.

### DAS / ARR / soft-drop

- DAS = 167 ms (initial delay before auto-shift).
- ARR = 33 ms (auto-shift repeat rate).
- Soft drop multiplier ×20: while ↓ is held, emit one move-down per
  ~16.7 ms (≈ 1 cell per frame at 60 fps).

### 7-bag randomizer

- Maintain a "bag" of all 7 piece kinds.
- When empty, refill with a Fisher-Yates shuffle using the seeded RNG.
- `next()` removes and returns the head of the bag.
- Guarantee: in every 7 consecutive draws, all 7 kinds appear exactly once.

### RNG

- `mulberry32(seed: number) → () => number`. Deterministic, returns
  values in `[0, 1)`.
- `splitSeed(matchSeed: number) → [s1, s2]`. Two independent stream seeds:
  - `s1 = (matchSeed × 0x9E3779B1) | 0`
  - `s2 = matchSeed ^ 0xDEADBEEF`
- The match seed is shown in the HUD as `seed: 0xXXXXXXXX` (uppercase hex,
  zero-padded to 8 chars).
- Parse `?seed=0xXXXXXXXX` from the URL on boot; if absent, use
  `Date.now() | 0` as the match seed.

### Scoring (Tetris guideline)

| Action              | Base score |
|---------------------|------------|
| Single              | 100        |
| Double              | 300        |
| Triple              | 500        |
| Tetris              | 800        |
| T-Spin Mini Zero    | 100        |
| T-Spin Mini Single  | 200        |
| T-Spin Zero         | 400        |
| T-Spin Single       | 800        |
| T-Spin Double       | 1200       |
| T-Spin Triple       | 1600       |

- Multiply base score by current level.
- B2B multiplier: ×1.5 when previous AND current clear are both B2B-eligible
  (Tetris OR T-Spin with lines).
- Combo bonus: `50 × combo × level`, where combo is the chain length AFTER
  the current clear (combo=0 for the first clear in a streak; combo=1 for
  the second; etc.).
- Soft drop: +1 point per cell descended.
- Hard drop: +2 points per cell descended.
- Perfect clear (entire visible playfield empty after clear): +1500 points
  AND +10 garbage lines.
- Level: starts at 1; advances every 10 lines cleared (`level = max(1, floor(lines/10) + 1)`).

### Garbage send table

| Clear kind          | Lines sent |
|---------------------|------------|
| Single              | 0          |
| Double              | 1          |
| Triple              | 2          |
| Tetris              | 4          |
| T-Spin Mini *       | 0          |
| T-Spin Zero         | 0          |
| T-Spin Single       | 2          |
| T-Spin Double       | 4          |
| T-Spin Triple       | 6          |

Bonuses:
- B2B Tetris or B2B T-Spin (with lines): +1 line.
- Combo bonus per chain index (0-based after first clear):
  `[0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, ...]`
- Perfect clear: +10 lines.

### Garbage cancellation + materialization

- Each side has a FIFO queue of pending incoming garbage events.
- When a player clears lines:
  1. Compute outgoing send.
  2. **First** cancel against own pending incoming (FIFO, decrement head;
     if head's `rows` reaches 0, shift it).
  3. The surplus (after cancellation) is sent to the opponent's incoming
     queue as a single event with shared `holeCol`.
- Garbage materializes onto your board ONLY on a non-clearing lock. A
  clearing lock does NOT materialize incoming.
- Each garbage event uses ONE random hole column, shared by all rows in
  that event.

### T-Spin detection (3-corner rule)

- Triggered only at lock time, only for T-pieces, only if the last
  successful action was a rotation.
- The T-piece's pivot is at offset `(1, 1)` within its 3×3 bounding box
  (every rotation).
- Check the 4 cells diagonally adjacent to the pivot: `(px-1, py-1)`,
  `(px+1, py-1)`, `(px-1, py+1)`, `(px+1, py+1)`. Out-of-bounds counts as
  filled (a wall).
- Need ≥3 of those 4 corners filled for any T-spin.
- "Front corners" depend on rotation:
  - rot 0 (bump up): top two corners
  - rot 1 (bump right): right two corners
  - rot 2 (bump down): bottom two corners
  - rot 3 (bump left): left two corners
- Mini iff the two front corners are NOT both filled.
- **Exception**: a rotation that succeeded via kick index 4 (the 5th, last
  test in the kick table) is always classified as a normal (not Mini)
  T-spin, even if only one front corner is filled.

### Top-out

A side tops out (loses) when ANY of:
1. A newly-spawned piece's cells overlap existing filled cells.
2. A piece locks entirely above the visible playfield (every cell at
   `y < 20`).

---

## 4 · UX spec

### Controls

- ← / →   move left / right
- ↓        soft drop (held)
- ↑ / X   rotate CW
- Z        rotate CCW
- A        rotate 180° (modern guideline extension; can also be a no-op)
- Space    hard drop
- C / Shift  hold piece
- P / Esc  pause / resume
- ?        toggle controls overlay
- R        rematch on result screen (same seed)
- T        return to title (new seed)
- Enter    start match from title
- S        reroll seed from title

### Screen state machine

```
title → countdown → playing ⇄ paused
                       ↓
                    result → (R: rematch) | (T: title)
```

### Title screen

- Dim overlay on both boards.
- "TETRIS BATTLE" logo centered on player canvas.
- "press ENTER to fight"
- "S = new seed   ? = controls"
- Display current seed `seed: 0xXXXXXXXX`.
- "CPU is ready." dim text on CPU canvas.

### Countdown

- Total duration 2800 ms.
- Phases of 700 ms each: "3", "2", "1", "GO!".
- Each phase: scale up from 0.8x to 1.0x, fade alpha 0.4 → 1.0.
- Display centered on both canvases simultaneously.

### Result screen

- Dim overlay on both boards.
- Loser's board: large red "K.O." + (if loser is the player) "YOU LOSE",
  (if loser is the CPU) the OTHER board says "YOU WIN" in green.
- Stats below: "score N", "lines N • level N".
- "R = rematch    T = title".

### Pause

- Dim overlay on both boards, large "PAUSED" text + "press P to resume".

### Controls overlay

- Toggle with `?`. Lists all key bindings on the player canvas.

---

## 5 · Polish spec

### Particles (line-clear bursts)

- 8 particles per cleared cell.
- Initial position: cell center.
- Initial velocity: random in `(-0.25, 0.25)` px/ms horizontal,
  `(-0.6, 0)` px/ms vertical (upward bias).
- Gravity: `0.0006` px / ms² applied to vertical velocity.
- Lifetime: 600 ms.
- Drawn with `globalCompositeOperation = "lighter"` (additive).
- Color: piece color of the cleared cell (or accent color as fallback).

### Screen shake

- Per side. Each event has amplitude (px) + duration (ms).
- Tetris: 6 px / 200 ms.
- T-Spin Double or Triple: 8 px / 250 ms.
- Perfect Clear: 12 px / 250 ms.
- KO: 16 px / 500 ms.
- Implementation: each frame, summing all active shakes' contributions
  with linearly decaying amplitude (`amp × ttlMs/initialMs`).

### Garbage warning flash

- When incoming ≥ 4, the bottom 4 rows of the receiving board pulse red.
- Pulse: ~4 Hz sine.
- Implementation: overlay a translucent red rectangle on the bottom 4
  rows with alpha varying `0.15 → 0.40` per pulse.

### KO splash

- 200 ms (first 25% of 500 ms total): white flash overlay on the loser's
  board, alpha decreasing.
- Full 500 ms: large "K.O." text scales from 0.4× to 1.0× over the
  duration. Color red (#ef4444).

### Responsive layout

- At viewport width < 1024 px, the three columns (player / center HUD /
  CPU) stack vertically (CSS only). Player on top.

### Color palette (LOCKED)

```
:root {
  --bg:          #0b0d12;
  --bg-board:    #07090d;
  --bg-panel:    #11141b;
  --grid:        #1a1f2b;
  --fg:          #e7ecf3;
  --fg-dim:      #8a93a4;
  --accent:      #6ee7ff;
  --warn:        #ef4444;
  --ok:          #22c55e;

  --piece-i:     #22d3ee;
  --piece-o:     #eab308;
  --piece-t:     #a855f7;
  --piece-s:     #22c55e;
  --piece-z:     #ef4444;
  --piece-j:     #3b82f6;
  --piece-l:     #f97316;
}
```

Cell size: 28 px. Board canvas: 280 × 560 px.

---

## 6 · AI spec — Dellacherie heuristic

### Weights (LOCKED)

```
aggregateHeight: -0.510066
completeLines:   +0.760666
holes:           -0.35663
bumpiness:       -0.184483
```

### Algorithm

`bestPlacement(board, piece) → { rot, x, score } | null`:

1. For each `rot` in `0..3`:
   - For each `x` in `-2..BOARD_COLS` (=`-2..10`):
     - Find the topmost legal `y` for the piece at `(rot, x)` by sliding
       down from `y=0` until non-colliding.
     - Hard-drop the piece via `dropDistance` to its settled position.
     - Skip if the settled position is invalid (collision).
     - Simulate: `merged = merge(board, settled); cleared = clearLines(merged)`.
     - Compute features on `cleared.board`:
       - `aggregateHeight = sum of column heights`
       - `holes = empty cells with at least one filled cell above in same column`
       - `bumpiness = sum of |height[i] − height[i+1]|`
     - `score = WEIGHT_AGGREGATE_HEIGHT × aggH + WEIGHT_COMPLETE_LINES × cleared.cleared + WEIGHT_HOLES × holes + WEIGHT_BUMPINESS × bumpiness`
     - Track best by score; tiebreak: lower `x` first.
2. Return the best `{ rot, x, score }` or `null` if no legal placement.

### Cadence

`aiCadenceMs(level) = max(300, 1200 − 60 × min(level, 15))` ms.

The AI driver maintains a countdown; on cadence tick, calls
`bestPlacement`, then `gameState.placeAndDrop(rot, x)`. The AI does NOT
use hold for MVP.

`placeAndDrop(rot, x)` on `GameState`:
1. If no active piece, return false.
2. Construct `piece = { kind: active.kind, rot, x, y: 0 }`.
3. Slide `y` down from 0 until non-colliding (or fail past `BOARD_ROWS`).
4. Set the active piece to that position; `lastWasRotate = false`.
5. Hard-drop the piece (which locks it).

---

## 7 · Determinism spec

- All randomness goes through `mulberry32`.
- One match seed → `splitSeed` → two independent streams (one per side).
- Each side's `GameState` constructor takes its split seed, builds its
  own RNG and 7-bag.
- Garbage hole column is selected from a separate per-Battle counter PRNG
  (a small linear congruential generator), so it doesn't perturb piece
  randomness.
- `?seed=0xXXXXXXXX` URL parameter overrides `Date.now()`.
- Same seed + same input sequence → identical run.

---

## 8 · Test spec (Vitest)

Implement these named test files, each containing the minimum cases listed.
Names matter — graders may check by file name.

### `tests/board.test.ts`
- `createBoard()` returns 40×10 zero grid.
- `collides()` rejects out-of-bounds, accepts buffer-row overflow.
- `merge()` is non-mutating and stamps cells correctly.
- `clearLines()` with 4 full rows returns `cleared=4` and clears them.
- `clearLines()` with no full rows returns the original board reference.
- `clearLines()` flags `perfectClear: true` when board is empty after.
- `addGarbage()` inserts N rows at bottom with shared hole column.

### `tests/piece.test.ts`
- `tryRotate()` rotates open T-piece with `kickIndex=0`.
- `tryRotate()` returns null when no kick succeeds.
- `dropDistance()` on empty board is `(BOARD_ROWS - 1 - bottomY)`.
- `dropDistance()` on board with a stack respects existing cells.
- `movePiece()` is non-mutating and offsets correctly.

### `tests/kicks.test.ts`
- `KICKS_JLSTZ` has 5 offsets for each of the 8 quarter-turn transitions.
- `KICKS_I` has 5 offsets for each of the 8 quarter-turn transitions.
- First offset of every quarter-turn entry is `[0, 0]`.
- O-piece kick is `[[0, 0]]`.
- I-piece in a 4-wide well rotates from horizontal to vertical via the
  `(-2, -1)` kick (kick index 3).

### `tests/rng.test.ts`
- `mulberry32(seed)` produces identical first 100 outputs for same seed.
- Output range is `[0, 1)`.
- 7-bag yields all 7 kinds in any 7 consecutive draws.
- Two streams from same match seed (via `splitSeed`) produce different
  first-7 sequences.

### `tests/scoring.test.ts`
- Single at level 1 → 100 points, 0 garbage.
- Tetris at level 1 → 800 points, 4 garbage.
- B2B Tetris at level 1 → 1200 points (×1.5), 5 garbage (+1 B2B).
- T-Spin Double at level 1 → 1200 points, 4 garbage.
- Combo of 5 at level 3 → +750 combo bonus.
- Perfect Clear adds +1500 points and +10 garbage.

### `tests/tspin.test.ts`
- Returns `null` when last action wasn't rotation.
- Returns `null` for non-T pieces.
- Canonical T-Spin Double setup → returns `'normal'`.
- Mini setup (only one front corner filled but 3 corners total) → `'mini'`.
- Kick index 4 promotes Mini to `'normal'`.
- Out-of-bounds counts as a filled corner.
- Returns `null` with fewer than 3 corners filled.

### `tests/ai.test.ts`
- `bestPlacement()` returns non-null on empty board for an I-piece.
- AI prefers placements that complete lines.
- AI avoids creating new holes when alternatives exist.

---

## 9 · Common Failure Modes To Avoid

These are the failure modes seen most often in early LLM runs. Each one
is graded explicitly. Your implementation MUST NOT exhibit any of them.

1. **Rotation without kicks** — implementing rotation as "test base
   position; if collide, fail" with no kick walk. Symptom: T-spins
   impossible; rotation against walls fails silently.

2. **No lock delay** — piece locks the moment it touches the floor or
   stack. Symptom: feels brutal; T-spins impossible since you can't
   rotate-into-place without it instantly locking.

3. **Infinite lock delay** — no reset cap, so a player can stall by
   spamming move/rotate. Symptom: game can be paused indefinitely.

4. **`Math.random() % 7` instead of 7-bag** — visible piece droughts in
   the next-5 preview; same kind appears 3-4 times in a row. Easy to
   detect by inspection.

5. **T-spin only as Double** — TSM, TSS, TST all missing; B2B chain
   broken. Implement all 4 categories.

6. **Garbage doesn't cancel incoming** — outgoing always sent, incoming
   always accumulates. Defensive play impossible.

7. **AI does not rotate** — only chooses `x`. Symptom: CPU never uses
   I-piece vertical or T-piece variations; plays poorly.

8. **Ghost at floor regardless of column collisions** — ghost ignores
   the existing stack. Symptom: ghost is misleading.

9. **Level doesn't speed up gravity** — same drop speed at level 1 and
   level 10. Wire the gravity table to `level` correctly.

10. **B2B persists through any line clear** — should reset on
    Single/Double/Triple non-T-spin; should be preserved (not extended)
    by T-spins without lines.

11. **Hold reusable per piece** — the `holdUsed` flag must lock until
    the next lock event.

12. **No top-out check on spawn** — the game continues with overlapping
    pieces. Both spawn-overlap AND lock-entirely-in-buffer must trigger
    top-out.

13. **Garbage holes per-row random** — looks chaotic. Each garbage
    EVENT shares one hole column.

14. **DAS/ARR not implemented** — keys repeat at the OS auto-repeat rate
    (typically way too slow). Implement the 167 ms / 33 ms timing.

15. **Hard drop awards 1 point per cell** — should be 2.

16. **Spawning the wrong rotation** — e.g. T spawns with bump down
    instead of bump up. Breaks all kick-table assumptions.

17. **Soft drop locks the piece** — only hard drop or lock-delay timeout
    locks; soft drop just descends.

18. **CPU and player share the same RNG** — both boards see the same
    pieces in the same order. Use `splitSeed`.

19. **Toasts on every lock instead of every clear** — visual noise.
    Toasts only fire on `LinesCleared` events with non-zero score tags.

20. **Garbage materializes during a clearing lock** — should defer to
    the NEXT non-clearing lock.

21. **Calling Loop.start() before listeners attach** — race conditions
    on first frame. Bootstrap should be: build state → mount HUD →
    attach Keyboard → start Loop.

22. **Per-frame `getComputedStyle` calls in render** — thrashes the
    layout. Mirror CSS color values into TS constants.

23. **Iterating Map/Set without clearing in tight loops** — GC churn.
    Reuse arrays where you can.

24. **Drawing the buffer rows** — the buffer above the visible
    playfield must NOT be visible on the canvas. Skip cells with `y < 20`
    in the renderer.

25. **AI placement that doesn't update `lastWasRotate`** — the AI's hard
    drops can incorrectly trigger T-spin detection on the CPU's locks
    if `lastWasRotate` is left stale. Reset `lastWasRotate = false`
    whenever the AI sets the piece directly.

---

## 10 · Acceptance checklist

Copy from README §6. Every item must pass:

- [ ] Boot opens dual-canvas page with seed visible in HUD.
- [ ] `?seed=0xCAFEBABE` produces deterministic pieces.
- [ ] All 7 pieces rotate via SRS kick tables (I uses I-table; JLSTZ uses
      shared table; O is no-op).
- [ ] I-piece in 4-wide well rotates to vertical via kick index 3.
- [ ] Lock delay is 500 ms with 15-move reset cap.
- [ ] DAS=167 / ARR=33; soft drop fast.
- [ ] Hard drop: +2/cell; hold: one swap per piece; ghost respects
      column collisions.
- [ ] Single 100, Tetris 800, B2B Tetris 1200, T-Spin Double 1200.
- [ ] Combo bonus = 50 × combo × level.
- [ ] T-Spin detection: all 4 categories; kick-index-4 → normal; non-T
      pieces → null; non-rotation locks → null.
- [ ] Level advances every 10 lines; gravity speeds up.
- [ ] Top-out on spawn-collision OR lock-entirely-in-buffer.
- [ ] CPU plays autonomously, evaluates rotation AND column.
- [ ] Garbage send table per spec; B2B +1; combo bonus per chain;
      perfect clear +10.
- [ ] Garbage cancels incoming FIFO; surplus to opponent; hole column
      per event.
- [ ] Garbage materializes on next non-clearing lock.
- [ ] When incoming ≥ 4, bottom 4 rows pulse red.
- [ ] KO triggers white flash + scaling K.O. text + 16 px shake.
- [ ] Title → countdown → playing → result → rematch flow works.
- [ ] R rematches with same seed; T returns to title with new seed.
- [ ] P / Esc pauses; ? toggles controls overlay.
- [ ] Particles burst on line clears (additive blending).
- [ ] Per-side screen shake on Tetris (6 px), T-Spin DT (8 px), KO (16 px).
- [ ] At < 1024 px viewport, boards stack vertically.
- [ ] `npm run build` runs `tsc --noEmit && vite build`, both clean.
- [ ] `npm test` passes all named test files.
- [ ] Bundle size: dist/assets/index-*.js < 35 kB.
- [ ] No runtime deps beyond what's in `package.json`.

If every box is checked, the LLM has reproduced the reference build.

---

## 11 · Hand-off note for the implementing agent

Build incrementally: scaffold first, then engine primitives + tests
(board / piece / kicks / rng), then game state + scoring + tspin, then
input + HUD + render, then AI + Battle + match flow + polish + docs.
Run `npm test` and `npm run build` between major increments. Do not skip
any checklist item — the spec is exhaustive on purpose.

End of master prompt.
