/**
 * Board renderer — draws the visible portion of a Board onto a canvas.
 * Stateless: pure function of (ctx, board, optional active piece).
 *
 * Touched in: Task 2 (basic cells), 5 (ghost piece), 6 (line-clear flash),
 * 12 (shake offset, garbage flash).
 */

import type { Board } from "../engine/board";
import { BOARD_COLS, BOARD_ROWS, VISIBLE_TOP } from "../engine/board";
import type { Piece } from "../engine/types";
import { shapeCells } from "../engine/tetrominoes";
import { BG_BOARD, CELL_PX, GRID_LINE, cellColor } from "./theme";

export interface DrawBoardOptions {
  /** The piece currently in play (drawn on top of the stack). */
  active?: Piece;
  /** Optional ghost piece — outline at landing position. */
  ghost?: Piece;
}

const BOARD_W = CELL_PX * BOARD_COLS;
const BOARD_H = CELL_PX * (BOARD_ROWS - VISIBLE_TOP); // visible only

/** Width/height in CSS pixels of a board canvas. */
export const BOARD_PX_W = BOARD_W;
export const BOARD_PX_H = BOARD_H;

/** Clears the canvas to the board background color. */
function clearCanvas(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = BG_BOARD;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
}

/** Draws the faint grid lines. */
function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < BOARD_COLS; c++) {
    const x = c * CELL_PX + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, BOARD_H);
  }
  for (let r = 1; r < BOARD_ROWS - VISIBLE_TOP; r++) {
    const y = r * CELL_PX + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(BOARD_W, y);
  }
  ctx.stroke();
}

/** Draws a single filled cell with a 1px inner highlight + dark border. */
function drawCell(
  ctx: CanvasRenderingContext2D,
  col: number,
  visibleRow: number,
  color: string,
  opts: { ghost?: boolean } = {},
): void {
  const x = col * CELL_PX;
  const y = visibleRow * CELL_PX;
  if (opts.ghost === true) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1.5, y + 1.5, CELL_PX - 3, CELL_PX - 3);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, CELL_PX - 2, CELL_PX - 2);
  // 2-tone bevel
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(x + 1, y + 1, CELL_PX - 2, 3);
  ctx.fillRect(x + 1, y + 1, 3, CELL_PX - 2);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(x + 1, y + CELL_PX - 4, CELL_PX - 2, 3);
  ctx.fillRect(x + CELL_PX - 4, y + 1, 3, CELL_PX - 2);
}

/** Renders the static stack on the board. Buffer rows are not drawn. */
function drawStack(ctx: CanvasRenderingContext2D, board: Board): void {
  for (let y = VISIBLE_TOP; y < BOARD_ROWS; y++) {
    const row = board[y];
    if (row === undefined) continue;
    for (let x = 0; x < BOARD_COLS; x++) {
      const c = row[x];
      if (c === undefined || c === 0) continue;
      const color = cellColor(c);
      if (color === null) continue;
      drawCell(ctx, x, y - VISIBLE_TOP, color);
    }
  }
}

/** Renders the active piece (and ghost, if provided). */
function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  opts: { ghost?: boolean } = {},
): void {
  const cells = shapeCells(piece.kind, piece.rot);
  const color = cellColor(piece.kind);
  if (color === null) return;
  for (const [dx, dy] of cells) {
    const x = piece.x + dx;
    const y = piece.y + dy;
    if (y < VISIBLE_TOP) continue; // don't draw inside buffer
    drawCell(ctx, x, y - VISIBLE_TOP, color, opts);
  }
}

/** Top-level draw entry point. */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  board: Board,
  opts: DrawBoardOptions = {},
): void {
  clearCanvas(ctx);
  drawGrid(ctx);
  drawStack(ctx, board);
  if (opts.ghost !== undefined) drawPiece(ctx, opts.ghost, { ghost: true });
  if (opts.active !== undefined) drawPiece(ctx, opts.active);
}
