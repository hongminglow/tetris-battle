/**
 * Board grid + pure operations on it.
 *
 * The grid is `Cell[BOARD_ROWS][BOARD_COLS]` (row-major, board[y][x]).
 * Top BUFFER_ROWS rows are above the visible playfield (used for spawn and
 * rotation overflow); bottom VISIBLE_ROWS rows are visible (rows 20–39).
 *
 * All functions are pure (do not mutate inputs). Board returns are always a
 * fresh outer array; row arrays are reused if not changed.
 *
 * Touched in: Task 2.
 */

import type { Cell, Piece } from "./types";
import { BOARD_COLS, BOARD_ROWS, VISIBLE_TOP } from "./types";
import { shapeCells } from "./tetrominoes";

export type Board = Cell[][];

/** Creates a fresh empty 40-row × 10-col board. */
export function createBoard(): Board {
  const b: Cell[][] = new Array(BOARD_ROWS);
  for (let y = 0; y < BOARD_ROWS; y++) {
    b[y] = new Array<Cell>(BOARD_COLS).fill(0);
  }
  return b;
}

/** Deep-clones a board (every row is a new array). */
export function cloneBoard(board: Board): Board {
  const out: Cell[][] = new Array(board.length);
  for (let y = 0; y < board.length; y++) {
    const row = board[y];
    out[y] = row === undefined ? new Array<Cell>(BOARD_COLS).fill(0) : row.slice();
  }
  return out;
}

/** Returns the cell at (x, y), or "wall" semantics for out-of-bounds. */
function cellAt(board: Board, x: number, y: number): Cell | "wall" {
  if (x < 0 || x >= BOARD_COLS || y < 0 || y >= BOARD_ROWS) return "wall";
  const row = board[y];
  if (row === undefined) return "wall";
  const c = row[x];
  return c === undefined ? 0 : c;
}

/**
 * True if the piece at its current position would overlap a filled cell or
 * leave the playfield (left/right/bottom). Pieces are allowed to extend up
 * into the buffer rows above the visible area.
 */
export function collides(board: Board, piece: Piece): boolean {
  const cells = shapeCells(piece.kind, piece.rot);
  for (const [dx, dy] of cells) {
    const x = piece.x + dx;
    const y = piece.y + dy;
    if (x < 0 || x >= BOARD_COLS) return true;
    if (y >= BOARD_ROWS) return true;
    if (y < 0) continue; // allow above-buffer
    const row = board[y];
    if (row !== undefined && row[x] !== 0) return true;
  }
  return false;
}

/** Returns a new board with the piece's cells stamped onto it. */
export function merge(board: Board, piece: Piece): Board {
  const out = cloneBoard(board);
  const cells = shapeCells(piece.kind, piece.rot);
  for (const [dx, dy] of cells) {
    const x = piece.x + dx;
    const y = piece.y + dy;
    if (x < 0 || x >= BOARD_COLS) continue;
    if (y < 0 || y >= BOARD_ROWS) continue;
    const row = out[y];
    if (row !== undefined) row[x] = piece.kind;
  }
  return out;
}

/**
 * Scans the board for full rows in the visible playfield, removes them, and
 * returns the new board plus the indices of cleared rows (in original
 * board-y coordinates) AND the per-row colors (for particle bursts later).
 */
export interface ClearLinesResult {
  board: Board;
  cleared: number;
  /** y-indices (board space) that were cleared, top-to-bottom order. */
  rows: number[];
  /** Whether the entire playfield is empty after the clear (Perfect Clear). */
  perfectClear: boolean;
}

export function clearLines(board: Board): ClearLinesResult {
  const rows: number[] = [];
  // Sweep visible rows; buffer rows are skipped (a piece locking entirely in
  // buffer is a top-out, handled elsewhere — those rows can never be "full"
  // unless the player jammed garbage there, which we forbid).
  for (let y = VISIBLE_TOP; y < BOARD_ROWS; y++) {
    const row = board[y];
    if (row === undefined) continue;
    let full = true;
    for (let x = 0; x < BOARD_COLS; x++) {
      if (row[x] === 0) {
        full = false;
        break;
      }
    }
    if (full) rows.push(y);
  }
  if (rows.length === 0) {
    return { board, cleared: 0, rows: [], perfectClear: false };
  }

  const out = cloneBoard(board);
  // Remove the cleared rows and prepend empty rows at the top to keep size.
  const removedSet = new Set(rows);
  const kept: Cell[][] = [];
  for (let y = 0; y < BOARD_ROWS; y++) {
    if (!removedSet.has(y)) {
      const row = out[y];
      if (row !== undefined) kept.push(row);
    }
  }
  while (kept.length < BOARD_ROWS) {
    kept.unshift(new Array<Cell>(BOARD_COLS).fill(0));
  }

  // Perfect clear if every visible row is empty afterward.
  let perfect = true;
  for (let y = VISIBLE_TOP; y < BOARD_ROWS; y++) {
    const row = kept[y];
    if (row === undefined) continue;
    for (let x = 0; x < BOARD_COLS; x++) {
      if (row[x] !== 0) {
        perfect = false;
        break;
      }
    }
    if (!perfect) break;
  }

  return { board: kept, cleared: rows.length, rows, perfectClear: perfect };
}

/**
 * Inserts `count` garbage rows at the bottom, each with one hole at
 * `holeCol`. Existing rows shift up; rows that get pushed off the top of
 * the buffer are silently dropped (not a top-out signal — caller handles
 * that based on whether the active piece overlaps).
 */
export function addGarbage(
  board: Board,
  count: number,
  holeCol: number,
): Board {
  if (count <= 0) return board;
  const out: Cell[][] = [];
  for (let i = count; i < BOARD_ROWS; i++) {
    const row = board[i];
    out.push(row === undefined ? new Array<Cell>(BOARD_COLS).fill(0) : row.slice());
  }
  for (let i = 0; i < count; i++) {
    const garbageRow: Cell[] = new Array<Cell>(BOARD_COLS).fill("G");
    if (holeCol >= 0 && holeCol < BOARD_COLS) garbageRow[holeCol] = 0;
    out.push(garbageRow);
  }
  return out;
}

/** True if any cell of the piece sits inside the visible playfield (y >= VISIBLE_TOP). */
export function pieceTouchesVisible(piece: Piece): boolean {
  const cells = shapeCells(piece.kind, piece.rot);
  for (const [, dy] of cells) {
    if (piece.y + dy >= VISIBLE_TOP) return true;
  }
  return false;
}

/** True if the piece is entirely above the visible playfield (used for top-out). */
export function pieceEntirelyInBuffer(piece: Piece): boolean {
  return !pieceTouchesVisible(piece);
}

/** Helper: cell at (x, y) or 0 if out-of-bounds (for read-only access). */
export function readCell(board: Board, x: number, y: number): Cell {
  const c = cellAt(board, x, y);
  if (c === "wall") return 0;
  return c;
}

export { BOARD_COLS, BOARD_ROWS, VISIBLE_TOP };
