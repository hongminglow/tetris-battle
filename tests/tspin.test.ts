import { describe, it, expect } from "vitest";
import { detectTSpin } from "../src/engine/tspin";
import { createBoard, BOARD_COLS } from "../src/engine/board";
import type { Piece, Cell } from "../src/engine/types";

function setCell(board: Cell[][], x: number, y: number, val: Cell): void {
  const row = board[y];
  if (row === undefined) throw new Error(`row ${y} missing`);
  row[x] = val;
}

describe("detectTSpin", () => {
  it("returns null when last action was not a rotation", () => {
    const b = createBoard();
    const piece: Piece = { kind: "T", rot: 2, x: 3, y: 28 };
    expect(
      detectTSpin({ board: b, piece, lastWasRotate: false, lastKickIndex: 0 }),
    ).toBeNull();
  });

  it("returns null for non-T pieces", () => {
    const b = createBoard();
    const piece: Piece = { kind: "S", rot: 0, x: 3, y: 28 };
    expect(
      detectTSpin({ board: b, piece, lastWasRotate: true, lastKickIndex: 0 }),
    ).toBeNull();
  });

  it("returns 'normal' for 3-corner setup with both front corners filled (rot 2)", () => {
    // T in rot 2 (bump-down), pivot at (px, py). Corners are at (px±1, py±1).
    const b = createBoard();
    const piece: Piece = { kind: "T", rot: 2, x: 3, y: 28 };
    // Pivot at x=4, y=29. Corners: (3,28), (5,28), (3,30), (5,30).
    // Front corners for rot 2 (bump-down) are bottom: (3,30) and (5,30).
    setCell(b, 3, 30, "I"); // front
    setCell(b, 5, 30, "I"); // front
    setCell(b, 3, 28, "I"); // back
    const result = detectTSpin({ board: b, piece, lastWasRotate: true, lastKickIndex: 0 });
    expect(result).toBe("normal");
  });

  it("returns 'mini' when only one front corner is filled but 3 corners total", () => {
    const b = createBoard();
    const piece: Piece = { kind: "T", rot: 2, x: 3, y: 28 };
    // Pivot at (4, 29). Fill 3 corners but only ONE of the front (bottom) corners.
    setCell(b, 3, 30, "I"); // front
    setCell(b, 3, 28, "I"); // back
    setCell(b, 5, 28, "I"); // back (other side)
    const result = detectTSpin({ board: b, piece, lastWasRotate: true, lastKickIndex: 0 });
    expect(result).toBe("mini");
  });

  it("returns 'normal' if kick index = 4 even when front corners aren't both filled", () => {
    const b = createBoard();
    const piece: Piece = { kind: "T", rot: 2, x: 3, y: 28 };
    setCell(b, 3, 30, "I");
    setCell(b, 3, 28, "I");
    setCell(b, 5, 28, "I");
    const result = detectTSpin({ board: b, piece, lastWasRotate: true, lastKickIndex: 4 });
    expect(result).toBe("normal");
  });

  it("treats out-of-bounds as a filled corner", () => {
    const b = createBoard();
    // Place T at left wall so pivot's left corners are out of bounds.
    const piece: Piece = { kind: "T", rot: 2, x: -1, y: 28 };
    // Pivot at (0, 29). Corners: (-1, 28) wall, (1, 28), (-1, 30) wall, (1, 30).
    setCell(b, 1, 30, "I"); // one front corner
    // Walls give us 2 of the 3 corners; the (1, 30) cell makes 3.
    const result = detectTSpin({ board: b, piece, lastWasRotate: true, lastKickIndex: 0 });
    // Front corners for rot 2: (-1, 30) wall + (1, 30) filled = both front filled → normal
    expect(result).toBe("normal");
  });

  it("returns null with fewer than 3 filled corners", () => {
    const b = createBoard();
    const piece: Piece = { kind: "T", rot: 2, x: 3, y: 28 };
    setCell(b, 3, 30, "I");
    setCell(b, 5, 30, "I");
    // Only 2 corners filled, not enough for a T-spin.
    const result = detectTSpin({ board: b, piece, lastWasRotate: true, lastKickIndex: 0 });
    expect(result).toBeNull();
  });
});
