/**
 * GameState — the deterministic core of one Tetris board.
 *
 * Everything is a method on the GameState class. Inputs come via apply(action)
 * and tick(dtMs); outputs are emitted as GameEvent[] consumed by the Battle
 * layer (for garbage exchange) and the renderer (for particles/shake/toasts).
 *
 * Touched in: Task 3 (queue/hold), Task 4 (gravity/lock-delay/move),
 * Task 5 (hard-drop/hold/ghost), Task 6 (line-clear/scoring), Task 7
 * (T-spin/B2B/combo), Task 8 (top-out).
 */

import type { Board } from "./board";
import {
  BOARD_COLS,
  BOARD_ROWS,
  VISIBLE_TOP,
  addGarbage,
  clearLines,
  collides,
  createBoard,
  merge,
  pieceEntirelyInBuffer,
} from "./board";
import { dropDistance, movePiece, tryRotate } from "./piece";
import { SHAPES, SPAWN_X, SPAWN_Y, shapeCells } from "./tetrominoes";
import type { Piece, PieceKind, RotDir } from "./types";
import { createBag, mulberry32 } from "./rng";
import {
  classifyClear,
  clearBreaksB2B,
  clearIsB2BEligible,
  scoreClear,
  type ClearKind,
} from "./scoring";
import { detectTSpin } from "./tspin";

/** Lock delay constants (locked in plan). */
export const LOCK_DELAY_MS = 500;
export const LOCK_RESET_CAP = 15;

/** Gravity table (ms per cell drop) by level. Level 0 unused. */
export const GRAVITY_MS_PER_CELL: readonly number[] = [
  1000, 1000, 793, 617, 472, 355, 262, 189, 134, 93,
  64, 43, 28, 18, 11, 7, 4, 3, 2, 1,
  1, // level 20+ floor
];

/** AI/CPU cadence constant — ms per piece, decreased by level. */
export function aiCadenceMs(level: number): number {
  return Math.max(300, 1200 - 60 * Math.min(level, 15));
}

/** Player-issued action (one per game tick from input layer or AI driver). */
export type Action =
  | { type: "MoveLeft" }
  | { type: "MoveRight" }
  | { type: "RotateCW" }
  | { type: "RotateCCW" }
  | { type: "Rotate180" }
  | { type: "SoftDropStep" }
  | { type: "HardDrop" }
  | { type: "Hold" };

/** Events emitted from the game during tick / apply, consumed by battle/render. */
export type GameEvent =
  | { type: "Spawn"; kind: PieceKind }
  | { type: "Lock"; piece: Piece; tspin: null | "mini" | "normal" }
  | {
      type: "LinesCleared";
      rows: number[];
      kind: ClearKind;
      points: number;
      garbage: number;
      level: number;
      linesTotal: number;
      b2b: boolean;
      combo: number;
      perfectClear: boolean;
    }
  | { type: "TopOut" };

interface GameStateConfig {
  seed: number;
  startingLevel?: number;
}

export class GameState {
  // Identity
  readonly seed: number;

  // RNG / queue
  private readonly bag: () => PieceKind;
  queue: PieceKind[] = [];

  // Board + active piece
  board: Board;
  active: Piece | null = null;
  hold: PieceKind | null = null;
  holdUsed = false;

  // Movement / gravity / lock delay
  private gravityAccumMs = 0;
  private lockDelayMs = LOCK_DELAY_MS;
  private lockResetCount = 0;
  private grounded = false;

  // Last-action tracking (for T-spin)
  private lastWasRotate = false;
  private lastKickIndex = 0;

  // Stats / scoring
  score = 0;
  level = 1;
  lines = 0;
  combo = -1; // -1 means no active combo
  b2b = false;

  // Termination
  topOut = false;

  // Pending garbage to insert before next spawn
  pendingGarbage: { rows: number; holeCol: number }[] = [];

  // Buffered events for the current tick window
  private events: GameEvent[] = [];

  constructor(cfg: GameStateConfig) {
    this.seed = cfg.seed;
    this.level = cfg.startingLevel ?? 1;
    const rng = mulberry32(cfg.seed);
    this.bag = createBag(rng);
    this.board = createBoard();
    this.refillQueue();
    this.spawnNext();
  }

  /** Drains pending events for an external consumer (battle/render). */
  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Computes the ghost piece (where the active piece would land). */
  ghost(): Piece | null {
    if (this.active === null) return null;
    const d = dropDistance(this.board, this.active);
    return movePiece(this.active, 0, d);
  }

  // -- queue ----------------------------------------------------------------

  private refillQueue(): void {
    while (this.queue.length < 5) this.queue.push(this.bag());
  }

  private nextFromQueue(): PieceKind {
    const k = this.queue.shift();
    if (k === undefined) {
      this.refillQueue();
      const k2 = this.queue.shift();
      if (k2 === undefined) throw new Error("queue empty after refill");
      return k2;
    }
    this.refillQueue();
    return k;
  }

