/**
 * Procedural chiptune BGM player.
 *
 * Plays one of several `BgmTrack` patterns (a step grid of lead + bass
 * notes), schedules them ahead of `AudioContext.currentTime` via the
 * standard lookahead-scheduler pattern (`setInterval` every 25 ms,
 * scheduling 200 ms ahead) so the loop is gapless and dt-independent.
 *
 * Output goes through a per-BGM `GainNode` plugged into the SfxEngine
 * master node, so the global mute toggle silences music too.
 *
 * Tracks defined here:
 *   - MENU_TRACK   — bright C-major arpeggios at 112 BPM for the title/menu.
 *   - BATTLE_TRACK — driving A-minor riff at 132 BPM for active matches.
 *
 * Touched in: post-MVP polish pass; menu track added in subsequent pass.
 */

const LOOKAHEAD_SEC = 0.2;

// Note name → frequency (Hz). Two octaves of usable range.
const C3 = 130.81;
const E3 = 164.81;
const F3 = 174.61;
const G3 = 196.0;
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
const F5 = 698.46;
const G5 = 783.99;
const A5 = 880;

export interface BgmTrack {
  /** Beats per minute. 1 step = one 16th note = 60/bpm/4 sec. */
  bpm: number;
  /** Step grid for the lead voice. `null` = silence on that step. */
  lead: ReadonlyArray<number | null>;
  /** Step grid for the bass voice. Length must equal `lead.length`. */
  bass: ReadonlyArray<number | null>;
  /** Lead oscillator type. Default `"square"`. */
  leadType?: OscillatorType;
  /** Bass oscillator type. Default `"triangle"`. */
  bassType?: OscillatorType;
  /** Lead note duration in steps. Default 1.7. */
  leadDurSteps?: number;
  /** Bass note duration in steps. Default 3.5. */
  bassDurSteps?: number;
  /** Lead peak gain. Default 0.16. */
  leadGain?: number;
  /** Bass peak gain. Default 0.22. */
  bassGain?: number;
  /** Hi-hat tick step interval. 0 disables. Default 2 (every 8th note). */
  hatEvery?: number;
  /** Hi-hat peak gain. Default 0.04. */
  hatGain?: number;
  /** Per-track bus gain (post-mix into SFX master). Default 0.35. */
  busGain?: number;
}

/** Driving A-minor riff for the active match. */
export const BATTLE_TRACK: BgmTrack = {
  bpm: 132,
  lead: [
    A4, null, E5, null, A4, null, E5, null,
    C5, null, A5, null, C5, null, A5, null,
    B4, null, G5, null, B4, null, G5, null,
    A4, null, E5, null, C5, null, A4, null,
    A4, null, E5, null, A4, null, E5, null,
    D5, null, A5, null, D5, null, A5, null,
    G4, null, D5, null, F4, null, C5, null,
    E4, null, A4, null, A3, null, null, null,
  ],
  bass: [
    A3, null, null, null, A3, null, null, null, A3, null, null, null, A3, null, null, null,
    E4, null, null, null, E4, null, null, null, E4, null, null, null, E4, null, null, null,
    D4, null, null, null, D4, null, null, null, F4, null, null, null, F4, null, null, null,
    E4, null, null, null, E4, null, null, null, A3, null, null, null, A3, null, null, null,
  ],
  leadType: "square",
  bassType: "triangle",
};

/**
 * Cheerful C-major theme for the title screen / menu. Slower (112 BPM),
 * sparser, no hat — feels welcoming rather than urgent.
 *
 * Chord progression: C – G – F – C  (I – V – IV – I), classic and friendly.
 */
