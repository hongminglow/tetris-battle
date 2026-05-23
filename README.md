# 🎮 Tetris Battle — 1 Human vs Heuristic AI

> A guideline-faithful, browser-based Tetris Battle MVP (1 player vs CPU,
> side-by-side boards with garbage exchange, KO win condition).
> Built with **TypeScript 5**, **Vite 6**, and **Canvas2D** — *zero* UI
> framework, *zero* game engine, *zero* CSS framework.

This repo serves **two purposes simultaneously**:

1. **The Tetris Battle game** — a real, playable, polished MVP with modern
   guideline rules: SRS rotation + full wall-kick tables, 7-bag randomizer,
   hold piece, ghost piece, lock delay (with reset cap), DAS/ARR keyboard,
   T-spin / B2B / combo scoring, garbage send + cancellation, and a Dellacherie
   AI opponent.

2. **An LLM benchmark artifact** — the *real* primary deliverable here is the
   master prompt at [`TETRIS_BATTLE_MASTER_PROMPT.md`](./TETRIS_BATTLE_MASTER_PROMPT.md).
   It is designed so that any sufficiently capable LLM coding agent can
   reproduce this entire build from scratch with a single prompt.

---

## 1 · The benchmark idea

Most LLM coding evals are tiny, isolated tasks ("fix this bug", "write this
function"). They tell you very little about how an agent performs on a
**real, multi-day, full-stack-front-end build** that requires:

- Reading a long, opinionated spec end-to-end
- Setting up tooling correctly (Vite + TS strict, no framework crutches)
- Implementing well-documented but non-trivial algorithms (SRS kicks, T-spin
  3-corner rule, Dellacherie heuristic, B2B/combo scoring)
- Following dozens of *quantitative* guideline requirements (lock delay 500 ms
  with 15-move cap, DAS 167 ms / ARR 33 ms, scoring tables, AI weights)
- Producing code that builds, runs, and behaves correctly in a real browser

`TETRIS_BATTLE_MASTER_PROMPT.md` is the test. **This repository is a reference
solution.** When a new LLM is released, you can:

```
1. Hand the LLM only TETRIS_BATTLE_MASTER_PROMPT.md.
2. Let it scaffold and build into an empty directory.
3. Open the result in a browser and compare to this reference build.
```

The prompt deliberately lists the **most common failure modes** (rotations
without kicks, no lock delay, `Math.random() % 7` instead of 7-bag, T-spin
detection that misses Mini/Single/Triple, garbage that never cancels, AI
that doesn't rotate, etc.) so you can grade objectively.

---

## 2 · The Tetris Battle game

Side-by-side 10×20 playfields. Human plays the left board with the keyboard;
the CPU plays the right board autonomously using a Dellacherie heuristic.
Line clears generate **garbage lines** sent to the opponent, with FIFO
cancellation against your own incoming queue. First top-out loses.

| Section            | Highlights |
|--------------------|------------|
| **Title screen**    | Logo, current seed, ENTER to start, S to reroll seed, ? for controls |
| **Countdown**       | 3 → 2 → 1 → GO! at 700 ms each, scale-up + fade |
| **Player board**    | Active piece + ghost outline at landing position; toasts for line clear events |
| **CPU board**       | Driven by Dellacherie 4-feature AI; plays at level-paced cadence |
| **HUD per side**    | score, level, lines; next-5 piece preview; hold slot; incoming garbage bar |
| **Scoring**         | Single 100 / Double 300 / Triple 500 / Tetris 800; T-Spin Single 800 / Double 1200 / Triple 1600 / Mini 100; B2B ×1.5; combo 50×combo×level; perfect clear +1500 |
| **Garbage exchange**| Send table per guideline; FIFO cancel against own incoming; surplus sent to opponent; materializes on next non-clearing lock with stable hole column per event |
| **KO splash**       | Loser's board: 200 ms white flash + scaling glowing K.O. text + 16 px shake; opponent screen unchanged |
| **Polish**          | Particle bursts on line clears (8 per cell, gravity 0.0006 px/ms², 600 ms life, additive blend); per-board screen shake (Tetris 6 px, T-Spin 8 px, KO 16 px); bottom-rows red pulse when incoming ≥ 4; radial-glow backdrop, neon board frames, gradient brand wordmark |
| **Audio**           | Procedural Web Audio SFX (move / rotate / lock / hard drop / hold / single / double / triple / tetris / t-spin / perfect / countdown / GO / KO / win / garbage-warn) plus two looping chiptune BGM tracks: a cheerful C-major theme on the title/menu and a driving 132 BPM A-minor riff during matches. Zero asset files; everything synthesized at runtime via `OscillatorNode + GainNode`. **M** mutes SFX, **N** toggles music; both default ON |
| **Pause / rematch** | P/Esc pause; R rematch (same seed, deterministic replay); T return to title (new seed) |
| **Determinism**     | One 32-bit match seed → split into two independent piece streams via `splitSeed`. Visible in HUD as `seed: 0xXXXXXXXX`, overridable via `?seed=` query string |

---

## 3 · Tech stack

| Tool        | Version  | Purpose |
|-------------|----------|---------|
| Node        | 20+      | runtime |
| TypeScript  | 5.6      | language (strict + `noUncheckedIndexedAccess`) |
| Vite        | 6        | dev server + build |
| Vitest      | 2        | unit tests |
| @types/node | 20       | Node typings |

**No** UI framework. **No** game engine. **No** CSS framework. **No** audio
library. **No** other runtime deps. The entire app is plain TypeScript
modules + Canvas2D + the native Web Audio API + a single `styles.css`
(~190 lines). Every sound effect and the BGM are synthesized at runtime
via `OscillatorNode + GainNode`. The benchmark value is in seeing whether
an LLM can build a real game without leaning on familiar framework idioms
or pre-baked audio assets.

---

## 4 · Folder layout

```
tetris-battle/
├── README.md                        # this file
├── TETRIS_BATTLE_MASTER_PROMPT.md   # the benchmark prompt (LLM input)
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── public/
│   └── favicon.svg
├── src/
│   ├── main.ts                      # bootstrap + screen state machine + render loop
│   ├── styles.css
│   ├── app/
│   │   ├── App.ts
│   │   └── Loop.ts                  # fixed-timestep RAF loop (60 Hz)
│   ├── engine/                      # pure, deterministic, no-DOM
│   │   ├── types.ts                 # PieceKind, Cell, Rotation, board constants
│   │   ├── tetrominoes.ts           # SHAPES per (kind, rotation), spawn x/y
│   │   ├── kicks.ts                 # KICKS_JLSTZ + KICKS_I (full SRS tables)
│   │   ├── rng.ts                   # mulberry32 + splitSeed + 7-bag generator
│   │   ├── board.ts                 # createBoard, collides, merge, clearLines, addGarbage
│   │   ├── piece.ts                 # tryRotate (SRS kick walk), dropDistance, movePiece
│   │   ├── scoring.ts               # scoreClear (B2B ×1.5, combo, perfect clear, garbage send)
│   │   ├── tspin.ts                 # 3-corner rule with kick-index-4 normal exception
│   │   └── game.ts                  # GameState class + Action / GameEvent unions
│   ├── ai/
│   │   └── dellacherie.ts           # bestPlacement using 4-feature heuristic
│   ├── audio/
│   │   ├── synth.ts                 # SfxEngine — 17 procedural Web Audio SFX
│   │   └── bgm.ts                   # BgmPlayer + MENU_TRACK (C-major, 112 BPM) + BATTLE_TRACK (A-minor, 132 BPM)
│   ├── render/
│   │   ├── theme.ts                 # piece colors mirrored from CSS vars
│   │   ├── board-renderer.ts        # canvas draw of stack + active + ghost
│   │   ├── hud-renderer.ts          # DOM-based HUD per side
│   │   ├── particles.ts             # ParticleField for line-clear bursts
│   │   └── shake.ts                 # ShakeBuffer helper
│   ├── input/
│   │   └── keyboard.ts              # DAS=167 ms / ARR=33 ms keyboard
│   └── match/
│       ├── Battle.ts                # owns 2 GameStates + garbage exchange queues
│       └── ai-driver.ts             # cadence ticker; calls bestPlacement → placeAndDrop
└── tests/
    ├── ai.test.ts
    ├── board.test.ts
    ├── kicks.test.ts
    ├── piece.test.ts
    ├── rng.test.ts
    ├── scoring.test.ts
    ├── tspin.test.ts
    └── smoke.test.ts
```

---

## 5 · Running it

```bash
cd tetris-battle
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle to dist/
npm run preview  # serve the built bundle
npm test         # vitest
```

Reference build size:

```
dist/index.html               1.80 kB │ gzip:  0.75 kB
dist/assets/index-*.css       2.66 kB │ gzip:  1.15 kB
dist/assets/index-*.js       39.32 kB │ gzip: 12.80 kB
```

53 unit tests pass across 8 test files covering board, piece, kicks, RNG,
scoring, T-spin, AI heuristic, and a smoke test. Audio is intentionally
not unit-tested (it is pure side-effect on `AudioContext`, which jsdom
does not implement); it is exercised manually via the acceptance checklist.

---

## 6 · What to look for when grading an LLM's output

Use this list as your visual + behavioral checklist after a fresh agent
finishes the build. Each item is binary pass/fail.

### Boot + visual scaffold
- [ ] `npm install` then `npm run dev` opens a page with two side-by-side
      10×20 playfields labeled YOU and CPU and a center HUD showing
      `seed: 0xXXXXXXXX` and a frame counter.
- [ ] `npm run build` succeeds; `dist/` contains a working static bundle.
- [ ] Refresh with `?seed=0xCAFEBABE` displays exactly that seed in the HUD
      and produces deterministic piece sequences.

### SRS rotation + kicks
- [ ] T-piece, J-piece, L-piece, S-piece, Z-piece all rotate using the
      JLSTZ wall-kick table.
- [ ] I-piece rotates using the I wall-kick table (different offsets).
- [ ] O-piece rotation is a no-op (cells unchanged).
- [ ] Rotation against a wall succeeds via a wall-kick (not just a basic
      "if-collides-give-up" rotation).
- [ ] An I-piece in a 4-wide vertical well rotates to vertical via a
      kick-table offset of (-2, -1) or similar.

### Lock delay
- [ ] When a piece touches the floor or stack, it does NOT lock immediately.
      It waits ~500 ms.
- [ ] Successful moves/rotations during lock delay reset the timer, but ONLY
      up to 15 times — after that, the piece locks regardless.
- [ ] Soft drop while grounded does not stall lock delay forever.

### 7-bag randomizer
- [ ] Inspecting the `next-5` HUD across spawning never shows the same piece
      4 times in close succession (which `Math.random() % 7` would).
- [ ] Across any 7 consecutive pieces drawn, all 7 kinds appear exactly once.

### DAS / ARR
- [ ] Holding ← or → emits one move immediately, then waits ~167 ms (DAS),
      then auto-shifts every ~33 ms (ARR).
- [ ] Holding ↓ soft-drops at ~20× normal gravity (≈1 cell per frame).

### Hard drop + hold + ghost
- [ ] Space hard-drops the piece to its landing position and locks it
      immediately, awarding +2 points per cell descended.
- [ ] C or Shift swaps the active piece with the hold slot — but only ONCE
      per piece. The second hold attempt for the same piece is a no-op.
- [ ] A faded outline (ghost) shows where the piece would land. The ghost
      respects column collisions (it stops on top of the stack at its actual
      landing position, not always at the floor).

### Line clear + scoring
- [ ] Clearing 1 line at level 1 awards 100 points.
- [ ] Clearing 4 lines at level 1 (Tetris) awards 800 points.
- [ ] Two consecutive Tetrises in a row: the second awards 1200 points
      (×1.5 B2B multiplier) AND a "B2B" indicator persists.
- [ ] A non-Tetris non-T-spin line clear breaks the B2B chain.
- [ ] Combo bonus: 50 × combo × level points per chain step. A combo of 5 at
      level 3 contributes +750 points beyond the line score.
- [ ] Level advances every 10 lines and gravity visibly speeds up.

### T-spin detection
- [ ] T-Spin Double (canonical setup) registers as "T-SPIN DOUBLE" and
      awards 1200 × level.
- [ ] T-Spin Single registers and awards 800 × level.
- [ ] T-Spin Triple registers and awards 1600 × level.
- [ ] T-Spin Mini Single registers as "T-SPIN MINI" and awards 200 × level.
- [ ] A non-rotation lock (move-only) that happens to fill 3 corners of a T
      does NOT count as a T-spin.
- [ ] A T-spin via kick index 4 (the deep [-1,2] / [1,2] kick) is always
      classified as a normal (not Mini) T-spin even if only one front
      corner is filled.

### CPU AI (Dellacherie)
- [ ] CPU board plays autonomously after the countdown, placing pieces at
      a level-dependent cadence: roughly 1 piece per 1.2 seconds at level 1,
      ~1.05 s at level 3, ~600 ms at level 10.
- [ ] CPU evaluates BOTH rotation and column for each placement (not just
      column).
- [ ] CPU avoids creating holes when alternatives exist.
- [ ] CPU completes lines when possible.
- [ ] On the same match seed, the CPU produces the same piece sequence and
      makes the same placements every time (deterministic).

### Garbage exchange
- [ ] Clearing 2+ lines sends the opponent garbage matching the guideline
      send table (Single=0, Double=1, Triple=2, Tetris=4, T-Spin Single=2,
      Double=4, Triple=6, with B2B +1).
- [ ] Incoming garbage cancels against your own outgoing send 1-for-1
      (FIFO order).
- [ ] Garbage materializes on your next NON-clearing lock; clearing locks
      delay it.
- [ ] Garbage rises with one random hole column shared across all rows of
      the same garbage event (not per-row random).
- [ ] When incoming ≥ 4, the bottom rows of your board pulse red as a warning.

### KO + match flow
- [ ] Top-out happens when (a) a newly-spawned piece overlaps existing
      blocks, OR (b) a piece locks entirely above the visible playfield
      (row 20 or higher in the buffer).
- [ ] On top-out: that side displays a "K.O." splash with a brief white
      flash + scaling text + a screen shake.
- [ ] The match ends; result screen shows YOU WIN or CPU WINS plus stats.
- [ ] R rematch reuses the same match seed (deterministic replay).
- [ ] T returns to title with a new seed.

### Polish + audio
- [ ] Each line clear emits a particle burst.
- [ ] Tetris triggers a 6 px screen shake for 200 ms; T-Spin Double/Triple
      8 px; KO 16 px / 500 ms.
- [ ] Toasts ("TETRIS", "T-SPIN DOUBLE", "B2B", "5 COMBO") float upward
      and fade out within ~1 s.
- [ ] At viewport width < 1024 px, boards stack vertically (player on top).
- [ ] Background has a soft radial-gradient glow (cyan + purple + green).
- [ ] Boards have a glowing neon-cyan frame; the title and KO/result texts
      have neon glow shadows on the canvas.
- [ ] First keypress on the title screen resumes the AudioContext and
      subsequent SFX play.
- [ ] Hard drop, rotate, hold, lock, and each clear kind produce distinct
      SFX.
- [ ] Countdown ticks on each phase change; "GO!" plays a chord.
- [ ] KO plays a descending tone immediately. If the player won, a victory
      chord plays ~280 ms later.
- [ ] BGM plays during countdown / playing only; stops on pause / result /
      title.
- [ ] Title screen plays the cheerful menu BGM (`MENU_TRACK`) once the
      user touches any key; pressing ENTER swaps to the battle BGM.
- [ ] Returning to title via T (from result) restarts the menu BGM.
- [ ] `M` mutes SFX (kills BGM too via shared master gain). `N` toggles
      music independently. The center HUD shows `audio: SFX / MUSIC` with
      case reflecting state.
- [ ] CPU's clears / locks do NOT play SFX — only the player's do.

### Code quality
- [ ] `npm run build` runs `tsc --noEmit` first and passes with no errors.
- [ ] `npm test` runs the named test files and they all pass.
- [ ] No runtime deps beyond what's in `package.json` (vite + typescript +
      vitest + @types/node, plus their transitive deps).
- [ ] All randomness routed through one seeded RNG.

---

## 7 · Common failure modes

These are the failure modes seen most often in early LLM runs against this
prompt. The MASTER_PROMPT calls each one out explicitly with its symptom.

1. **Rotation without kicks** → T-spins are impossible; rotation against a
   wall fails silently.
2. **No lock delay** → piece slams into the stack the moment it touches.
3. **Infinite lock delay** → with no reset cap, the player can stall forever.
4. **`Math.random() % 7` instead of 7-bag** → visible piece droughts in the
   next-5 preview; same kind appears 3-4 times in a row.
5. **T-spin only as Double** → TSM, TSS, TST all missing; B2B chain broken.
6. **Garbage doesn't cancel incoming, just stacks** → defensive play is
   useless; matches end too fast.
7. **AI does not rotate, only chooses column** → CPU plays poorly; never
   uses I-piece vertical or T-piece variations.
8. **Ghost at floor regardless of column collisions** → ghost is misleading
   when the column has existing stack.
9. **Level doesn't speed up gravity** → game is the same speed at level 1
   and level 10.
10. **B2B persists through any line clear** → easy to chain; should reset
    on Single/Double/Triple non-T-spin.
11. **Hold reusable per piece** → players can swap-spam between two pieces;
    should be locked until next lock event.
12. **No top-out check on spawn** → game continues with overlapping pieces.
13. **Garbage holes per-row random** → looks chaotic; should share a hole
    column per garbage event.
14. **DAS/ARR not implemented** → keys repeat at OS rate (typically too slow,
    looks unresponsive).
15. **Hard drop awards 1 point per cell** → should be 2.
16. **Spawning the wrong rotation** → e.g. T spawns with bump down instead
    of bump up; breaks all kick-table assumptions.
17. **Soft drop locks the piece** → soft drop should NOT lock; only hard
    drop or lock-delay timeout should.
18. **CPU and player share the same RNG** → both boards see the same piece
    sequence, removing strategic surprise.
19. **Toasts/particles on every lock instead of every clear** → visual noise.
20. **Garbage materializes during a clearing lock** → garbage rises while
    lines are clearing; should defer to the NEXT non-clearing lock.

### Audio-specific (added in v1.1)

21. **Creating `AudioContext` at module load** → Chromium / Safari throw
    or auto-suspend; lazily construct on first call and resume() inside a
    user-gesture handler.
22. **Playing SFX before the AudioContext resumes** → silently swallowed.
23. **Move SFX on every ARR-repeated tick** → machine-gun while holding ←/→.
    Fire the move SFX from `keydown` only, not from drained actions.
24. **`garbageWarn` fires every frame the warning is on** → use rising-edge
    detection (incoming crosses 4) plus a 220 ms cooldown inside the SFX
    engine.
25. **CPU events triggering player SFX** → only react to events whose
    `side === "player"`. The CPU's clears and locks must be silent.
26. **BGM keeps playing on pause / result / title** → stop the player on
    those screen transitions; restart on un-pause.
27. **No mute toggle / no music toggle** → players in shared spaces need
    `M` (SFX) and `N` (BGM) to work independently.
28. **Bundled audio file (.mp3 / .wav / .ogg)** → spec forbids assets;
    every sound must be synthesized via `OscillatorNode + GainNode`.

---

## 8 · License & attribution

Reference / benchmark project. Free to use, fork, and grade LLMs against.
The Tetris brand and the official guideline rules belong to The Tetris
Company; this is an independent, hobby implementation for educational and
benchmarking purposes only.

🎮 **Made with TypeScript, Canvas2D, and a lot of careful kick-table reading.**
