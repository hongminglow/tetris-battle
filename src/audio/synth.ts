/**
 * Procedural Web Audio SFX engine.
 *
 * Zero asset dependencies — every sound is synthesized at runtime via
 * OscillatorNode + GainNode envelopes, so the whole audio system fits in a
 * few KB and respects the master prompt's "no runtime deps" / "no assets"
 * constraints.
 *
 * Browser autoplay policy: AudioContext starts suspended until a user
 * gesture, so we lazily resume() on the first call to play().
 *
 * Touched in: post-MVP polish pass.
 */

export type SfxName =
  | "move"
  | "rotate"
  | "lock"
  | "hardDrop"
  | "hold"
  | "single"
  | "double"
  | "triple"
  | "tetris"
  | "tspin"
  | "perfect"
  | "combo"
  | "countdown"
  | "go"
  | "ko"
  | "win"
  | "garbageWarn";

type Osc = OscillatorType;

interface Note {
  freq: number;
  durMs: number;
  /** Start delay relative to play() time, in ms. */
  delayMs?: number;
  type?: Osc;
  /** Peak gain (0..1). Default 0.25. */
  gain?: number;
  /** Quadratic frequency sweep target (Hz). */
  toFreq?: number;
}

interface Recipe {
  notes: Note[];
}

const RECIPES: Readonly<Record<SfxName, Recipe>> = {
  move: { notes: [{ freq: 220, durMs: 30, type: "square", gain: 0.08 }] },
  rotate: { notes: [{ freq: 330, durMs: 50, type: "square", gain: 0.10 }] },
  lock: { notes: [{ freq: 110, durMs: 80, type: "triangle", gain: 0.18, toFreq: 70 }] },
  hardDrop: {
    notes: [
      { freq: 260, durMs: 70, type: "sawtooth", gain: 0.22, toFreq: 80 },
      { freq: 90, durMs: 90, type: "triangle", gain: 0.18, delayMs: 30 },
    ],
  },
  hold: {
    notes: [
      { freq: 380, durMs: 70, type: "sine", gain: 0.16 },
      { freq: 280, durMs: 80, type: "sine", gain: 0.14, delayMs: 60 },
    ],
  },
  single: { notes: [{ freq: 660, durMs: 180, type: "sine", gain: 0.20 }] },
  double: {
    notes: [
      { freq: 660, durMs: 180, type: "sine", gain: 0.18 },
      { freq: 880, durMs: 220, type: "sine", gain: 0.18, delayMs: 90 },
    ],
  },
  triple: {
    notes: [
      { freq: 660, durMs: 140, type: "sine", gain: 0.18 },
      { freq: 880, durMs: 140, type: "sine", gain: 0.18, delayMs: 80 },
      { freq: 1100, durMs: 220, type: "sine", gain: 0.18, delayMs: 160 },
    ],
  },
  tetris: {
    notes: [
      { freq: 440, durMs: 360, type: "triangle", gain: 0.18 },
      { freq: 660, durMs: 360, type: "triangle", gain: 0.18, delayMs: 30 },
      { freq: 880, durMs: 360, type: "triangle", gain: 0.16, delayMs: 60 },
      { freq: 1320, durMs: 380, type: "sine", gain: 0.16, delayMs: 90 },
    ],
  },
  tspin: {
    notes: [
      { freq: 520, durMs: 110, type: "sawtooth", gain: 0.18, toFreq: 780 },
      { freq: 780, durMs: 180, type: "sine", gain: 0.16, delayMs: 90 },
    ],
  },
  perfect: {
    notes: [
      { freq: 523, durMs: 200, type: "triangle", gain: 0.20 },
      { freq: 659, durMs: 200, type: "triangle", gain: 0.20, delayMs: 110 },
      { freq: 784, durMs: 220, type: "triangle", gain: 0.20, delayMs: 220 },
      { freq: 1047, durMs: 380, type: "sine", gain: 0.22, delayMs: 320 },
    ],
  },
  combo: { notes: [{ freq: 880, durMs: 90, type: "square", gain: 0.14 }] },
  countdown: { notes: [{ freq: 440, durMs: 120, type: "sine", gain: 0.18 }] },
  go: {
    notes: [
      { freq: 660, durMs: 140, type: "triangle", gain: 0.22 },
      { freq: 990, durMs: 240, type: "triangle", gain: 0.22, delayMs: 80 },
    ],
  },
  ko: {
    notes: [
      { freq: 440, durMs: 700, type: "sawtooth", gain: 0.24, toFreq: 90 },
      { freq: 220, durMs: 500, type: "triangle", gain: 0.18, delayMs: 200, toFreq: 60 },
    ],
  },
  win: {
    notes: [
      { freq: 523, durMs: 200, type: "triangle", gain: 0.20 },
      { freq: 659, durMs: 200, type: "triangle", gain: 0.20, delayMs: 140 },
      { freq: 784, durMs: 280, type: "triangle", gain: 0.20, delayMs: 280 },
      { freq: 1047, durMs: 420, type: "sine", gain: 0.22, delayMs: 420 },
    ],
  },
  garbageWarn: {
    notes: [{ freq: 130, durMs: 90, type: "sawtooth", gain: 0.16, toFreq: 90 }],
  },
};

export class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;
  private warnCooldownMs = 0;

  private ensureCtx(): AudioContext | null {
    if (this.ctx !== null) return this.ctx;
    const Ctor =
      typeof window !== "undefined"
        ? (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (Ctor === undefined) return null;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
    } catch {
      return null;
    }
    return this.ctx;
  }

  /** Resume the AudioContext (must be called from a user gesture). */
  resume(): void {
    const ctx = this.ensureCtx();
    if (ctx !== null && ctx.state === "suspended") void ctx.resume();
  }

  /** Master destination node — exposed so BGM can plug into the same graph. */
  destination(): { ctx: AudioContext; node: AudioNode } | null {
    const ctx = this.ensureCtx();
    if (ctx === null || this.master === null) return null;
    return { ctx, node: this.master };
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.master !== null) this.master.gain.value = this.enabled ? 0.6 : 0;
    return this.enabled;
  }

  /** Plays an SFX by name. Cheap; ignored when disabled or before a gesture. */
  play(name: SfxName): void {
    if (!this.enabled) return;
    const ctx = this.ensureCtx();
    if (ctx === null || this.master === null) return;
    if (ctx.state === "suspended") return; // wait for resume()

    // Garbage warning is on a tight cooldown so it doesn't machine-gun.
    if (name === "garbageWarn") {
      if (this.warnCooldownMs > 0) return;
      this.warnCooldownMs = 220;
    }

    const recipe = RECIPES[name];
    const t0 = ctx.currentTime;
    for (const note of recipe.notes) {
      const start = t0 + (note.delayMs ?? 0) / 1000;
      const dur = note.durMs / 1000;
      const peak = note.gain ?? 0.25;

      const osc = ctx.createOscillator();
      osc.type = note.type ?? "sine";
      osc.frequency.setValueAtTime(note.freq, start);
      if (note.toFreq !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(note.toFreq, 1),
          start + dur,
        );
      }

      // Fast attack, exponential decay envelope.
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(peak, start + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      osc.connect(env).connect(this.master);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    }
  }

  /** Internal cooldown bookkeeping; called once per game tick. */
  tick(dtMs: number): void {
    if (this.warnCooldownMs > 0) this.warnCooldownMs -= dtMs;
  }
}
