/**
 * Kick-table tests — assert table shape, then exercise actual kick scenarios
 * that require non-zero offsets to succeed.
 */
import { describe, it, expect } from "vitest";
import { KICKS_I, KICKS_JLSTZ, kickOffsets } from "../src/engine/kicks";
import { tryRotate } from "../src/engine/piece";
import { collides, createBoard, BOARD_COLS } from "../src/engine/board";
import type { Piece } from "../src/engine/types";

describe("KICKS_JLSTZ shape", () => {
  it("has 5 offsets for each of the 8 quarter-turn transitions", () => {
    const transitions = [
      "0->1", "1->0", "1->2", "2->1", "2->3", "3->2", "3->0", "0->3",
    ] as const;
    for (const key of transitions) {
      const offsets = KICKS_JLSTZ[key];
      expect(offsets, key).toHaveLength(5);
      // First offset is always (0, 0) for JLSTZ.
      expect(offsets[0]).toEqual([0, 0]);
    }
  });
});

describe("KICKS_I shape", () => {
  it("has 5 offsets for each of the 8 quarter-turn transitions", () => {
    const transitions = [
      "0->1", "1->0", "1->2", "2->1", "2->3", "3->2", "3->0", "0->3",
    ] as const;
    for (const key of transitions) {
      const offsets = KICKS_I[key];
      expect(offsets, key).toHaveLength(5);
      expect(offsets[0]).toEqual([0, 0]);
    }
  });
});

describe("kickOffsets dispatch", () => {
  it("returns I-table for I-piece", () => {
    const offsets = kickOffsets("I", 0, 1);
    expect(offsets).toEqual(KICKS_I["0->1"]);
  });
  it("returns JLSTZ-table for T/S/Z/J/L pieces", () => {
    expect(kickOffsets("T", 0, 1)).toEqual(KICKS_JLSTZ["0->1"]);
    expect(kickOffsets("S", 1, 2)).toEqual(KICKS_JLSTZ["1->2"]);
    expect(kickOffsets("J", 2, 3)).toEqual(KICKS_JLSTZ["2->3"]);
    expect(kickOffsets("L", 3, 0)).toEqual(KICKS_JLSTZ["3->0"]);
    expect(kickOffsets("Z", 0, 3)).toEqual(KICKS_JLSTZ["0->3"]);
  });
  it("returns single no-op for O-piece", () => {
    expect(kickOffsets("O", 0, 1)).toEqual([[0, 0]]);
    expect(kickOffsets("O", 2, 3)).toEqual([[0, 0]]);
  });
});

describe("rotation in open space", () => {
  it("uses kickIndex=0 (no kick needed)", () => {
    const b = createBoard();
    const piece: Piece = { kind: "T", rot: 0, x: 3, y: 28 };
    const r = tryRotate(b, piece, "cw");
    expect(r).not.toBeNull();
    expect(r?.kickIndex).toBe(0);
  });
});

describe("I-piece kick in 4-wide well (uses I-kick table)", () => {
  it("kicks vertical when CW from a horizontal seat in a 4-wide well", () => {
    // Walls at cols 0-2 and 7-9 from row 32 down to row 39.
    const b = createBoard();
    for (let y = 32; y < 40; y++) {
      const row = b[y];
      if (row === undefined) continue;
      for (let x = 0; x < BOARD_COLS; x++) {
        if (x < 3 || x > 6) row[x] = "I";
      }
    }
    // Horizontal I at the well floor at y=37 (cells row 38).
    const piece: Piece = { kind: "I", rot: 0, x: 3, y: 37 };
    expect(collides(b, piece)).toBe(false);

    const r = tryRotate(b, piece, "cw");
    expect(r).not.toBeNull();
    if (r === null) return;

    // Expected: kick offset (-2, -1) from the I-table at "0->1" (index 3).
    expect(r.kickIndex).toBe(3);
    expect(r.piece.rot).toBe(1);
    expect(r.piece.x).toBe(1); // 3 + (-2)
    expect(r.piece.y).toBe(36); // 37 + (-1)
    // Final cells: vertical at col 3, rows 36..39.
    // (Verifies via collision check that the position is actually legal.)
    expect(collides(b, r.piece)).toBe(false);
  });
});

describe("rejected rotation returns null", () => {
  it("returns null when piece is sealed and no kick offset succeeds", () => {
    // Put an I-piece at the very top of the buffer with row above and below
    // blocked, so no horizontal-to-vertical kick can succeed.
    const b = createBoard();
    // Fill rows 0..3 entirely except for the 4 I-piece cells in row 1.
    for (let y = 0; y <= 4; y++) {
      const row = b[y];
      if (row === undefined) continue;
      for (let x = 0; x < BOARD_COLS; x++) row[x] = "I";
    }
    // Carve out the 4 I-piece cells.
    const carve = b[1];
    if (carve === undefined) throw new Error();
    for (let x = 3; x <= 6; x++) carve[x] = 0;
    const piece: Piece = { kind: "I", rot: 0, x: 3, y: 0 };
    expect(collides(b, piece)).toBe(false);
    const r = tryRotate(b, piece, "cw");
    expect(r).toBeNull();
  });
});
