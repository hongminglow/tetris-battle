/**
 * T-Spin detection by 3-corner rule.
 *
 *   The T-piece has a "pivot" cell at the center of its 3×3 bounding box.
 *   The 4 diagonal corners of that pivot are checked. If at least 3 are
 *   filled (or out-of-bounds, treated as walls), the lock is a T-Spin.
 *
 *   It is a "Mini" T-spin iff only one of the two FRONT corners is filled
 *   (front = the two corners on the side of the T's bump). EXCEPTION: a
 *   T-spin via kick index 4 (the deep [-1,2]/[+1,2] kick in JLSTZ table)
 *   is always a normal (not Mini) T-spin.
 *
 * Touched in: Task 7.
 */

import type { Board } from "./board";
import { BOARD_COLS, BOARD_ROWS } from "./types";
import type { Piece, Rotation } from "./types";

/** Returns null, 'mini', or 'normal' based on lock conditions. */
export function detectTSpin(args: {
  board: Board;
  piece: Piece;
  /** Was the last action a rotation? T-spin requires last action = rotate. */
  lastWasRotate: boolean;
  /** Kick index used by the most recent successful rotation. */
  lastKickIndex: number;
}): null | "mini" | "normal" {
  const { board, piece, lastWasRotate, lastKickIndex } = args;
  if (!lastWasRotate) return null;
  if (piece.kind !== "T") return null;

  // Pivot is at offset (1, 1) within the T's 3×3 bounding box for ALL rotations.
  const px = piece.x + 1;
  const py = piece.y + 1;

  // The 4 corners around the pivot.
  const corners: Array<[number, number]> = [
    [px - 1, py - 1],
    [px + 1, py - 1],
    [px - 1, py + 1],
    [px + 1, py + 1],
  ];

  const filled: boolean[] = corners.map(([x, y]) => isFilled(board, x, y));
  const filledCount = filled.filter(Boolean).length;
  if (filledCount < 3) return null;

  // Determine front corners (depend on rotation).
  // rot 0: bump-up    → front corners are top two   (filled[0], filled[1])
  // rot 1: bump-right → front corners are right two (filled[1], filled[3])
  // rot 2: bump-down  → front corners are bottom    (filled[2], filled[3])
  // rot 3: bump-left  → front corners are left two  (filled[0], filled[2])
  const f1 = frontCorners(piece.rot, filled);

  // The "Mini" exception: kick index 4 is always full T-spin.
  if (lastKickIndex === 4) return "normal";

  return f1 ? "normal" : "mini";
}

function frontCorners(rot: Rotation, filled: boolean[]): boolean {
  const get = (i: number): boolean => filled[i] ?? false;
  switch (rot) {
    case 0:
      return get(0) && get(1);
    case 1:
      return get(1) && get(3);
    case 2:
      return get(2) && get(3);
    case 3:
      return get(0) && get(2);
  }
}

/** True if the cell is out of bounds or holds any non-empty value. */
function isFilled(board: Board, x: number, y: number): boolean {
  if (x < 0 || x >= BOARD_COLS) return true;
  if (y < 0 || y >= BOARD_ROWS) return true;
  const row = board[y];
  if (row === undefined) return true;
  return row[x] !== 0 && row[x] !== undefined;
}
