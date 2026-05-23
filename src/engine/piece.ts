/**
 * Active piece operations — rotation with SRS kick lookup, movement helpers.
 * Touched in: Task 2.
 */

import type { Board } from "./board";
import { collides } from "./board";
import { kickOffsets } from "./kicks";
import type { Piece, Rotation, RotDir } from "./types";
import { rotateIndex } from "./types";

export interface RotateResult {
  piece: Piece;
  /** Index into the kick table that succeeded (0 = no kick, 4 = last test). */
  kickIndex: number;
}

/**
 * Attempts to rotate `piece` in direction `dir`. Walks the SRS kick table
 * for this piece kind and from→to transition, returning the first offset
 * that places the piece without collision.
 *
 * Returns `null` if no kick succeeds.
 */
export function tryRotate(
  board: Board,
  piece: Piece,
  dir: RotDir,
): RotateResult | null {
  const from: Rotation = piece.rot;
  const to: Rotation = rotateIndex(from, dir);
  if (from === to) return null;
  const offsets = kickOffsets(piece.kind, from, to);
  for (let i = 0; i < offsets.length; i++) {
    const offset = offsets[i];
    if (offset === undefined) continue;
    const [dx, dy] = offset;
    const candidate: Piece = {
      kind: piece.kind,
      rot: to,
      x: piece.x + dx,
      y: piece.y + dy,
    };
    if (!collides(board, candidate)) {
      return { piece: candidate, kickIndex: i };
    }
  }
  return null;
}

/** Returns a piece moved by (dx, dy) without bounds checking. */
export function movePiece(piece: Piece, dx: number, dy: number): Piece {
  return { kind: piece.kind, rot: piece.rot, x: piece.x + dx, y: piece.y + dy };
}

/**
 * Hard-drop distance: number of cells the piece can move down before
 * colliding. 0 means the piece is already resting.
 */
export function dropDistance(board: Board, piece: Piece): number {
  let d = 0;
  while (!collides(board, movePiece(piece, 0, d + 1))) {
    d++;
  }
  return d;
}
