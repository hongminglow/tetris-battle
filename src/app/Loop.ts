/**
 * Fixed-timestep game loop.
 * Calls update(dtMs) at a constant cadence (default 60 Hz) and render(alpha)
 * once per RAF tick. The loop drives all game logic.
 *
 * Touched in: Task 1 (created), refined as more systems are added.
 */

export type UpdateFn = (dtMs: number) => void;
export type RenderFn = (alphaFrame: number) => void;

export interface LoopOptions {
  /** Fixed step duration in ms. Default 16.6667 (60 Hz). */
  stepMs?: number;
  /** Maximum number of update steps allowed per frame, to recover from stalls. */
  maxStepsPerFrame?: number;
}

export class Loop {
  private readonly stepMs: number;
  private readonly maxStepsPerFrame: number;
  private accumulator = 0;
  private lastTimeMs = 0;
  private rafHandle: number | null = null;
  private running = false;
  private readonly update: UpdateFn;
  private readonly render: RenderFn;

  constructor(update: UpdateFn, render: RenderFn, opts: LoopOptions = {}) {
    this.update = update;
    this.render = render;
    this.stepMs = opts.stepMs ?? 1000 / 60;
    this.maxStepsPerFrame = opts.maxStepsPerFrame ?? 5;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimeMs = performance.now();
    this.accumulator = 0;
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    const elapsed = Math.min(now - this.lastTimeMs, 250); // clamp absurd gaps
    this.lastTimeMs = now;
    this.accumulator += elapsed;

    let steps = 0;
    while (this.accumulator >= this.stepMs && steps < this.maxStepsPerFrame) {
      this.update(this.stepMs);
      this.accumulator -= this.stepMs;
      steps++;
    }
    // If we ran out of steps, drop the leftover so we don't spiral.
    if (steps === this.maxStepsPerFrame) this.accumulator = 0;

    const alpha = this.accumulator / this.stepMs;
    this.render(alpha);

    this.rafHandle = requestAnimationFrame(this.tick);
  };
}