  // -- spawn / top-out ------------------------------------------------------

  private spawnNext(): void {
    // Apply any pending garbage BEFORE spawning the new piece.
    if (this.pendingGarbage.length > 0) {
      for (const g of this.pendingGarbage) {
        this.board = addGarbage(this.board, g.rows, g.holeCol);
      }
      this.pendingGarbage = [];
    }

    const kind = this.nextFromQueue();
    this.spawnPiece(kind);
  }

  private spawnPiece(kind: PieceKind): void {
    const piece: Piece = { kind, rot: 0, x: SPAWN_X, y: SPAWN_Y };
    if (collides(this.board, piece)) {
      this.topOut = true;
      this.active = null;
      this.events.push({ type: "TopOut" });
      return;
    }
    this.active = piece;
    this.holdUsed = false;
    this.gravityAccumMs = 0;
    this.lockDelayMs = LOCK_DELAY_MS;
    this.lockResetCount = 0;
    this.grounded = false;
    this.lastWasRotate = false;
    this.lastKickIndex = 0;
    this.events.push({ type: "Spawn", kind });
  }

  // -- tick / actions -------------------------------------------------------

  /** Advances time by dtMs (gravity + lock delay). */
  tick(dtMs: number): void {
    if (this.topOut || this.active === null) return;

    const gravityMs = GRAVITY_MS_PER_CELL[Math.min(this.level, 20)] ?? 1000;
    this.gravityAccumMs += dtMs;

    while (this.gravityAccumMs >= gravityMs) {
      this.gravityAccumMs -= gravityMs;
      this.tryStepDown(/*fromGravity*/ true);
      if (this.active === null) return; // locked
    }

    // Lock delay countdown when grounded.
    if (this.active !== null && this.grounded) {
      this.lockDelayMs -= dtMs;
      if (this.lockDelayMs <= 0) {
        this.lockPiece();
      }
    }
  }

  /** Apply a discrete player action. */
  apply(action: Action): void {
    if (this.topOut || this.active === null) return;
    switch (action.type) {
      case "MoveLeft":
        this.tryMove(-1, 0);
        break;
      case "MoveRight":
        this.tryMove(1, 0);
        break;
      case "RotateCW":
        this.tryRotate("cw");
        break;
      case "RotateCCW":
        this.tryRotate("ccw");
        break;
      case "Rotate180":
        this.tryRotate("180");
        break;
      case "SoftDropStep":
        if (this.tryStepDown(false)) {
          this.score += 1;
        }
        break;
      case "HardDrop":
        this.hardDrop();
        break;
      case "Hold":
        this.holdSwap();
        break;
    }
  }

  private tryMove(dx: number, dy: number): boolean {
    if (this.active === null) return false;
    const candidate = movePiece(this.active, dx, dy);
    if (collides(this.board, candidate)) return false;
    this.active = candidate;
    this.lastWasRotate = false;
    this.onSuccessfulMoveOrRotate();
    return true;
  }

  private tryStepDown(fromGravity: boolean): boolean {
    if (this.active === null) return false;
    const candidate = movePiece(this.active, 0, 1);
    if (collides(this.board, candidate)) {
      // Grounded: piece can't move down. Start lock delay if not already.
      if (!this.grounded) {
        this.grounded = true;
        this.lockDelayMs = LOCK_DELAY_MS;
      }
      return false;
    }
    this.active = candidate;
    this.lastWasRotate = false;
    if (this.grounded) {
      // Re-airborne (e.g. from a wall kick that floats us back up). Reset
      // grounded state but keep the reset counter.
      this.grounded = false;
    }
    if (fromGravity) {
      // Gravity-driven step doesn't count as a lock-delay reset.
    } else {
      this.onSuccessfulMoveOrRotate();
    }
    return true;
  }

  private tryRotate(dir: RotDir): void {
    if (this.active === null) return;
    const result = tryRotate(this.board, this.active, dir);
    if (result === null) return;
    this.active = result.piece;
    this.lastWasRotate = true;
    this.lastKickIndex = result.kickIndex;
    // Re-evaluate grounded state.
    const test = movePiece(this.active, 0, 1);
    this.grounded = collides(this.board, test);
    if (this.grounded) this.onSuccessfulMoveOrRotate();
    else this.lockDelayMs = LOCK_DELAY_MS;
  }

  /** Called after any successful player-driven move/rotate. */
  private onSuccessfulMoveOrRotate(): void {
    if (this.grounded && this.lockResetCount < LOCK_RESET_CAP) {
      this.lockDelayMs = LOCK_DELAY_MS;
      this.lockResetCount++;
    }
  }

  private hardDrop(): void {
    if (this.active === null) return;
    const d = dropDistance(this.board, this.active);
    if (d > 0) {
      this.active = movePiece(this.active, 0, d);
      this.score += 2 * d;
      this.lastWasRotate = false;
    }
    this.lockPiece();
  }

