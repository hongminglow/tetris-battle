/**
 * Tetromino shape data — absolute (dx, dy) cell offsets within a piece's
 * bounding box for each of the four SRS rotation states.
 *
 * Coordinate convention: x is column index, y is row index, +y points DOWN.
 *
 * Bounding-box sizes:
 *   I → 4×4
 *   O → 3×3 (cells fixed regardless of rotation; SRS treats O as no-rotation)
 *   T,S,Z,J,L → 3×3
 *
 * Spawn rule: bounding box left edge at column 3, top edge at row
 * (VISIBLE_TOP - 2) = 18. With these shape data, the piece appears at the
 * top of the visible playfield (rows 19–21 depending on shape).
 *
 * Touched in: Task 2.
 */

import type { CellOffset, PieceKind, Rotation } from "./types";

type ShapeTable = Readonly<Record<PieceKind, readonly [
  readonly CellOffset[], // rot 0
  readonly CellOffset[], // rot 1
  readonly CellOffset[], // rot 2
  readonly CellOffset[], // rot 3
]>>;

export const SHAPES: ShapeTable = {
  I: [
    // rot 0 — horizontal, row 1 of 4×4 box
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    // rot 1 — vertical, col 2
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    // rot 2 — horizontal, row 2
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    // rot 3 — vertical, col 1
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    // O does not rotate; cells live in cols 1-2 of a 3-wide box
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    // rot 0 — bump up
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    // rot 1 — bump right
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    // rot 2 — bump down
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    // rot 3 — bump left
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};

/** Spawn column for the bounding-box top-left edge. */
export const SPAWN_X = 3;

/**
 * Spawn row (bounding-box top-left). With VISIBLE_TOP=20, this places the
 * piece's bounding box across rows 18–21 (or 18–20 for 3-wide pieces). The
 * piece's first visible cells appear at the top of the playfield.
 */
export const SPAWN_Y = 18;

/** Returns the absolute cell offsets for the given piece kind/rotation. */
export function shapeCells(
  kind: PieceKind,
  rot: Rotation,
): readonly CellOffset[] {
  const cells = SHAPES[kind][rot];
  return cells;
}
