/**
 * Seedable randomness — the entire game's piece sequence is derived from a
 * single 32-bit match seed. The same seed always produces the same pieces.
 *
 * Touched in: Task 3.
 */

import type { PieceKind } from "./types";

/** Mulberry32 PRNG. Returns a function producing [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Splits a single match seed into two independent stream seeds — one for
 * each player. The two streams must produce different sequences from the
 * same match seed so the AI doesn't get the same piece order as the human.
 */
export function splitSeed(matchSeed: number): [number, number] {
  // Knuth-style multiplicative hash for player 1; XOR mask for player 2.
  const a = Math.imul(matchSeed, 0x9E3779B1) | 0;
  const b = (matchSeed ^ 0xDEADBEEF) | 0;
  return [a, b];
}

const ALL_KINDS: readonly PieceKind[] = ["I", "O", "T", "S", "Z", "J", "L"];

/**
 * Returns a function that, when called, yields the next piece in a 7-bag
 * sequence. Each "bag" is a uniformly-random permutation of all 7 pieces;
 * the bag refills automatically. This guarantees that within any 7
 * consecutive pieces every kind appears exactly once.
 */
export function createBag(rng: () => number): () => PieceKind {
  let bag: PieceKind[] = [];
  return () => {
    if (bag.length === 0) {
      bag = ALL_KINDS.slice();
      // Fisher-Yates shuffle using the seeded RNG.
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = bag[i];
        const other = bag[j];
        if (tmp === undefined || other === undefined) continue;
        bag[i] = other;
        bag[j] = tmp;
      }
    }
    const next = bag.shift();
    if (next === undefined) throw new Error("bag empty after refill");
    return next;
  };
}
