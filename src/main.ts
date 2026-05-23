/**
 * Tetris Battle — entrypoint.
 *
 * Wires the fixed-timestep loop to Battle (player + CPU + garbage exchange)
 * + Keyboard + HUD renderer + screen state machine.
 *
 * Touched in: Task 1 (boot), Task 9 (Battle/AI), Task 10 (garbage HUD),
 * Task 11 (match shell), Task 12 (polish).
 */

import { Loop } from "./app/Loop";
import { type GameEvent } from "./engine/game";
import { Keyboard } from "./input/keyboard";
import { Battle, type BattleEvent, type Side } from "./match/Battle";
import { drawBoard } from "./render/board-renderer";
import { mountHud, updateHud } from "./render/hud-renderer";
import { ParticleField } from "./render/particles";

type Screen = "title" | "countdown" | "playing" | "paused" | "result";

interface Toast {
  side: Side;
  text: string;
  ttlMs: number;
  initialMs: number;
}

interface Shake {
  side: Side;
  px: number;
  ttlMs: number;
  initialMs: number;
}

interface AppState {
  screen: Screen;
  showControls: boolean;
  matchSeed: number;
  battle: Battle;
  toasts: Toast[];
  shakes: Shake[];
  countdownMs: number;
  matchStartMs: number;
  /** "player" lost | "cpu" lost (= player won) | null */
  loser: Side | null;
  /** ms since rendering started (used for pulse animations). */
  timeMs: number;
  particlesPlayer: ParticleField;
  particlesCpu: ParticleField;
  /** ms remaining on the K.O. splash flash on the loser's board. */
  koFlashMs: number;
}

function readSeedFromUrl(): number | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("seed");
  if (raw === null) return null;
  const trimmed = raw.trim();
  const parsed =
    trimmed.startsWith("0x") || trimmed.startsWith("0X")
      ? Number.parseInt(trimmed.slice(2), 16)
      : Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed | 0;
}

function formatSeed(seed: number): string {
  const unsigned = (seed >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return `0x${unsigned}`;
}

function getRequiredCanvas(id: string): HTMLCanvasElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLCanvasElement)) throw new Error(`#${id} canvas not found`);
  return el;
}

function getRequiredElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLElement)) throw new Error(`#${id} element not found`);
  return el;
}

function describeEvent(ev: GameEvent): string | null {
  if (ev.type !== "LinesCleared") return null;
  const tags: string[] = [];
  if (ev.perfectClear) tags.push("PERFECT CLEAR");
  if (ev.b2b) tags.push("B2B");
  switch (ev.kind) {
    case "tetris": tags.push("TETRIS"); break;
    case "tspin-single": tags.push("T-SPIN SINGLE"); break;
    case "tspin-double": tags.push("T-SPIN DOUBLE"); break;
    case "tspin-triple": tags.push("T-SPIN TRIPLE"); break;
    case "tspin-mini-single":
    case "tspin-mini-zero": tags.push("T-SPIN MINI"); break;
    case "tspin-zero": tags.push("T-SPIN"); break;
    default: break;
  }
  if (ev.combo > 0) tags.push(`${ev.combo} COMBO`);
  if (tags.length === 0) return null;
  return tags.join(" • ");
}

function shakeAmountFor(ev: GameEvent): number {
  if (ev.type !== "LinesCleared") return 0;
  if (ev.kind === "tetris") return 6;
  if (ev.kind === "tspin-double" || ev.kind === "tspin-triple") return 8;
  if (ev.perfectClear) return 12;
  return 0;
}

