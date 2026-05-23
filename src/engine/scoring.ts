/**
 * Scoring + garbage send tables (modern Tetris guideline).
 * Touched in: Task 6 (basic), 7 (T-spin/B2B/combo), 10 (garbage send).
 */

/** Categories of a clearing lock. */
export type ClearKind =
  | "single"
  | "double"
  | "triple"
  | "tetris"
  | "tspin-mini-zero"
  | "tspin-mini-single"
  | "tspin-zero"
  | "tspin-single"
  | "tspin-double"
  | "tspin-triple"
  | "none"; // no lines, not a t-spin

/** Mapping from (linesCleared, isTSpin, isMini) to ClearKind. */
export function classifyClear(args: {
  linesCleared: number;
  isTSpin: boolean;
  isMini: boolean;
}): ClearKind {
  const { linesCleared, isTSpin, isMini } = args;
  if (isTSpin) {
    if (isMini) {
      if (linesCleared === 0) return "tspin-mini-zero";
      return "tspin-mini-single";
    }
    if (linesCleared === 0) return "tspin-zero";
    if (linesCleared === 1) return "tspin-single";
    if (linesCleared === 2) return "tspin-double";
    if (linesCleared === 3) return "tspin-triple";
  }
  if (linesCleared === 1) return "single";
  if (linesCleared === 2) return "double";
  if (linesCleared === 3) return "triple";
  if (linesCleared === 4) return "tetris";
  return "none";
}

/** Base score before B2B/combo/level multiplication. */
export function baseScore(kind: ClearKind): number {
  switch (kind) {
    case "single": return 100;
    case "double": return 300;
    case "triple": return 500;
    case "tetris": return 800;
    case "tspin-mini-zero": return 100;
    case "tspin-mini-single": return 200;
    case "tspin-zero": return 400;
    case "tspin-single": return 800;
    case "tspin-double": return 1200;
    case "tspin-triple": return 1600;
    case "none": return 0;
  }
}

/**
 * Whether this clear participates in B2B (Tetris or any T-Spin with lines).
 * A non-B2B-eligible CLEARING lock breaks the chain; non-clearing locks
 * (including T-Spin Zero) preserve the chain but don't extend it.
 */
export function clearIsB2BEligible(kind: ClearKind): boolean {
  return (
    kind === "tetris" ||
    kind === "tspin-mini-single" ||
    kind === "tspin-single" ||
    kind === "tspin-double" ||
    kind === "tspin-triple"
  );
}

/** Whether this clear breaks the B2B chain (line-clearing but not eligible). */
export function clearBreaksB2B(kind: ClearKind): boolean {
  return kind === "single" || kind === "double" || kind === "triple";
}

/** Garbage-send count per ClearKind (before B2B/combo bonuses). */
function baseGarbage(kind: ClearKind): number {
  switch (kind) {
    case "single": return 0;
    case "double": return 1;
    case "triple": return 2;
    case "tetris": return 4;
    case "tspin-mini-zero": return 0;
    case "tspin-mini-single": return 0;
    case "tspin-zero": return 0;
    case "tspin-single": return 2;
    case "tspin-double": return 4;
    case "tspin-triple": return 6;
    case "none": return 0;
  }
}

/** Combo garbage bonus per chain length (combo index, 0-based after first clear). */
function comboGarbage(combo: number): number {
  // Chain index → bonus lines: 0,0,1,1,2,2,3,3,4,4,4,5,...
  if (combo <= 0) return 0;
  if (combo === 1) return 0;
  if (combo === 2) return 1;
  if (combo === 3) return 1;
  if (combo === 4) return 2;
  if (combo === 5) return 2;
  if (combo === 6) return 3;
  if (combo === 7) return 3;
  if (combo === 8) return 4;
  if (combo === 9) return 4;
  if (combo === 10) return 4;
  return 5;
}

export interface ScoreInput {
  kind: ClearKind;
  level: number;
  /** Combo index AFTER this clear (i.e. 0 if this was the first clear). */
  combo: number;
  /** Was previous clear B2B-eligible AND this clear is B2B-eligible? */
  b2bActive: boolean;
  /** Did the entire visible playfield empty with this clear? */
  perfectClear: boolean;
}

export interface ScoreResult {
  /** Total points awarded this lock (line-score + combo bonus + perfect clear). */
  points: number;
  /** Garbage lines sent to opponent. */
  garbage: number;
  /** B2B bonus applied (×0.5 of base score). */
  b2bApplied: boolean;
}

/**
 * Pure scoring function. Returns the points and garbage to send for a
 * single locking event.
 */
export function scoreClear(input: ScoreInput): ScoreResult {
  const { kind, level, combo, b2bActive, perfectClear } = input;
  const base = baseScore(kind) * level;

  let b2bMult = 1;
  let b2bApplied = false;
  if (b2bActive && clearIsB2BEligible(kind)) {
    b2bMult = 1.5;
    b2bApplied = true;
  }

  // Combo bonus: 50 × combo × level (combo here is the chain length AFTER
  // this clear; the first clear in a combo is combo=0 → 0 bonus).
  const comboBonus = combo > 0 ? 50 * combo * level : 0;

  // Perfect clear bonus: +800 (Single), 1200 (Double), 1800 (Triple), 2000
  // (Tetris). For B2B Tetris perfect clear it's 3200. We follow the
  // simplified guideline: +1500 for any perfect clear, plus +10 garbage.
  const pcBonus = perfectClear ? 1500 : 0;

  const points = Math.floor(base * b2bMult) + comboBonus + pcBonus;

  let garbage = baseGarbage(kind);
  if (b2bApplied) garbage += 1;
  garbage += comboGarbage(combo);
  if (perfectClear) garbage += 10;

  return { points, garbage, b2bApplied };
}
