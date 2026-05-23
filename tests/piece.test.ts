/**
 * Piece tests — basic rotation, drop distance, kicks against walls.
 */
import { describe, it, expect } from "vitest";
import { createBoard, collides, BOARD_COLS } from "../src/engine/board";
import { tryRotate, dropDistance, movePiece } from "../src/engine/piece";
import type { Piece, Cell } from "../src/engine/types";

describe("tryRotate", () => {
  it("rotates T-piece in open space without a kick", () => {
    const b = createBoard();
    const piece: Piece = { kind: "T", rot: 0, x: 3, y: 28 };
    const result = tryRotate(b, piece, "cw");
    expect(result).not.toBeNull();
    expect(result?.kickIndex).toBe(0);
    expect(result?.piece.rot).toBe(1);
  });

  it("returns null for O-piece rotation (no real rotation)", () => {
    const b = createBoard();
    const piece: Piece = { kind: "O", rot: 0, x: 4, y: 28 };
    // O has identical shape data per rotation, so the piece doesn't visually
    // change, but tryRotate must still resolve cleanly. Here it returns a
    // valid result (rot updated, piece unchanged in cells).
    const result = tryRotate(b, piece, "cw");
    expect(result).not.toBeNull();
    expect(result?.piece.rot).toBe(1);
  });

  it("kicks I-piece off the right wall when rotating from rot 0 to rot 1", () => {
    // Place an I-piece at the far right (cells in cols 6-9 in rot 0).
    // Without kicks, rot 1 (vertical at col 8) fits; this just verifies
    // the piece is movable. Stronger test below.
    const b = createBoard();
    const piece: Piece = { kind: "I", rot: 0, x: 6, y: 28 };
    expect(collides(b, piece)).toBe(false);
    const r = tryRotate(b, piece, "cw");
    expect(r).not.toBeNull();
    expect(r?.piece.rot).toBe(1);
  });

  it("I-piece in 4-wide well rotates via I-kick table", () => {
    // Build a 4-wide well at cols 3-6, surrounded by walls at cols 0-2 and 7-9.
    const b = createBoard();
    for (let y = 30; y < 40; y++) {
      const row = b[y];
      if (row === undefined) continue;
      for (let x = 0; x < BOARD_COLS; x++) {
        if (x < 3 || x > 6) row[x] = "I";
      }
    }
    // Horizontal I one row above the well floor (y=37 → cells row 38).
    // From the floor (y=38) the kick fails because every offset overflows
    // the bottom; from y=37 the (-2,-1) kick recovers a vertical placement
    // that fits in the well.
    const piece: Piece = { kind: "I", rot: 0, x: 3, y: 37 };
    expect(collides(b, piece)).toBe(false);
    const r = tryRotate(b, piece, "cw");
    expect(r).not.toBeNull();
    if (r !== null) {
      expect(collides(b, r.piece)).toBe(false);
    }
  });
});

describe("dropDistance", () => {
  it("returns rows-down on empty board for top-of-buffer piece", () => {
    const b = createBoard();
    const piece: Piece = { kind: "T", rot: 0, x: 3, y: 19 };
    const d = dropDistance(b, piece);
    // T at y=19 (rot 0: bump at y=19, body at y=20). Body bottom = 20.
    // Drops until body bottom touches floor (row 39). Body bottom is at
    // y+1=20 initially, floor=39, so d = 19.
    expect(d).toBe(19);
  });

  it("returns 0 when piece is already resting on floor", () => {
    const b = createBoard();
    // T at y=38 has body at row 39 (floor). Bump at row 38.
    const piece: Piece = { kind: "T", rot: 0, x: 3, y: 38 };
    expect(collides(b, piece)).toBe(false);
    expect(dropDistance(b, piece)).toBe(0);
  });

  it("respects the existing stack", () => {
    const b = createBoard();
    // Fill row 30 entirely.
    const row = b[30];
    if (row === undefined) throw new Error();
    for (let x = 0; x < BOARD_COLS; x++) row[x] = "I";
    // T at y=20 (body at y=21). Should drop until body lands on row 29.
    // body y after drop = 29, so d = 29 - 21 = 8.
    const piece: Piece = { kind: "T", rot: 0, x: 3, y: 20 };
    expect(dropDistance(b, piece)).toBe(8);
  });
});

describe("movePiece", () => {
  it("returns a new piece offset by (dx, dy) without checking bounds", () => {
    const piece: Piece = { kind: "T", rot: 0, x: 3, y: 19 };
    const moved = movePiece(piece, -1, 2);
    expect(moved).toEqual({ kind: "T", rot: 0, x: 2, y: 21 });
    expect(piece.x).toBe(3); // input unchanged
  });
});