function bootstrap(): void {
  const playerCanvas = getRequiredCanvas("player");
  const cpuCanvas = getRequiredCanvas("cpu");
  const playerHudEl = getRequiredElement("player-hud");
  const cpuHudEl = getRequiredElement("cpu-hud");
  const seedEl = getRequiredElement("hud-seed");
  const frameEl = getRequiredElement("hud-frame");

  const playerCtx = playerCanvas.getContext("2d");
  const cpuCtx = cpuCanvas.getContext("2d");
  if (playerCtx === null || cpuCtx === null) throw new Error("Canvas2D unavailable");

  let matchSeed = readSeedFromUrl() ?? (Date.now() | 0);

  const app: AppState = {
    screen: "title",
    showControls: false,
    matchSeed,
    battle: new Battle(matchSeed),
    toasts: [],
    shakes: [],
    countdownMs: 0,
    matchStartMs: 0,
    loser: null,
    timeMs: 0,
    particlesPlayer: new ParticleField(),
    particlesCpu: new ParticleField(),
    koFlashMs: 0,
  };

  const playerHud = mountHud(playerHudEl);
  const cpuHud = mountHud(cpuHudEl);

  function reroll(): void {
    matchSeed = Date.now() | 0;
    app.matchSeed = matchSeed;
    app.battle = new Battle(matchSeed);
  }

  function startMatch(): void {
    app.battle.rematch();
    app.toasts = [];
    app.shakes = [];
    app.particlesPlayer.clear();
    app.particlesCpu.clear();
    app.koFlashMs = 0;
    app.loser = null;
    app.matchStartMs = app.timeMs;
    app.countdownMs = 700 * 4; // 3, 2, 1, GO
    app.screen = "countdown";
  }

  const kb = new Keyboard({
    onIntent: (intent) => {
      if (intent === "pause") {
        if (app.screen === "playing") app.screen = "paused";
        else if (app.screen === "paused") app.screen = "playing";
      } else if (intent === "controls") {
        app.showControls = !app.showControls;
      } else if (intent === "rematch" || intent === "restart") {
        if (app.screen === "result" || app.screen === "title") {
          startMatch();
        }
      }
    },
  });

  // Title-screen ENTER handler (cannot easily go through Keyboard since it's
  // not an in-game action).
  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && app.screen === "title") {
      ev.preventDefault();
      startMatch();
    }
    if ((ev.key === "s" || ev.key === "S") && app.screen === "title") {
      reroll();
    }
    if ((ev.key === "t" || ev.key === "T") && app.screen === "result") {
      app.screen = "title";
      reroll();
    }
  });

  let frameNumber = 0;

  const update = (dtMs: number): void => {
    frameNumber++;
    app.timeMs += dtMs;

    // Countdown phase
    if (app.screen === "countdown") {
      app.countdownMs -= dtMs;
      if (app.countdownMs <= 0) {
        app.screen = "playing";
      }
      return;
    }

    if (app.screen !== "playing") return;

    // Drain inputs + apply to player.
    const actions = kb.drain(dtMs);
    for (const a of actions) app.battle.player.apply(a);

    // Tick the battle (advances both states + AI).
    const events = app.battle.tick(dtMs);

    // Translate events into toasts and shakes.
    for (const { side, event } of events) {
      const text = describeEvent(event);
      if (text !== null) app.toasts.push({ side, text, ttlMs: 1100, initialMs: 1100 });
      const amt = shakeAmountFor(event);
      if (amt > 0) app.shakes.push({ side, px: amt, ttlMs: 220, initialMs: 220 });

      // Particle emit on line clears
      if (event.type === "LinesCleared" && event.rows.length > 0) {
        const field = side === "player" ? app.particlesPlayer : app.particlesCpu;
        // Translate row indices from board space (20 buffer + 20 visible) to
        // canvas-visible row indices (subtract VISIBLE_TOP=20).
        const visibleRows = event.rows.map((r) => r - 20).filter((r) => r >= 0);
        field.emitClear(visibleRows, 0, "#22d3ee");
      }

      if (event.type === "TopOut") {
        app.loser = side;
        app.koFlashMs = 500;
      }
    }

    if (app.loser !== null) {
      app.screen = "result";
      app.shakes.push({ side: app.loser === "player" ? "player" : "cpu", px: 16, ttlMs: 500, initialMs: 500 });
    }

    // Tick particle fields
    app.particlesPlayer.tick(dtMs);
    app.particlesCpu.tick(dtMs);
    if (app.koFlashMs > 0) app.koFlashMs -= dtMs;

    // Decay toasts + shakes
    app.toasts = app.toasts
      .map((t) => ({ ...t, ttlMs: t.ttlMs - dtMs }))
      .filter((t) => t.ttlMs > 0);
    app.shakes = app.shakes
      .map((s) => ({ ...s, ttlMs: s.ttlMs - dtMs }))
      .filter((s) => s.ttlMs > 0);
  };

  const render = (_alpha: number): void => {
    seedEl.textContent = `seed: ${formatSeed(app.matchSeed)}`;

    const playerShakeOffset = computeShake(app, "player");
    const cpuShakeOffset = computeShake(app, "cpu");

    drawWithShake(playerCtx, playerShakeOffset, () => {
      drawBoard(playerCtx, app.battle.player.board, {
        active: app.battle.player.active ?? undefined,
        ghost: app.battle.player.ghost() ?? undefined,
      });
      drawWarningFlash(playerCtx, app.battle.incomingFor("player"), app.timeMs);
      app.particlesPlayer.draw(playerCtx);
      if (app.loser === "player" && app.koFlashMs > 0) drawKoFlash(playerCtx, app.koFlashMs);
    });
    drawWithShake(cpuCtx, cpuShakeOffset, () => {
      drawBoard(cpuCtx, app.battle.cpu.board, {
        active: app.battle.cpu.active ?? undefined,
      });
      drawWarningFlash(cpuCtx, app.battle.incomingFor("cpu"), app.timeMs);
      app.particlesCpu.draw(cpuCtx);
      if (app.loser === "cpu" && app.koFlashMs > 0) drawKoFlash(cpuCtx, app.koFlashMs);
    });

    const pulse = Math.sin(app.timeMs / 80) * 0.5 + 0.5;
    updateHud(playerHud, app.battle.player, app.battle.incomingFor("player"), pulse);
    updateHud(cpuHud, app.battle.cpu, app.battle.incomingFor("cpu"), pulse);

    frameEl.textContent = `frame: ${frameNumber} | ${app.screen}`;

    drawSideToasts(playerCtx, app, "player");
    drawSideToasts(cpuCtx, app, "cpu");
    drawScreenOverlays(playerCtx, cpuCtx, app);
  };

  const loop = new Loop(update, render);
  loop.start();
}

