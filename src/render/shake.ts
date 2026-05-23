/**
 * Screen-shake helper.
 *
 * Manages a list of active shake events (per side). Each event has an
 * amplitude (px) and a remaining time. The current offset is the sum of
 * all active shakes' contributions, decayed linearly.
 *
 * Touched in: Task 12 (extracted from main.ts).
 */

export interface ShakeEvent {
  px: number;
  ttlMs: number;
  initialMs: number;
}

export class ShakeBuffer {
  private events: ShakeEvent[] = [];

  push(px: number, durationMs: number): void {
    this.events.push({ px, ttlMs: durationMs, initialMs: durationMs });
  }

  tick(dtMs: number): void {
    for (const e of this.events) e.ttlMs -= dtMs;
    this.events = this.events.filter((e) => e.ttlMs > 0);
  }

  /** Returns the current frame's (x, y) offset in pixels. */
  offset(): { x: number; y: number } {
    if (this.events.length === 0) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    for (const e of this.events) {
      const t = e.ttlMs / e.initialMs;
      const amp = e.px * t;
      x += (Math.random() * 2 - 1) * amp;
      y += (Math.random() * 2 - 1) * amp;
    }
    return { x, y };
  }

  clear(): void {
    this.events = [];
  }
}
