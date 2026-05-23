/**
 * Tetris Battle — entrypoint.
 *
 * Wires the fixed-timestep loop to Battle (player + CPU + garbage exchange)
 * + Keyboard + HUD renderer + screen state machine + audio (SFX + BGM).
 *
 * Touched in: Task 1 (boot), Task 9 (Battle/AI), Task 10 (garbage HUD),
 * Task 11 (match shell), Task 12 (polish), polish-pass (audio + UI glow).
 */

import { Loop } from "./app/Loop";
import { type GameEvent } from "./engine/game";
import { Keyboard } from "./input/keyboard";
import { Battle, type Side } from "./match/Battle";
import { drawBoard } from "./render/board-renderer";
import { mountHud, updateHud } from "./render/hud-renderer";
import { ParticleField } from "./render/particles";
import { SfxEngine, type SfxName } from "./audio/synth";
import { BgmPlayer, BATTLE_TRACK, MENU_TRACK } from "./audio/bgm";

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
  countdownPhase: number; // 4=start, 3,2,1,0(GO)
  matchStartMs: number;
  loser: Side | null;
  timeMs: number;
  particlesPlayer: ParticleField;
  particlesCpu: ParticleField;
  koFlashMs: number;
  prevIncomingPlayer: number;
  prevIncomingCpu: number;
  resultSfxFired: boolean;
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

function sfxForClear(ev: GameEvent): SfxName | null {
  if (ev.type !== "LinesCleared") return null;
  if (ev.perfectClear) return "perfect";
  switch (ev.kind) {
    case "tetris": return "tetris";
    case "tspin-single":
    case "tspin-double":
    case "tspin-triple":
    case "tspin-mini-single":
    case "tspin-mini-zero":
    case "tspin-zero":
      return "tspin";
    case "single": return "single";
    case "double": return "double";
    case "triple": return "triple";
    default: return null;
  }
}

