/**
 * Piece color palette + background colors. Mirrors :root vars in styles.css
 * so renderers don't have to read computed styles every frame.
 *
 * Touched in: Task 2.
 */

import type { Cell, PieceKind } from "../engine/types";

export const PIECE_COLORS: Readonly<Record<PieceKind, string>> = {
  I: "#22d3ee",
  O: "#eab308",
  T: "#a855f7",
  S: "#22c55e",
  Z: "#ef4444",
  J: "#3b82f6",
  L: "#f97316",
};

export const BG_BOARD = "#07090d";
export const GRID_LINE = "#1a1f2b";
export const GARBAGE = "#3f3f46";
export const FG = "#e7ecf3";
export const FG_DIM = "#8a93a4";

export const CELL_PX = 28;

/** Returns the fill color for a board cell, or null if empty. */
export function cellColor(cell: Cell): string | null {
  if (cell === 0) return null;
  if (cell === "G") return GARBAGE;
  return PIECE_COLORS[cell];
}
