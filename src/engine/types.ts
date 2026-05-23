/**
 * Core engine types — pure data shapes, no logic.
 * Touched in: Task 2.
 */

/** The seven Tetris guideline pieces. */
export type PieceKind = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

/** Empty cell or piece-kind tag (used for both stack and active piece). */
export type Cell = 0 | PieceKind | "G";

/** SRS rotation states. 0 = spawn, 1 = right, 2 = 180, 3 = left. */
export type Rotation = 0 | 1 | 2 | 3;

/** A piece in flight: its kind, current rotation, and bounding-box top-left. */
export interface Piece {
  kind: PieceKind;
  rot: Rotation;
  /** Column of the piece's bounding-box top-left. */
  x: number;
  /** Row of the piece's bounding-box top-left (0 = top of buffer). */
  y: number;
}

/** A single cell offset relative to a piece's bounding-box top-left. */
export type CellOffset = readonly [number, number];

/** Direction of a rotation attempt. */
export type RotDir = "cw" | "ccw" | "180";

/** Garbage line marker; in `Cell` type, "G" means garbage block. */
export const GARBAGE_CELL: Cell = "G";

/** Visible playfield height. The board has BUFFER_ROWS extra rows above. */
export const VISIBLE_ROWS = 20;
export const BUFFER_ROWS = 20;
export const BOARD_ROWS = VISIBLE_ROWS + BUFFER_ROWS; // 40
export const BOARD_COLS = 10;

/** First visible row index in the board grid (rows above are buffer). */
export const VISIBLE_TOP = BUFFER_ROWS; // 20

/** Returns the next rotation after applying `dir` from `from`. */
export function rotateIndex(from: Rotation, dir: RotDir): Rotation {
  if (dir === "cw") return ((from + 1) & 3) as Rotation;
  if (dir === "ccw") return ((from + 3) & 3) as Rotation;
  return ((from + 2) & 3) as Rotation;
}
