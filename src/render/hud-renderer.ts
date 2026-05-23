/**
 * HUD renderer — DOM-based, not canvas. Updates per side: score / level /
 * lines / hold / next-5 / incoming garbage bar.
 *
 * Touched in: Task 3 (queue/hold), Task 6 (score/level/lines), Task 10
 * (incoming garbage bar).
 */

import type { GameState } from "../engine/game";
import type { PieceKind } from "../engine/types";
import { SHAPES } from "../engine/tetrominoes";
import { PIECE_COLORS } from "./theme";

export interface HudElements {
  /** Container for the side-specific HUD. */
  root: HTMLElement;
}

interface MountedHud {
  scoreEl: HTMLElement;
  levelEl: HTMLElement;
  linesEl: HTMLElement;
  holdEl: HTMLCanvasElement;
  nextEl: HTMLCanvasElement;
  garbageEl: HTMLElement;
}

const MINI_CELL = 14;
const NEXT_COUNT = 5;

export function mountHud(root: HTMLElement): MountedHud {
  root.innerHTML = "";
  root.style.display = "grid";
  root.style.gridTemplateColumns = "1fr";
  root.style.gap = "6px";

  const stat = (label: string): [HTMLElement, HTMLElement] => {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.justifyContent = "space-between";
    wrap.style.fontSize = "12px";
    const lbl = document.createElement("span");
    lbl.textContent = label;
    lbl.style.color = "var(--fg-dim)";
    const val = document.createElement("span");
    val.style.color = "var(--fg)";
    val.textContent = "0";
    wrap.append(lbl, val);
    root.append(wrap);
    return [wrap, val];
  };

  const [, scoreEl] = stat("score");
  const [, levelEl] = stat("level");
  const [, linesEl] = stat("lines");

  const holdLabel = document.createElement("div");
  holdLabel.textContent = "hold";
  holdLabel.style.fontSize = "10px";
  holdLabel.style.color = "var(--fg-dim)";
  holdLabel.style.marginTop = "4px";
  root.append(holdLabel);

  const holdEl = document.createElement("canvas");
  holdEl.width = MINI_CELL * 4;
  holdEl.height = MINI_CELL * 2;
  holdEl.style.background = "var(--bg-board)";
  holdEl.style.border = "1px solid var(--grid)";
  root.append(holdEl);

  const nextLabel = document.createElement("div");
  nextLabel.textContent = "next";
  nextLabel.style.fontSize = "10px";
  nextLabel.style.color = "var(--fg-dim)";
  nextLabel.style.marginTop = "4px";
  root.append(nextLabel);

  const nextEl = document.createElement("canvas");
  nextEl.width = MINI_CELL * 4;
  nextEl.height = MINI_CELL * 2 * NEXT_COUNT + (NEXT_COUNT - 1) * 4;
  nextEl.style.background = "var(--bg-board)";
  nextEl.style.border = "1px solid var(--grid)";
  root.append(nextEl);

  const garbageLabel = document.createElement("div");
  garbageLabel.textContent = "incoming";
  garbageLabel.style.fontSize = "10px";
  garbageLabel.style.color = "var(--fg-dim)";
  garbageLabel.style.marginTop = "4px";
  root.append(garbageLabel);

  const garbageEl = document.createElement("div");
  garbageEl.style.height = "12px";
  garbageEl.style.background = "var(--bg-board)";
  garbageEl.style.border = "1px solid var(--grid)";
  garbageEl.style.position = "relative";
  garbageEl.style.overflow = "hidden";
  root.append(garbageEl);

  return { scoreEl, levelEl, linesEl, holdEl, nextEl, garbageEl };
}

function drawMiniPiece(
  ctx: CanvasRenderingContext2D,
  kind: PieceKind,
  ox: number,
  oy: number,
): void {
  const cells = SHAPES[kind][0];
  const color = PIECE_COLORS[kind];
  // Compute bounding box for centering
  let minX = 4;
  let maxX = 0;
  let minY = 4;
  let maxY = 0;
  for (const [dx, dy] of cells) {
    if (dx < minX) minX = dx;
    if (dx > maxX) maxX = dx;
    if (dy < minY) minY = dy;
    if (dy > maxY) maxY = dy;
  }
  const w = (maxX - minX + 1) * MINI_CELL;
  const h = (maxY - minY + 1) * MINI_CELL;
  const offX = ox + (MINI_CELL * 4 - w) / 2;
  const offY = oy + (MINI_CELL * 2 - h) / 2;

  ctx.fillStyle = color;
  for (const [dx, dy] of cells) {
    const x = offX + (dx - minX) * MINI_CELL;
    const y = offY + (dy - minY) * MINI_CELL;
    ctx.fillRect(x + 1, y + 1, MINI_CELL - 2, MINI_CELL - 2);
  }
}

/** Updates the HUD from current GameState. */
export function updateHud(
  hud: MountedHud,
  gs: GameState,
  incomingGarbage: number,
  warningPulse = 1,
): void {
  hud.scoreEl.textContent = gs.score.toLocaleString();
  hud.levelEl.textContent = String(gs.level);
  hud.linesEl.textContent = String(gs.lines);

  // Hold
  const hctx = hud.holdEl.getContext("2d");
  if (hctx !== null) {
    hctx.fillStyle = "#07090d";
    hctx.fillRect(0, 0, hud.holdEl.width, hud.holdEl.height);
    if (gs.hold !== null) drawMiniPiece(hctx, gs.hold, 0, 0);
  }

  // Next
  const nctx = hud.nextEl.getContext("2d");
  if (nctx !== null) {
    nctx.fillStyle = "#07090d";
    nctx.fillRect(0, 0, hud.nextEl.width, hud.nextEl.height);
    for (let i = 0; i < Math.min(NEXT_COUNT, gs.queue.length); i++) {
      const k = gs.queue[i];
      if (k === undefined) continue;
      drawMiniPiece(nctx, k, 0, i * (MINI_CELL * 2 + 4));
    }
  }

  // Incoming garbage bar (max 20 lines worth)
  const max = 20;
  const ratio = Math.min(incomingGarbage, max) / max;
  const color = incomingGarbage >= 4 ? `rgba(239, 68, 68, ${0.6 + 0.4 * warningPulse})` : "#ef4444";
  hud.garbageEl.style.background = "var(--bg-board)";
  hud.garbageEl.innerHTML = "";
  const fill = document.createElement("div");
  fill.style.position = "absolute";
  fill.style.left = "0";
  fill.style.top = "0";
  fill.style.bottom = "0";
  fill.style.width = `${ratio * 100}%`;
  fill.style.background = color;
  hud.garbageEl.append(fill);
  const txt = document.createElement("span");
  txt.textContent = String(incomingGarbage);
  txt.style.position = "absolute";
  txt.style.left = "50%";
  txt.style.top = "50%";
  txt.style.transform = "translate(-50%, -50%)";
  txt.style.fontSize = "10px";
  txt.style.color = "var(--fg)";
  txt.style.fontFamily = "var(--font-mono)";
  hud.garbageEl.append(txt);
}