function bootstrap(): void {
  const playerCanvas = getRequiredCanvas("player");
  const cpuCanvas = getRequiredCanvas("cpu");
  const playerHudEl = getRequiredElement("player-hud");
  const cpuHudEl = getRequiredElement("cpu-hud");
  const seedEl = getRequiredElement("hud-seed");
  const audioStateEl = getRequiredElement("hud-audio");
  const frameEl = getRequiredElement("hud-frame");

  const playerCtx = playerCanvas.getContext("2d");
  const cpuCtx = cpuCanvas.getContext("2d");
  if (playerCtx === null || cpuCtx === null) throw new Error("Canvas2D unavailable");

  let matchSeed = readSeedFromUrl() ?? (Date.now() | 0);

  const sfx = new SfxEngine();
  const bgm = new BgmPlayer(() => sfx.destination());
  // Music defaults to enabled so the menu greets the user on first gesture.
  bgm.enabled = true;
  bgm.setTrack(MENU_TRACK);

  const app: AppState = {
    screen: "title",
    showControls: false,
    matchSeed,
    battle: new Battle(matchSeed),
    toasts: [],
    shakes: [],
    countdownMs: 0,
    countdownPhase: 0,
    matchStartMs: 0,
    loser: null,
    timeMs: 0,
    particlesPlayer: new ParticleField(),
    particlesCpu: new ParticleField(),
    koFlashMs: 0,
    prevIncomingPlayer: 0,
    prevIncomingCpu: 0,
    resultSfxFired: false,
  };

  const playerHud = mountHud(playerHudEl);
  const cpuHud = mountHud(cpuHudEl);

  function updateAudioStateLabel(): void {
    const s = sfx.enabled ? "SFX" : "sfx";
    const m = bgm.enabled ? "MUSIC" : "music";
    audioStateEl.textContent = `audio: ${s} / ${m}`;
  }
  updateAudioStateLabel();

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
    app.countdownPhase = 4;
    app.prevIncomingPlayer = 0;
    app.prevIncomingCpu = 0;
    app.resultSfxFired = false;
    app.screen = "countdown";
    sfx.play("countdown");
    bgm.setTrack(BATTLE_TRACK);
  }

  const kb = new Keyboard({
    onGesture: () => {
      sfx.resume();
      // Kick off whichever BGM track is currently selected once the
      // AudioContext has been resumed by the user gesture.
      if (bgm.enabled) bgm.start();
    },
    onSfx: (s) => {
      if (app.screen !== "playing") return;
      if (s === "softDropPress") return; // would be too noisy
      sfx.play(s);
    },
    onIntent: (intent) => {
      if (intent === "pause") {
        if (app.screen === "playing") {
          app.screen = "paused";
          bgm.stop();
        } else if (app.screen === "paused") {
          app.screen = "playing";
          if (bgm.enabled) bgm.start();
        }
      } else if (intent === "controls") {
        app.showControls = !app.showControls;
      } else if (intent === "rematch" || intent === "restart") {
        if (app.screen === "result" || app.screen === "title") {
          startMatch();
        }
      } else if (intent === "mute") {
        sfx.toggle();
        updateAudioStateLabel();
      } else if (intent === "music") {
        bgm.toggle();
        updateAudioStateLabel();
      }
    },
  });
  void kb;

  // Title-screen ENTER handler.
  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      sfx.resume();
      if (bgm.enabled) bgm.start();
      if (app.screen === "title") {
        ev.preventDefault();
        startMatch();
      }
    }
    if ((ev.key === "s" || ev.key === "S") && app.screen === "title") {
      reroll();
    }
    if ((ev.key === "t" || ev.key === "T") && app.screen === "result") {
      app.screen = "title";
      reroll();
      bgm.setTrack(MENU_TRACK);
    }
  });
  // Pointer click also counts as a gesture.
  window.addEventListener(
    "pointerdown",
    () => {
      sfx.resume();
      if (bgm.enabled) bgm.start();
    },
    { passive: true },
  );

  let frameNumber = 0;

  const update = (dtMs: number): void => {
    frameNumber++;
    app.timeMs += dtMs;
    sfx.tick(dtMs);

    if (app.screen === "countdown") {
      const before = app.countdownPhase;
      app.countdownMs -= dtMs;
      // Phases: countdownMs > 2100 → "3", > 1400 → "2", > 700 → "1", else "GO!"
      let phase = 0;
      if (app.countdownMs > 700 * 3) phase = 4;
      else if (app.countdownMs > 700 * 2) phase = 3;
      else if (app.countdownMs > 700 * 1) phase = 2;
      else if (app.countdownMs > 0) phase = 1;
      else phase = 0;
      if (phase !== before) {
        if (phase === 0) sfx.play("go");
        else if (phase < before) sfx.play("countdown");
      }
      app.countdownPhase = phase;
      if (app.countdownMs <= 0) app.screen = "playing";
      return;
    }

    if (app.screen !== "playing") return;

    const actions = kb.drain(dtMs);
    for (const a of actions) app.battle.player.apply(a);

    const events = app.battle.tick(dtMs);

    for (const { side, event } of events) {
      const text = describeEvent(event);
      if (text !== null) app.toasts.push({ side, text, ttlMs: 1100, initialMs: 1100 });
      const amt = shakeAmountFor(event);
      if (amt > 0) app.shakes.push({ side, px: amt, ttlMs: 220, initialMs: 220 });

      if (event.type === "Lock" && side === "player") {
        sfx.play("lock");
      }

      const clearSfx = sfxForClear(event);
      if (clearSfx !== null && side === "player") sfx.play(clearSfx);

      if (event.type === "LinesCleared" && event.rows.length > 0) {
        const field = side === "player" ? app.particlesPlayer : app.particlesCpu;
        const visibleRows = event.rows.map((r) => r - 20).filter((r) => r >= 0);
        field.emitClear(visibleRows, 0, "#22d3ee");
      }

      if (event.type === "TopOut") {
        app.loser = side;
        app.koFlashMs = 500;
      }
    }

    // Garbage warning rising-edge SFX (when incoming for the player crosses 4).
    const incPlayer = app.battle.incomingFor("player");
    if (incPlayer >= 4 && app.prevIncomingPlayer < 4) sfx.play("garbageWarn");
    app.prevIncomingPlayer = incPlayer;
    const incCpu = app.battle.incomingFor("cpu");
    app.prevIncomingCpu = incCpu;

    if (app.loser !== null) {
      app.screen = "result";
      app.shakes.push({ side: app.loser, px: 16, ttlMs: 500, initialMs: 500 });
      if (!app.resultSfxFired) {
        sfx.play("ko");
        if (app.loser === "cpu") {
          window.setTimeout(() => sfx.play("win"), 280);
        }
        app.resultSfxFired = true;
        bgm.setTrack(null);
      }
    }

    app.particlesPlayer.tick(dtMs);
    app.particlesCpu.tick(dtMs);
    if (app.koFlashMs > 0) app.koFlashMs -= dtMs;

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

function drawWarningFlash(
  ctx: CanvasRenderingContext2D,
  incoming: number,
  timeMs: number,
): void {
  if (incoming < 4) return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const pulse = (Math.sin(timeMs / 60) + 1) / 2;
  ctx.save();
  ctx.fillStyle = `rgba(239, 68, 68, ${0.15 + 0.25 * pulse})`;
  ctx.fillRect(0, h - 28 * 4, w, 28 * 4);
  ctx.restore();
}

function drawKoFlash(ctx: CanvasRenderingContext2D, ttlMs: number): void {
  const total = 500;
  const t = 1 - ttlMs / total;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.save();
  if (t < 0.25) {
    ctx.fillStyle = `rgba(255, 255, 255, ${(0.25 - t) * 4})`;
    ctx.fillRect(0, 0, w, h);
  }
  const scale = 0.4 + Math.min(t * 2.5, 1);
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale);
  ctx.shadowColor = "#ef4444";
  ctx.shadowBlur = 24;
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
  ctx.save();
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(110, 231, 255, 0.8)";
  ctx.shadowBlur = 8;
  for (let i = 0; i < toasts.length; i++) {
    const t = toasts[i];
    if (t === undefined) continue;
    const age = 1 - t.ttlMs / t.initialMs;
    const y = h - 40 - i * 22 - age * 26;
    ctx.fillStyle = `rgba(231, 236, 243, ${1 - age})`;
    ctx.fillText(t.text, w / 2, y);
  }
  ctx.restore();
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
  for (const ctx of [pCtx, cCtx]) dimOverlay(ctx);
  const w = pCtx.canvas.width;
  const h = pCtx.canvas.height;

  // Animated gradient sweep behind the title text.
  const sweep = (Math.sin(app.timeMs / 600) + 1) / 2;
  const grad = pCtx.createLinearGradient(0, h / 2 - 80, w, h / 2 - 20);
  grad.addColorStop(0, "#22d3ee");
  grad.addColorStop(sweep, "#a855f7");
  grad.addColorStop(1, "#22c55e");

  pCtx.save();
  pCtx.shadowColor = "rgba(110, 231, 255, 0.8)";
  pCtx.shadowBlur = 18;
  pCtx.fillStyle = grad;
  pCtx.font = "bold 28px monospace";
  pCtx.textAlign = "center";
  pCtx.fillText("TETRIS", w / 2, h / 2 - 56);
  pCtx.fillText("BATTLE", w / 2, h / 2 - 24);
  pCtx.restore();

  pCtx.font = "12px monospace";
  pCtx.textAlign = "center";
  pCtx.fillStyle = "#e7ecf3";
  pCtx.fillText("press ENTER to fight", w / 2, h / 2 + 20);
  pCtx.fillStyle = "#8a93a4";
  pCtx.fillText("S = new seed   ? = controls", w / 2, h / 2 + 40);
  pCtx.fillText("M = mute   N = music", w / 2, h / 2 + 58);
  pCtx.fillStyle = "#6ee7ff";
  pCtx.fillText(`seed: ${formatSeed(app.matchSeed)}`, w / 2, h / 2 + 86);
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
    ctx.shadowColor = label === "GO!" ? "#22c55e" : "#6ee7ff";
    ctx.shadowBlur = 20;
    ctx.fillStyle =
      label === "GO!"
        ? `rgba(34, 197, 94, ${1 - t * 0.5})`
        : `rgba(231, 236, 243, ${1 - t * 0.6})`;
    ctx.font = "bold 64px monospace";
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
  ctx.save();
  ctx.shadowColor = "rgba(110, 231, 255, 0.7)";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#e7ecf3";
  ctx.font = "bold 24px monospace";
  ctx.textAlign = "center";
  ctx.fillText("PAUSED", w / 2, h / 2);
  ctx.restore();
  ctx.font = "11px monospace";
  ctx.fillStyle = "#8a93a4";
  ctx.textAlign = "center";
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

  loserCtx.save();
  loserCtx.shadowColor = "#ef4444";
  loserCtx.shadowBlur = 20;
  loserCtx.fillStyle = "#ef4444";
  loserCtx.font = "bold 40px monospace";
  loserCtx.textAlign = "center";
  loserCtx.textBaseline = "middle";
  loserCtx.fillText("K.O.", w / 2, h / 2 - 12);
  loserCtx.restore();

  winnerCtx.save();
  winnerCtx.shadowColor = "#22c55e";
  winnerCtx.shadowBlur = 18;
  winnerCtx.fillStyle = "#22c55e";
  winnerCtx.font = "bold 26px monospace";
  winnerCtx.textAlign = "center";
  winnerCtx.textBaseline = "middle";
  winnerCtx.fillText(playerWon ? "YOU WIN" : "CPU WINS", w / 2, h / 2 - 30);
  winnerCtx.restore();

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
}

function drawControls(ctx: CanvasRenderingContext2D): void {
  dimOverlay(ctx);
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
    "M     mute SFX",
    "N     toggle music",
    "R     rematch",
    "T     title",
  ];
  ctx.fillStyle = "#e7ecf3";
  ctx.font = "12px monospace";
  ctx.textAlign = "left";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    ctx.fillText(line, 16, 28 + i * 18);
  }
}

bootstrap();
