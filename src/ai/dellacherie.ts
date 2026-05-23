/**
 * Pierre Dellacherie's 4-feature evaluation heuristic for Tetris piece
 * placement.
 *
 * Weights (locked in plan):
 *   aggregateHeight: -0.510066
 *   completeLines:   +0.760666
 *   holes:           -0.35663
 *   bumpiness:       -0.184483
 *
 * The AI enumerates every (rotation × column) hard-drop placement of the
 * current piece, scores the resulting board, and picks the highest-scoring
 * placement. Tiebreak: lower column index first.
 *
 * Touched in: Task 9.
 */

import type { Board } from "../engine/board";
import {
  BOARD_COLS,
  BOARD_ROWS,
  clearLines,
  collides,
  merge,
} from "../engine/board";
import { dropDistance, movePiece } from "../engine/piece";
import type { Piece, Rotation } from "../engine/types";

export const WEIGHT_AGGREGATE_HEIGHT = -0.510066;
export const WEIGHT_COMPLETE_LINES = 0.760666;
export const WEIGHT_HOLES = -0.35663;
export const WEIGHT_BUMPINESS = -0.184483;

export interface Placement {
  rot: Rotation;
  x: number;
  /** Heuristic score (higher is better). */
  score: number;
}

/** Computes column heights of a board. */
function columnHeights(board: Board): number[] {
  const heights = new Array<number>(BOARD_COLS).fill(0);
  for (let x = 0; x < BOARD_COLS; x++) {
    for (let y = 0; y < BOARD_ROWS; y++) {
      const row = board[y];
      if (row === undefined) continue;
      const c = row[x];
      if (c !== 0 && c !== undefined) {
        heights[x] = BOARD_ROWS - y;
        break;
      }
    }
  }
  return heights;
}

/** Counts holes (empty cells with at least one filled cell above). */
function countHoles(board: Board): number {
  let holes = 0;
  for (let x = 0; x < BOARD_COLS; x++) {
    let seen = false;
    for (let y = 0; y < BOARD_ROWS; y++) {
      const row = board[y];
      if (row === undefined) continue;
      const c = row[x];
      if (c !== 0 && c !== undefined) seen = true;
      else if (seen) holes++;
    }
  }
  return holes;
}

/** Sum of |h[i] - h[i+1]| over adjacent columns. */
function bumpiness(heights: number[]): number {
  let b = 0;
  for (let i = 0; i < heights.length - 1; i++) {
    const a = heights[i] ?? 0;
    const c = heights[i + 1] ?? 0;
    b += Math.abs(a - c);
  }
  return b;
}

/**
 * Returns the best (rot, x) placement for `piece` on `board` using the
 * Dellacherie heuristic. If no legal placement exists, returns null.
 */
export function bestPlacement(board: Board, piece: Piece): Placement | null {
  let best: Placement | null = null;

  for (let rot = 0; rot <= 3; rot++) {
    for (let x = -2; x <= BOARD_COLS; x++) {
      const candidate: Piece = { kind: piece.kind, rot: rot as Rotation, x, y: 0 };
      // Find the topmost legal y for this rot/x — slide down from the top.
      let y = 0;
      while (y < BOARD_ROWS && collides(board, { ...candidate, y })) {
        y++;
      }
      if (y >= BOARD_ROWS) continue;
      const settled = movePiece({ ...candidate, y }, 0, dropDistance(board, { ...candidate, y }));
      // Settled piece must be in legal bounds.
      if (collides(board, settled)) continue;

      // Simulate placement: merge, then clear lines.
      const merged = merge(board, settled);
      const cleared = clearLines(merged);
      const heights = columnHeights(cleared.board);
      const aggH = heights.reduce((a, b) => a + b, 0);
      const holes = countHoles(cleared.board);
      const bump = bumpiness(heights);

      const score =
        WEIGHT_AGGREGATE_HEIGHT * aggH +
        WEIGHT_COMPLETE_LINES * cleared.cleared +
        WEIGHT_HOLES * holes +
        WEIGHT_BUMPINESS * bump;

      if (best === null || score > best.score || (score === best.score && x < best.x)) {
        best = { rot: rot as Rotation, x, score };
      }
    }
  }

  return best;
}
