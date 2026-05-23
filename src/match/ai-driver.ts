/**
 * AI driver — paces the Dellacherie AI's placements on a CPU GameState.
 *
 * Cadence: 1 piece per `max(300, 1200 − 60·min(level, 15))` ms.
 * On each cadence tick: compute best placement for current piece, then
 * call gameState.placeAndDrop(rot, x).
 *
 * Touched in: Task 9.
 */

import { bestPlacement } from "../ai/dellacherie";
import { aiCadenceMs, type GameState } from "../engine/game";

export class AiDriver {
  private cadenceMsRemaining: number;

  constructor() {
    this.cadenceMsRemaining = 800; // initial delay so player sees the start
  }

  reset(): void {
    this.cadenceMsRemaining = 800;
  }

  tick(dtMs: number, gs: GameState): void {
    if (gs.topOut || gs.active === null) return;
    this.cadenceMsRemaining -= dtMs;
    if (this.cadenceMsRemaining > 0) return;
    const placement = bestPlacement(gs.board, gs.active);
    if (placement !== null) {
      gs.placeAndDrop(placement.rot, placement.x);
    } else {
      // No legal placement — the CPU will top-out next spawn anyway. Force
      // a hard drop in place to advance the game.
      gs.apply({ type: "HardDrop" });
    }
    this.cadenceMsRemaining = aiCadenceMs(gs.level);
  }
}
