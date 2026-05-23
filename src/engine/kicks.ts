/**
 * SRS wall-kick tables.
 *
 * These describe the (dx, dy) offsets to TRY in order when rotating from
 * one state to another. The first offset that does not collide is the kick
 * applied. If none succeed, the rotation is rejected.
 *
 * Coordinate convention: +y is DOWN (the original SRS spec uses +y up; the
 * tables below are flipped to match our screen-space coordinates).
 *
 * Two tables:
 *   - KICKS_JLSTZ: shared by J, L, S, T, Z
 *   - KICKS_I:     unique to I
 *
 * O-piece does not rotate (returns a single [0,0] no-op).
 *
 * Touched in: Task 2.
 */

import type { CellOffset, PieceKind, Rotation } from "./types";

type Transition =
  | "0->1" | "1->0"
  | "1->2" | "2->1"
  | "2->3" | "3->2"
  | "3->0" | "0->3"
  | "0->2" | "2->0"
  | "1->3" | "3->1";
type KickTable = Readonly<Record<Transition, readonly CellOffset[]>>;

/**
 * SRS kick table for J, L, S, T, Z (shared).
 * Each entry is the list of 5 (dx, dy) offsets to try, in priority order.
 */
export const KICKS_JLSTZ: KickTable = {
  "0->1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "1->0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "1->2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "2->1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "2->3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "3->2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "3->0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "0->3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],

  // 180° rotations (not in SRS spec; modern guideline allows but is not
  // strictly defined). We provide the trivial no-kick attempt so a 180
  // rotation only succeeds in free space. Future extension: SRS+ tables.
  "0->2": [[0, 0]],
  "2->0": [[0, 0]],
  "1->3": [[0, 0]],
  "3->1": [[0, 0]],
};

/**
 * SRS kick table for I-piece.
 */
export const KICKS_I: KickTable = {
  "0->1": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "1->0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "1->2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "2->1": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "2->3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "3->2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "3->0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "0->3": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],

  "0->2": [[0, 0]],
  "2->0": [[0, 0]],
  "1->3": [[0, 0]],
  "3->1": [[0, 0]],
};

const KICKS_O: readonly CellOffset[] = [[0, 0]];

/**
 * Returns the kick offsets to test, in priority order, for the given piece
 * kind transitioning from `from` to `to`.
 */
export function kickOffsets(
  kind: PieceKind,
  from: Rotation,
  to: Rotation,
): readonly CellOffset[] {
  if (kind === "O") return KICKS_O;
  const key = `${from}->${to}` as Transition;
  if (kind === "I") return KICKS_I[key];
  return KICKS_JLSTZ[key];
}
