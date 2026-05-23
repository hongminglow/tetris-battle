/**
 * Procedural chiptune BGM loop.
 *
 * Schedules an A-minor 4-bar pattern with a lead voice (square), a bass
 * voice (triangle), and a soft hi-hat tick. Re-fills the schedule every
 * ~50 ms so the loop is gapless and dt-stable.
 *
 * Plays into the SfxEngine's master node so the global mute toggle also
 * silences music.
 *
 * Touched in: post-MVP polish pass.
 */

const BPM = 132;
// 1 step = one 16th note.
const STEP_SEC = 60 / BPM / 4;
const LOOKAHEAD_SEC = 0.2;

// Note names → frequencies (Hz). A minor scale, octaves 3..5.
const A3 = 220;
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const F4 = 349.23;
const G4 = 392.0;
const A4 = 440;
const B4 = 493.88;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880;

/** A 32-step (2 bars × 16 ths) lead phrase repeated 2× = 64 steps. */
const LEAD: ReadonlyArray<number | null> = [
  // bar 1 — A minor arpeggio rising
  A4, null, E5, null, A4, null, E5, null,
  C5, null, A5, null, C5, null, A5, null,
  // bar 2 — descending answer
  B4, null, G5, null, B4, null, G5, null,
  A4, null, E5, null, C5, null, A4, null,
  // bar 3 — repeat with a twist
  A4, null, E5, null, A4, null, E5, null,
  D5, null, A5, null, D5, null, A5, null,
  // bar 4 — turnaround
  G4, null, D5, null, F4, null, C5, null,
  E4, null, A4, null, A3, null, null, null,
];

/** Bass: quarter-note pattern (4 steps per note × 16 notes = 64). */
const BASS: ReadonlyArray<number | null> = [
  A3, null, null, null, A3, null, null, null, A3, null, null, null, A3, null, null, null,
  E4, null, null, null, E4, null, null, null, E4, null, null, null, E4, null, null, null,
  D4, null, null, null, D4, null, null, null, F4, null, null, null, F4, null, null, null,
  E4, null, null, null, E4, null, null, null, A3, null, null, null, A3, null, null, null,
];

const TOTAL_STEPS = LEAD.length;

interface AudioGraph {
  ctx: AudioContext;
  node: AudioNode;
}

export class BgmPlayer {
  private playing = false;
  private nextStepTime = 0;
  private step = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  enabled = false;
  private getGraph: () => AudioGraph | null;
  private busGain: GainNode | null = null;

  constructor(getGraph: () => AudioGraph | null) {
    this.getGraph = getGraph;
  }

  /** Toggle music on/off. Returns the new enabled state. */
  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled && !this.playing) this.start();
    else if (!this.enabled && this.playing) this.stop();
    return this.enabled;
  }

  start(): void {
    if (this.playing) return;
    const graph = this.getGraph();
    if (graph === null) return;
    if (graph.ctx.state === "suspended") return; // wait for gesture
    this.playing = true;
    this.busGain = graph.ctx.createGain();
    this.busGain.gain.value = 0.35;
    this.busGain.connect(graph.node);
    this.step = 0;
    this.nextStepTime = graph.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.scheduler(), 25);
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.busGain !== null) {
      try {
        this.busGain.disconnect();
      } catch {
        // ignore
      }
      this.busGain = null;
    }
  }

  private scheduler(): void {
    const graph = this.getGraph();
    if (graph === null || this.busGain === null) return;
    const ctx = graph.ctx;
    const horizon = ctx.currentTime + LOOKAHEAD_SEC;
    while (this.nextStepTime < horizon) {
      this.scheduleStep(ctx, this.busGain, this.step, this.nextStepTime);
      this.nextStepTime += STEP_SEC;
      this.step = (this.step + 1) % TOTAL_STEPS;
    }
  }

  private scheduleStep(
    ctx: AudioContext,
    bus: GainNode,
    step: number,
    when: number,
  ): void {
    const lead = LEAD[step];
    if (lead !== null && lead !== undefined) {
      blip(ctx, bus, lead, when, STEP_SEC * 1.7, "square", 0.16);
    }
    const bass = BASS[step];
    if (bass !== null && bass !== undefined) {
      blip(ctx, bus, bass, when, STEP_SEC * 3.5, "triangle", 0.22);
    }
    // Hi-hat tick every 8th note (every 2 steps).
    if (step % 2 === 0) {
      hat(ctx, bus, when, 0.04);
    }
  }
}

function blip(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  when: number,
  durSec: number,
  type: OscillatorType,
  peak: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(peak, when + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, when + durSec);
  osc.connect(env).connect(dest);
  osc.start(when);
  osc.stop(when + durSec + 0.02);
}

function hat(
  ctx: AudioContext,
  dest: AudioNode,
  when: number,
  peak: number,
): void {
  // Short noise burst via a high-frequency square + fast envelope.
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(7200, when);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(peak, when + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
  osc.connect(env).connect(dest);
  osc.start(when);
  osc.stop(when + 0.05);
}