  /**
   * Direct placement used by the AI driver: sets the active piece's rotation
   * and column, then hard-drops it. Bypasses move/rotate animation. Returns
   * true if the placement was legal (i.e. a non-colliding y exists above
   * the stack at that rot/col).
   *
   * Touched in: Task 9.
   */
  placeAndDrop(rot: import("./types").Rotation, x: number): boolean {
    if (this.active === null) return false;
    // Find a legal y for this rotation/column starting from the top.
    const kind = this.active.kind;
    let y = 0;
    while (y < BOARD_ROWS) {
      const candidate: Piece = { kind, rot, x, y };
      if (!collides(this.board, candidate)) {
        this.active = candidate;
        this.lastWasRotate = false;
        this.hardDrop();
        return true;
      }
      y++;
    }
    return false;
  }

  private holdSwap(): void {
    if (this.active === null || this.holdUsed) return;
    const held = this.hold;
    this.hold = this.active.kind;
    this.holdUsed = true;
    if (held === null) {
      const next = this.nextFromQueue();
      this.spawnPiece(next);
    } else {
      this.spawnPiece(held);
    }
    // Note: spawnPiece resets holdUsed to false; restore here.
    this.holdUsed = true;
  }

  // -- lock / line clear ----------------------------------------------------

  private lockPiece(): void {
    if (this.active === null) return;

    const lockedPiece = this.active;
    const tspin = detectTSpin({
      board: this.board,
      piece: lockedPiece,
      lastWasRotate: this.lastWasRotate,
      lastKickIndex: this.lastKickIndex,
    });

    // Top-out: lock entirely above the visible playfield.
    if (pieceEntirelyInBuffer(lockedPiece)) {
      this.topOut = true;
      this.active = null;
      this.events.push({ type: "TopOut" });
      return;
    }

    this.board = merge(this.board, lockedPiece);
    this.events.push({ type: "Lock", piece: lockedPiece, tspin });

    const result = clearLines(this.board);
    this.board = result.board;

    const linesCleared = result.cleared;

    // Combo logic
    if (linesCleared > 0) {
      this.combo += 1;
    } else {
      this.combo = -1;
    }

    const kind = classifyClear({
      linesCleared,
      isTSpin: tspin !== null,
      isMini: tspin === "mini",
    });

    // B2B logic — apply BEFORE updating state for next clear
    const b2bActive = this.b2b && clearIsB2BEligible(kind);

    const score = scoreClear({
      kind,
      level: this.level,
      combo: Math.max(this.combo, 0),
      b2bActive,
      perfectClear: result.perfectClear && linesCleared > 0,
    });

    this.score += score.points;
    this.lines += linesCleared;

    // Update B2B state
    if (clearIsB2BEligible(kind)) {
      this.b2b = true;
    } else if (clearBreaksB2B(kind)) {
      this.b2b = false;
    }
    // T-spin without lines neither extends nor breaks B2B.

    // Level progression: every 10 lines.
    const newLevel = Math.max(1, Math.floor(this.lines / 10) + 1);
    if (newLevel > this.level) this.level = newLevel;

    if (linesCleared > 0 || tspin !== null) {
      this.events.push({
        type: "LinesCleared",
        rows: result.rows,
        kind,
        points: score.points,
        garbage: score.garbage,
        level: this.level,
        linesTotal: this.lines,
        b2b: score.b2bApplied,
        combo: this.combo,
        perfectClear: result.perfectClear && linesCleared > 0,
      });
    }

    // Spawn next piece (or top-out if it overlaps)
    this.active = null;
    this.spawnNext();
  }
}

/** Helper: returns the column heights of a board (used by AI). */
export function columnHeights(board: Board): number[] {
  const heights = new Array<number>(BOARD_COLS).fill(0);
  for (let x = 0; x < BOARD_COLS; x++) {
    for (let y = 0; y < BOARD_ROWS; y++) {
      const row = board[y];
      if (row === undefined) continue;
      if (row[x] !== 0 && row[x] !== undefined) {
        heights[x] = BOARD_ROWS - y;
        break;
      }
    }
  }
  return heights;
}

/** Helper: count holes (empty cells with at least one filled cell above in same column). */
export function countHoles(board: Board): number {
  let holes = 0;
  for (let x = 0; x < BOARD_COLS; x++) {
    let seenFilled = false;
    for (let y = 0; y < BOARD_ROWS; y++) {
      const row = board[y];
      if (row === undefined) continue;
      const c = row[x];
      if (c !== 0 && c !== undefined) seenFilled = true;
      else if (seenFilled) holes++;
    }
  }
  return holes;
}

export { BOARD_COLS, BOARD_ROWS, VISIBLE_TOP, SHAPES, shapeCells };