export const MENU_TRACK: BgmTrack = {
  bpm: 112,
  lead: [
    // bar 1 — C major arpeggio bouncing up and back
    G4, null, C5, null, E5, null, G5, null, E5, null, C5, null, E5, null, null, null,
    // bar 2 — G major / V chord, bright move
    G4, null, B4, null, D5, null, G5, null, F5, null, D5, null, B4, null, null, null,
    // bar 3 — F major / IV chord, soft warmth
    F4, null, A4, null, C5, null, F5, null, E5, null, C5, null, A4, null, null, null,
    // bar 4 — back to C major, resolve
    E4, null, G4, null, C5, null, E5, null, G5, null, E5, null, C5, null, null, null,
  ],
  bass: [
    // I (C)
    C3, null, null, null, G3, null, null, null, C3, null, null, null, G3, null, null, null,
    // V (G)
    G3, null, null, null, D4, null, null, null, G3, null, null, null, D4, null, null, null,
    // IV (F)
    F3, null, null, null, C4, null, null, null, F3, null, null, null, A3, null, null, null,
    // I (C)
    C3, null, null, null, G3, null, null, null, C3, null, null, null, E3, null, null, null,
  ],
  leadType: "triangle",
  bassType: "triangle",
  leadGain: 0.15,
  bassGain: 0.20,
  hatEvery: 0, // no hat — softer feel
  busGain: 0.30,
};

interface AudioGraph {
  ctx: AudioContext;
  node: AudioNode;
}

export class BgmPlayer {
  private playing = false;
  private nextStepTime = 0;
  private step = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Globally enabled (toggled by user via N). */
  enabled = false;
  private getGraph: () => AudioGraph | null;
  private busGain: GainNode | null = null;
  private currentTrack: BgmTrack | null = null;
  /** ms remaining on the current track's full sweep — used purely for diagnostics. */

  constructor(getGraph: () => AudioGraph | null) {
    this.getGraph = getGraph;
  }

  /**
   * Switch to a different track.
   *
   * - If `track === null`, stops playback (but leaves `enabled` alone).
   * - If `track === currentTrack`, no-op.
   * - Otherwise stops the current track and starts the new one (if enabled).
   */
  setTrack(track: BgmTrack | null): void {
    if (track === this.currentTrack) return;
    const wasPlaying = this.playing;
    if (wasPlaying) this.stop();
    this.currentTrack = track;
    if (track !== null && this.enabled) this.start();
  }

  /** Toggle music on/off. Returns the new enabled state. */
  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled && this.currentTrack !== null && !this.playing) this.start();
    else if (!this.enabled && this.playing) this.stop();
    return this.enabled;
  }

  /** Begin scheduling notes for the current track, if any. */
  start(): void {
    if (this.playing || this.currentTrack === null) return;
    const graph = this.getGraph();
    if (graph === null) return;
    if (graph.ctx.state === "suspended") return; // wait for user gesture
    this.playing = true;
    this.busGain = graph.ctx.createGain();
    this.busGain.gain.value = this.currentTrack.busGain ?? 0.35;
    this.busGain.connect(graph.node);
    this.step = 0;
    this.nextStepTime = graph.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.scheduler(), 25);
  }

  /** Cancel scheduling and disconnect the per-track bus. */
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
    const track = this.currentTrack;
    if (graph === null || this.busGain === null || track === null) return;
    const ctx = graph.ctx;
    const stepSec = 60 / track.bpm / 4;
    const horizon = ctx.currentTime + LOOKAHEAD_SEC;
    while (this.nextStepTime < horizon) {
      this.scheduleStep(ctx, this.busGain, track, this.step, this.nextStepTime, stepSec);
      this.nextStepTime += stepSec;
      this.step = (this.step + 1) % track.lead.length;
    }
  }

  private scheduleStep(
    ctx: AudioContext,
    bus: GainNode,
    track: BgmTrack,
    step: number,
    when: number,
    stepSec: number,
  ): void {
    const lead = track.lead[step];
    if (lead !== null && lead !== undefined) {
      blip(
        ctx,
        bus,
        lead,
        when,
        stepSec * (track.leadDurSteps ?? 1.7),
        track.leadType ?? "square",
        track.leadGain ?? 0.16,
      );
    }
    const bass = track.bass[step];
    if (bass !== null && bass !== undefined) {
      blip(
        ctx,
        bus,
        bass,
        when,
        stepSec * (track.bassDurSteps ?? 3.5),
        track.bassType ?? "triangle",
        track.bassGain ?? 0.22,
      );
    }
    const hatEvery = track.hatEvery ?? 2;
    if (hatEvery > 0 && step % hatEvery === 0) {
      hat(ctx, bus, when, track.hatGain ?? 0.04);
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

function hat(ctx: AudioContext, dest: AudioNode, when: number, peak: number): void {
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
