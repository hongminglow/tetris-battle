import { describe, it, expect } from "vitest";
import { scoreClear, classifyClear } from "../src/engine/scoring";

describe("classifyClear", () => {
  it("classifies plain line clears", () => {
    expect(classifyClear({ linesCleared: 1, isTSpin: false, isMini: false })).toBe("single");
    expect(classifyClear({ linesCleared: 2, isTSpin: false, isMini: false })).toBe("double");
    expect(classifyClear({ linesCleared: 3, isTSpin: false, isMini: false })).toBe("triple");
    expect(classifyClear({ linesCleared: 4, isTSpin: false, isMini: false })).toBe("tetris");
  });

  it("classifies T-spins by line count + mini flag", () => {
    expect(classifyClear({ linesCleared: 0, isTSpin: true, isMini: false })).toBe("tspin-zero");
    expect(classifyClear({ linesCleared: 1, isTSpin: true, isMini: false })).toBe("tspin-single");
    expect(classifyClear({ linesCleared: 2, isTSpin: true, isMini: false })).toBe("tspin-double");
    expect(classifyClear({ linesCleared: 3, isTSpin: true, isMini: false })).toBe("tspin-triple");
    expect(classifyClear({ linesCleared: 1, isTSpin: true, isMini: true })).toBe("tspin-mini-single");
  });
});

describe("scoreClear (line-only)", () => {
  it("Single at level 1 is 100", () => {
    const r = scoreClear({ kind: "single", level: 1, combo: 0, b2bActive: false, perfectClear: false });
    expect(r.points).toBe(100);
    expect(r.garbage).toBe(0);
  });

  it("Tetris at level 1 is 800 / 4 garbage", () => {
    const r = scoreClear({ kind: "tetris", level: 1, combo: 0, b2bActive: false, perfectClear: false });
    expect(r.points).toBe(800);
    expect(r.garbage).toBe(4);
  });

  it("B2B Tetris at level 1 is 1200 (×1.5) and +1 garbage = 5", () => {
    const r = scoreClear({ kind: "tetris", level: 1, combo: 0, b2bActive: true, perfectClear: false });
    expect(r.points).toBe(1200);
    expect(r.garbage).toBe(5);
    expect(r.b2bApplied).toBe(true);
  });

  it("T-Spin Double at level 1 is 1200 / 4 garbage", () => {
    const r = scoreClear({ kind: "tspin-double", level: 1, combo: 0, b2bActive: false, perfectClear: false });
    expect(r.points).toBe(1200);
    expect(r.garbage).toBe(4);
  });
});

describe("scoreClear (combo)", () => {
  it("combo of 5 at level 3 awards bonus 50*5*3 = 750", () => {
    const r = scoreClear({ kind: "single", level: 3, combo: 5, b2bActive: false, perfectClear: false });
    expect(r.points).toBe(100 * 3 + 750);
  });

  it("combo bonus garbage scales with chain length", () => {
    const r3 = scoreClear({ kind: "double", level: 1, combo: 3, b2bActive: false, perfectClear: false });
    // base double=1, combo[3]=1 → total 2
    expect(r3.garbage).toBe(2);
  });
});

describe("scoreClear (perfect clear)", () => {
  it("adds +1500 points and +10 garbage", () => {
    const r = scoreClear({ kind: "tetris", level: 1, combo: 0, b2bActive: false, perfectClear: true });
    expect(r.points).toBe(800 + 1500);
    expect(r.garbage).toBe(4 + 10);
  });
});