function computeShake(app: AppState, side: Side): { x: number; y: number } {
  const shakes = app.shakes.filter((s) => s.side === side);
  if (shakes.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const s of shakes) {
    const t = s.ttlMs / s.initialMs;
    const amp = s.px * t;
    x += (Math.random() * 2 - 1) * amp;
    y += (Math.random() * 2 - 1) * amp;
  }
  return { x, y };
}

function drawWithShake(
  ctx: CanvasRenderingContext2D,
  offset: { x: number; y: number },
  draw: () => void,
): void {
  ctx.save();
  ctx.translate(offset.x, offset.y);
  draw();
  ctx.restore();
}

/** Pulses a red glow on the bottom rows when incoming garbage ≥ 4. */
function drawWarningFlash(
  ctx: CanvasRenderingContext2D,
  incoming: number,
  timeMs: number,
): void {
  if (incoming < 4) return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const pulse = (Math.sin(timeMs / 60) + 1) / 2; // 0..1, 4 Hz-ish
  ctx.save();
  ctx.fillStyle = `rgba(239, 68, 68, ${0.15 + 0.25 * pulse})`;
  // Fill bottom 4 rows
  ctx.fillRect(0, h - 28 * 4, w, 28 * 4);
  ctx.restore();
}

/** Big "K.O." text scaling in over the loser's board. */
function drawKoFlash(ctx: CanvasRenderingContext2D, ttlMs: number): void {
  const total = 500;
  const t = 1 - ttlMs / total;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.save();
  // White flash at the start
  if (t < 0.25) {
    ctx.fillStyle = `rgba(255, 255, 255, ${(0.25 - t) * 4})`;
    ctx.fillRect(0, 0, w, h);
  }
  // Scaling K.O. text
  const scale = 0.4 + Math.min(t * 2.5, 1);
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 64px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("K.O.", 0, 0);
  ctx.restore();
}

function drawSideToasts(
  ctx: CanvasRenderingContext2D,
  app: AppState,
  side: Side,
): void {
  const toasts = app.toasts.filter((t) => t.side === side);
  if (toasts.length === 0) return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "center";
  for (let i = 0; i < toasts.length; i++) {
    const t = toasts[i];
    if (t === undefined) continue;
    const age = 1 - t.ttlMs / t.initialMs;
    const y = h - 40 - i * 22 - age * 26;
    ctx.fillStyle = `rgba(231, 236, 243, ${1 - age})`;
    ctx.fillText(t.text, w / 2, y);
  }
  ctx.textAlign = "left";
}

function drawScreenOverlays(
  pCtx: CanvasRenderingContext2D,
  cCtx: CanvasRenderingContext2D,
  app: AppState,
): void {
  if (app.screen === "title") {
    drawTitle(pCtx, cCtx, app);
  } else if (app.screen === "countdown") {
    drawCountdown(pCtx, cCtx, app);
  } else if (app.screen === "paused") {
    drawPaused(pCtx);
    drawPaused(cCtx);
  } else if (app.screen === "result") {
    drawResult(pCtx, cCtx, app);
  }
  if (app.showControls) {
    drawControls(pCtx);
  }
}

function dimOverlay(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(7, 9, 13, 0.78)";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function drawTitle(
  pCtx: CanvasRenderingContext2D,
  cCtx: CanvasRenderingContext2D,
  app: AppState,
): void {
  for (const ctx of [pCtx, cCtx]) {
    dimOverlay(ctx);
  }
  const w = pCtx.canvas.width;
  const h = pCtx.canvas.height;
  pCtx.fillStyle = "#e7ecf3";
  pCtx.font = "bold 22px monospace";
  pCtx.textAlign = "center";
  pCtx.fillText("TETRIS", w / 2, h / 2 - 56);
  pCtx.fillText("BATTLE", w / 2, h / 2 - 28);
  pCtx.font = "12px monospace";
  pCtx.fillStyle = "#8a93a4";
  pCtx.fillText("press ENTER to fight", w / 2, h / 2 + 20);
  pCtx.fillText("S = new seed   ? = controls", w / 2, h / 2 + 40);
  pCtx.fillText(`seed: ${formatSeed(app.matchSeed)}`, w / 2, h / 2 + 70);
  pCtx.textAlign = "left";

  cCtx.fillStyle = "#8a93a4";
  cCtx.font = "12px monospace";
  cCtx.textAlign = "center";
  cCtx.fillText("CPU is ready.", cCtx.canvas.width / 2, cCtx.canvas.height / 2);
  cCtx.textAlign = "left";
}

