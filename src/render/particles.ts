/**
 * Particle system — line-clear bursts.
 *
 * On any line clear, spawn ~8 particles per cleared cell. Each has random
 * outward velocity, gravity 600 px/s², and a 600 ms lifetime. Drawn with
 * additive blending in the cleared piece's color.
 *
 * Touched in: Task 12.
 */

import { CELL_PX, PIECE_COLORS } from "./theme";
import type { PieceKind } from "../engine/types";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  ttlMs: number;
  initialMs: number;
}

const GRAVITY = 0.0006; // px / ms²

export class ParticleField {
  private particles: Particle[] = [];

  /** Emit ~8 particles per cleared cell at the given pixel positions. */
  emitClear(rows: number[], cellPxOffsetY: number, color: string): void {
    for (const visibleRowY of rows) {
      for (let col = 0; col < 10; col++) {
        const baseX = col * CELL_PX + CELL_PX / 2;
        const baseY = visibleRowY * CELL_PX + CELL_PX / 2 + cellPxOffsetY;
        for (let i = 0; i < 8; i++) {
          this.particles.push({
            x: baseX,
            y: baseY,
            vx: (Math.random() - 0.5) * 0.5,
            vy: -Math.random() * 0.6,
            color,
            ttlMs: 600,
            initialMs: 600,
          });
        }
      }
    }
  }

  /** Convenience: pick a random piece color. */
  static pieceColor(kind?: PieceKind): string {
    if (kind === undefined) return "#e7ecf3";
    return PIECE_COLORS[kind];
  }

  tick(dtMs: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dtMs;
      p.y += p.vy * dtMs;
      p.vy += GRAVITY * dtMs;
      p.ttlMs -= dtMs;
    }
    this.particles = this.particles.filter((p) => p.ttlMs > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.particles.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      const alpha = Math.max(0, p.ttlMs / p.initialMs);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.restore();
  }

  clear(): void {
    this.particles = [];
  }
}
