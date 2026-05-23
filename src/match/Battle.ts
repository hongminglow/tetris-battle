/**
 * Battle — owns the player and CPU GameStates, the AI driver, and (Task 10)
 * the garbage-exchange queues.
 *
 * Touched in: Task 9 (creates two states + AI driver), Task 10 (garbage
 * exchange + cancellation), Task 11 (winner detection + match flow).
 */

import { GameState, type GameEvent } from "../engine/game";
import { splitSeed } from "../engine/rng";
import { AiDriver } from "./ai-driver";

export type Side = "player" | "cpu";

/** A single garbage event pending insertion into a board. */
interface PendingGarbage {
  rows: number;
  /** Hole column shared by every row of this event. */
  holeCol: number;
}

export interface BattleEvent {
  side: Side;
  event: GameEvent;
}

export class Battle {
  readonly seed: number;
  player: GameState;
  cpu: GameState;
  private readonly ai = new AiDriver();
  /** Per-side incoming garbage that hasn't yet materialized on the board. */
  private incomingPlayer: PendingGarbage[] = [];
  private incomingCpu: PendingGarbage[] = [];
  /** Last computed pulse time for warning flash (Task 12). */
  warningPulse = 0;

  constructor(seed: number) {
    this.seed = seed;
    const [pSeed, cSeed] = splitSeed(seed);
    this.player = new GameState({ seed: pSeed });
    this.cpu = new GameState({ seed: cSeed });
  }

  /** Resets both boards and the AI for a rematch. */
  rematch(): void {
    const [pSeed, cSeed] = splitSeed(this.seed);
    this.player = new GameState({ seed: pSeed });
    this.cpu = new GameState({ seed: cSeed });
    this.incomingPlayer = [];
    this.incomingCpu = [];
    this.ai.reset();
  }

  incomingFor(side: Side): number {
    const queue = side === "player" ? this.incomingPlayer : this.incomingCpu;
    return queue.reduce((sum, g) => sum + g.rows, 0);
  }

  /** Advances the battle by dtMs. Returns events from both sides. */
  tick(dtMs: number): BattleEvent[] {
    const out: BattleEvent[] = [];

    // Step the player (input-driven externally — we just tick gravity here).
    if (!this.player.topOut) this.player.tick(dtMs);
    // Step the CPU (gravity + AI cadence).
    if (!this.cpu.topOut) {
      this.ai.tick(dtMs, this.cpu);
      this.cpu.tick(dtMs);
    }

    // Drain events from both sides.
    const playerEvents = this.player.drainEvents();
    const cpuEvents = this.cpu.drainEvents();
    for (const e of playerEvents) out.push({ side: "player", event: e });
    for (const e of cpuEvents) out.push({ side: "cpu", event: e });

    this.processSide("player", playerEvents);
    this.processSide("cpu", cpuEvents);

    // Update warning pulse for visual flash.
    this.warningPulse = (this.warningPulse + dtMs / 250) % 1;

    return out;
  }

  /** Apply this tick's events for one side: send garbage on clears,
   * materialize incoming on non-clearing locks. */
  private processSide(side: Side, events: GameEvent[]): void {
    let cleared = false;
    let locked = false;
    for (const e of events) {
      if (e.type === "Lock") locked = true;
      if (e.type === "LinesCleared") {
        cleared = true;
        if (e.garbage > 0) this.applySend(side, e.garbage);
      }
    }
    if (locked && !cleared) this.materializeIncoming(side);
  }

  /** Player has cleared lines; cancel against own incoming, send remainder. */
  private applySend(from: Side, lines: number): void {
    const myQueue = from === "player" ? this.incomingPlayer : this.incomingCpu;
    let remaining = lines;
    while (remaining > 0 && myQueue.length > 0) {
      const head = myQueue[0];
      if (head === undefined) break;
      if (head.rows <= remaining) {
        remaining -= head.rows;
        myQueue.shift();
      } else {
        head.rows -= remaining;
        remaining = 0;
      }
    }
    if (remaining > 0) {
      const targetQueue = from === "player" ? this.incomingCpu : this.incomingPlayer;
      const holeCol = Math.floor(this.deterministicSendRng(from) * 10);
      targetQueue.push({ rows: remaining, holeCol });
    }
  }

  /**
   * Materializes ALL pending garbage into the board on a non-clearing lock.
   * The pendingGarbage queue on the GameState is consumed before the next
   * spawn, so this just transfers the queue.
   */
  private materializeIncoming(side: Side): void {
    const queue = side === "player" ? this.incomingPlayer : this.incomingCpu;
    if (queue.length === 0) return;
    const gs = side === "player" ? this.player : this.cpu;
    while (queue.length > 0) {
      const g = queue.shift();
      if (g === undefined) break;
      gs.pendingGarbage.push({ rows: g.rows, holeCol: g.holeCol });
    }
  }

  /** Tiny PRNG for hole-column selection — independent per-side, varies by tick. */
  private sendCounter = 0;
  private deterministicSendRng(_from: Side): number {
    this.sendCounter = (this.sendCounter * 1103515245 + 12345) | 0;
    return ((this.sendCounter >>> 16) & 0x7fff) / 0x7fff;
  }
}
