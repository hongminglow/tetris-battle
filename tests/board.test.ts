/**
 * Board tests — line clear, garbage, collision basics.
 */
import { describe, it, expect } from "vitest";
import {
  BOARD_COLS,
  BOARD_ROWS,
  VISIBLE_TOP,
  addGarbage,
  clearLines,
  collides,
  createBoard,
  merge,
} from "../src/engine/board";
import type { Piece, Cell } from "../src/engine/types";

function fillRow(board: Cell[][], y: number, kind: Cell): void {
  const row = board[y];
  if (row === undefined) throw new Error(`row ${y} missing`);
  for (let x = 0; x < BOARD_COLS; x++) row[x] = kind;
}

describe("createBoard", () => {
  it("returns a 40×10 grid of zeros", () => {
    const b = createBoard();
    expect(b).toHaveLength(BOARD_ROWS);
    for (let y = 0; y < BOARD_ROWS; y++) {
      const row = b[y];
      expect(row).toBeDefined();
      expect(row).toHaveLength(BOARD_COLS);
      for (let x = 0; x < BOARD_COLS; x++) {
        expect(row?.[x]).toBe(0);
      }
    }
  });
});

describe("collides", () => {
  it("treats out-of-bounds left/right/bottom as collision", () => {
    const b = createBoard();
    expect(collides(b, { kind: "T", rot: 0, x: -1, y: 28 })).toBe(true);
    expect(collides(b, { kind: "T", rot: 0, x: 9, y: 28 })).toBe(true);
    expect(collides(b, { kind: "T", rot: 0, x: 3, y: 39 })).toBe(true);
  });

  it("does not collide on empty board in valid position", () => {
    const b = createBoard();
    expect(collides(b, { kind: "T", rot: 0, x: 3, y: 28 })).toBe(false);
  });

  it("collides when overlapping a filled cell", () => {
    const b = createBoard();
    const row20 = b[20];
    if (row20 === undefined) throw new Error();
    row20[4] = "I";
    expect(collides(b, { kind: "T", rot: 0, x: 3, y: 19 })).toBe(true);
  });

  it("allows piece cells inside the buffer rows above the playfield", () => {
    const b = createBoard();
    expect(collides(b, { kind: "T", rot: 0, x: 3, y: -1 })).toBe(false);
  });
});

describe("merge", () => {
  it("stamps piece cells onto a fresh board copy", () => {
    const b = createBoard();
    const piece: Piece = { kind: "T", rot: 0, x: 3, y: 28 };
    const out = merge(b, piece);
    expect(b[28]?.[4]).toBe(0); // input not mutated
    expect(out[28]?.[4]).toBe("T"); // bump
    expect(out[29]?.[3]).toBe("T");
    expect(out[29]?.[4]).toBe("T");
    expect(out[29]?.[5]).toBe("T");
  });
});

describe("clearLines", () => {
  it("clears 4 full rows and reports cleared=4", () => {
    const b = createBoard();
    for (let y = 36; y <= 39; y++) fillRow(b, y, "I");
    const result = clearLines(b);
    expect(result.cleared).toBe(4); // Tetris
    expect(result.rows).toEqual([36, 37, 38, 39]);
    // After clear, board still has 40 rows with the bottom now empty.
    expect(result.board).toHaveLength(BOARD_ROWS);
    for (let y = VISIBLE_TOP; y < BOARD_ROWS; y++) {
      const row = result.board[y];
      for (let x = 0; x < BOARD_COLS; x++) {
        expect(row?.[x]).toBe(0);
      }
    }
  });

  it("returns cleared=0 with original board reference when no lines full", () => {
    const b = createBoard();
    const result = clearLines(b);
    expect(result.cleared).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.board).toBe(b);
  });

  it("flags perfectClear when board is empty after clearing", () => {
    const b = createBoard();
    fillRow(b, 39, "I");
    const result = clearLines(b);
    expect(result.cleared).toBe(1);
    expect(result.perfectClear).toBe(true);
  });
});

describe("addGarbage", () => {
  it("inserts N garbage rows at the bottom with one hole at holeCol", () => {
    const b = createBoard();
    const out = addGarbage(b, 3, 4);
    for (let y = BOARD_ROWS - 3; y < BOARD_ROWS; y++) {
      const row = out[y];
      expect(row).toBeDefined();
      for (let x = 0; x < BOARD_COLS; x++) {
        if (x === 4) expect(row?.[x]).toBe(0);
        else expect(row?.[x]).toBe("G");
      }
    }
  });

  it("preserves the hole column across all rows of the same event", () => {
    const b = createBoard();
    const out = addGarbage(b, 4, 7);
    for (let y = BOARD_ROWS - 4; y < BOARD_ROWS; y++) {
      expect(out[y]?.[7]).toBe(0);
    }
  });

  it("count<=0 returns the input board unchanged", () => {
    const b = createBoard();
    expect(addGarbage(b, 0, 4)).toBe(b);
    expect(addGarbage(b, -2, 4)).toBe(b);
  });
});
