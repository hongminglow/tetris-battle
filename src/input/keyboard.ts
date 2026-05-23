/**
 * Keyboard input with DAS (Delayed Auto-Shift) + ARR (Auto-Repeat Rate).
 *
 * Bindings (locked):
 *   ← / →   move
 *   ↓        soft drop
 *   ↑        rotate CW
 *   Z        rotate CCW
 *   X        rotate CW (alt)
 *   A        rotate 180 (modern guideline extension)
 *   Space    hard drop
 *   C / Shift hold
 *   P / Esc  pause (handled higher up)
 *   ?        controls overlay (handled higher up)
 *
 * DAS = 167 ms initial delay before auto-shift.
 * ARR = 33 ms repeat. ARR = 0 would be "instant" — we intentionally keep
 * a finite ARR so movements feel deliberate.
 *
 * Soft drop: while held, emits SoftDropStep at a 20× rate (≈1 cell per
 * frame at 60 Hz) — effectively "fast fall but still per-cell".
 *
 * Touched in: Task 4.
 */

import type { Action } from "../engine/game";

export const DAS_MS = 167;
export const ARR_MS = 33;
export const SOFT_DROP_INTERVAL_MS = 16.7; // ~20× normal gravity at level 1

type HeldDir = "left" | "right" | null;

export interface KeyboardOptions {
  /** Element to attach listeners to. Defaults to window. */
  target?: EventTarget;
  /** Callback invoked when a high-level intent fires (pause, etc). */
  onIntent?: (intent: "pause" | "controls" | "restart" | "rematch") => void;
}

export class Keyboard {
  private heldDir: HeldDir = null;
  private dasTimer = 0;
  private arrTimer = 0;
  private dasPrimed = false;

  private softDropHeld = false;
  private softDropTimer = 0;

  private readonly queued: Action[] = [];
  private readonly target: EventTarget;
  private readonly onIntent: KeyboardOptions["onIntent"];

  constructor(opts: KeyboardOptions = {}) {
    this.target = opts.target ?? window;
    this.onIntent = opts.onIntent;
    this.attach();
  }

  private attach(): void {
    this.target.addEventListener("keydown", this.onKeyDown as EventListener);
    this.target.addEventListener("keyup", this.onKeyUp as EventListener);
  }

  destroy(): void {
    this.target.removeEventListener("keydown", this.onKeyDown as EventListener);
    this.target.removeEventListener("keyup", this.onKeyUp as EventListener);
  }

  /** Drains and returns the queued actions. Called once per game tick. */
  drain(dtMs: number): Action[] {
    // Auto-repeat handling for left/right
    if (this.heldDir !== null) {
      if (this.dasPrimed) {
        this.dasTimer -= dtMs;
        if (this.dasTimer <= 0) {
          this.dasPrimed = false;
          this.arrTimer = 0;
          this.queued.push(this.heldDir === "left" ? { type: "MoveLeft" } : { type: "MoveRight" });
        }
      } else {
        this.arrTimer -= dtMs;
        while (this.arrTimer <= 0) {
          this.arrTimer += ARR_MS;
          this.queued.push(this.heldDir === "left" ? { type: "MoveLeft" } : { type: "MoveRight" });
        }
      }
    }

    if (this.softDropHeld) {
      this.softDropTimer -= dtMs;
      while (this.softDropTimer <= 0) {
        this.softDropTimer += SOFT_DROP_INTERVAL_MS;
        this.queued.push({ type: "SoftDropStep" });
      }
    }

    const out = this.queued.slice();
    this.queued.length = 0;
    return out;
  }

  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.repeat) return;
    const k = ev.key;

    switch (k) {
      case "ArrowLeft":
        ev.preventDefault();
        this.startDir("left");
        break;
      case "ArrowRight":
        ev.preventDefault();
        this.startDir("right");
        break;
      case "ArrowDown":
        ev.preventDefault();
        this.softDropHeld = true;
        this.softDropTimer = 0;
        this.queued.push({ type: "SoftDropStep" });
        break;
      case "ArrowUp":
      case "x":
      case "X":
        ev.preventDefault();
        this.queued.push({ type: "RotateCW" });
        break;
      case "z":
      case "Z":
        ev.preventDefault();
        this.queued.push({ type: "RotateCCW" });
        break;
      case "a":
      case "A":
        ev.preventDefault();
        this.queued.push({ type: "Rotate180" });
        break;
      case " ":
        ev.preventDefault();
        this.queued.push({ type: "HardDrop" });
        break;
      case "c":
      case "C":
      case "Shift":
        ev.preventDefault();
        this.queued.push({ type: "Hold" });
        break;
      case "p":
      case "P":
      case "Escape":
        ev.preventDefault();
        this.onIntent?.("pause");
        break;
      case "?":
        this.onIntent?.("controls");
        break;
      case "r":
      case "R":
        this.onIntent?.("rematch");
        break;
      default:
        break;
    }
  };

  private readonly onKeyUp = (ev: KeyboardEvent): void => {
    const k = ev.key;
    switch (k) {
      case "ArrowLeft":
        if (this.heldDir === "left") this.stopDir();
        break;
      case "ArrowRight":
        if (this.heldDir === "right") this.stopDir();
        break;
      case "ArrowDown":
        this.softDropHeld = false;
        break;
      default:
        break;
    }
  };

  private startDir(dir: "left" | "right"): void {
    this.heldDir = dir;
    this.dasPrimed = true;
    this.dasTimer = DAS_MS;
    this.arrTimer = 0;
    // Initial press emits a single move immediately.
    this.queued.push(dir === "left" ? { type: "MoveLeft" } : { type: "MoveRight" });
  }

  private stopDir(): void {
    this.heldDir = null;
    this.dasPrimed = false;
  }
}