function drawCountdown(
  pCtx: CanvasRenderingContext2D,
  cCtx: CanvasRenderingContext2D,
  app: AppState,
): void {
  const remaining = app.countdownMs;
  // Phases: GO at 0..700, 1 at 700..1400, 2 at 1400..2100, 3 at 2100..2800
  let label = "GO!";
  if (remaining > 700 * 3) label = "3";
  else if (remaining > 700 * 2) label = "2";
  else if (remaining > 700 * 1) label = "1";

  const phaseRemaining = remaining % 700;
  const t = 1 - phaseRemaining / 700;
  const scale = 0.8 + 0.6 * (1 - t);
  for (const ctx of [pCtx, cCtx]) {
    dimOverlay(ctx);
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.fillStyle = `rgba(231, 236, 243, ${1 - t * 0.6})`;
    ctx.font = "bold 60px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, 0);
    ctx.restore();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}

function drawPaused(ctx: CanvasRenderingContext2D): void {
  dimOverlay(ctx);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = "#e7ecf3";
  ctx.font = "bold 22px monospace";
  ctx.textAlign = "center";
  ctx.fillText("PAUSED", w / 2, h / 2);
  ctx.font = "11px monospace";
  ctx.fillStyle = "#8a93a4";
  ctx.fillText("press P to resume", w / 2, h / 2 + 20);
  ctx.textAlign = "left";
}

function drawResult(
  pCtx: CanvasRenderingContext2D,
  cCtx: CanvasRenderingContext2D,
  app: AppState,
): void {
  const playerWon = app.loser === "cpu";
  const winnerCtx = playerWon ? pCtx : cCtx;
  const loserCtx = playerWon ? cCtx : pCtx;
  for (const ctx of [pCtx, cCtx]) dimOverlay(ctx);

  const w = pCtx.canvas.width;
  const h = pCtx.canvas.height;

  loserCtx.fillStyle = "#ef4444";
  loserCtx.font = "bold 36px monospace";
  loserCtx.textAlign = "center";
  loserCtx.textBaseline = "middle";
  loserCtx.fillText("K.O.", w / 2, h / 2 - 12);

  winnerCtx.fillStyle = "#22c55e";
  winnerCtx.font = "bold 24px monospace";
  winnerCtx.textAlign = "center";
  winnerCtx.textBaseline = "middle";
  winnerCtx.fillText(playerWon ? "YOU WIN" : "CPU WINS", w / 2, h / 2 - 30);

  // Stats below
  const winner = playerWon ? app.battle.player : app.battle.cpu;
  const loser = playerWon ? app.battle.cpu : app.battle.player;

  for (const [ctx, gs, label] of [
    [pCtx, app.battle.player, "YOU"] as const,
    [cCtx, app.battle.cpu, "CPU"] as const,
  ]) {
    ctx.font = "11px monospace";
    ctx.fillStyle = "#8a93a4";
    ctx.textAlign = "center";
    ctx.fillText(`${label} score ${gs.score.toLocaleString()}`, w / 2, h / 2 + 20);
    ctx.fillText(`lines ${gs.lines} • level ${gs.level}`, w / 2, h / 2 + 38);
    ctx.fillStyle = "#e7ecf3";
    ctx.fillText("R = rematch    T = title", w / 2, h / 2 + 64);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  void winner;
  void loser;
}

function drawControls(ctx: CanvasRenderingContext2D): void {
  dimOverlay(ctx);
  const w = ctx.canvas.width;
  const lines = [
    "CONTROLS",
    "",
    "← →   move",
    "↓     soft drop",
    "↑/X   rotate CW",
    "Z     rotate CCW",
    "A     rotate 180",
    "Space hard drop",
    "C/Sh  hold",
    "P/Esc pause",
    "?     toggle help",
    "R     rematch",
    "T     title",
  ];
  ctx.fillStyle = "#e7ecf3";
  ctx.font = "12px monospace";
  ctx.textAlign = "left";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    ctx.fillText(line, 16, 30 + i * 18);
  }
  void w;
}

bootstrap();
