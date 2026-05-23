import { describe, it, expect } from "vitest";
import { createBag, mulberry32, splitSeed } from "../src/engine/rng";
import type { PieceKind } from "../src/engine/types";

describe("mulberry32", () => {
  it("produces the same sequence for the same seed", () => {
    const a = mulberry32(0xCAFEBABE);
    const b = mulberry32(0xCAFEBABE);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it("returns numbers in [0, 1)", () => {
    const r = mulberry32(0x12345678);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("splitSeed", () => {
  it("returns two distinct stream seeds", () => {
    const [a, b] = splitSeed(0x12345678);
    expect(a).not.toBe(b);
  });
});

describe("createBag (7-bag)", () => {
  it("yields all 7 pieces in any 7 consecutive draws", () => {
    const rng = mulberry32(0xC0FFEE);
    const bag = createBag(rng);
    for (let trial = 0; trial < 10; trial++) {
      const seen = new Set<PieceKind>();
      for (let i = 0; i < 7; i++) seen.add(bag());
      expect(seen.size).toBe(7);
    }
  });

  it("two streams from same match seed produce different first-7 sequences", () => {
    const matchSeed = 0xABCDEF12;
    const [s1, s2] = splitSeed(matchSeed);
    const bagA = createBag(mulberry32(s1));
    const bagB = createBag(mulberry32(s2));
    const a: PieceKind[] = [];
    const b: PieceKind[] = [];
    for (let i = 0; i < 7; i++) {
      a.push(bagA());
      b.push(bagB());
    }
    expect(a.join(",")).not.toBe(b.join(","));
  });
});
