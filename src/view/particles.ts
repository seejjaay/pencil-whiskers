/**
 * Canvas-only juice: a small particle system (stars, hearts, bubbles, dots) and a gentle
 * screen shake. View-only randomness (Math.random) is fine here: gameplay never reads it.
 */
import { CREAM, INK, circle, heartPath, starPath } from './art/draw';

export type ParticleKind = 'star' | 'heart' | 'bubble' | 'dot';

interface P {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  gravity: number;
}

export interface BurstOpts {
  speed?: [number, number];
  size?: [number, number];
  life?: [number, number];
  colors?: readonly string[];
  /** px/s^2; bubbles float up with a negative value. */
  gravity?: number;
  /** Bias the direction upward (0 = all directions, 1 = straight up). */
  up?: number;
  spreadX?: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const MAX = 450;

export class Particles {
  private ps: P[] = [];

  burst(kind: ParticleKind, x: number, y: number, count: number, o: BurstOpts = {}): void {
    const colors = o.colors ?? ['#ffd65c', '#f39bbb', '#9fd3f0'];
    for (let i = 0; i < count && this.ps.length < MAX; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(...(o.speed ?? [80, 260]));
      const up = o.up ?? 0;
      this.ps.push({
        kind,
        x: x + rand(-1, 1) * (o.spreadX ?? 0),
        y,
        vx: Math.cos(a) * sp * (1 - up * 0.6),
        vy: Math.sin(a) * sp * (1 - up) - up * sp,
        age: 0,
        life: rand(...(o.life ?? [500, 900])),
        size: rand(...(o.size ?? [5, 10])),
        rot: Math.random() * Math.PI,
        vr: rand(-6, 6),
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: o.gravity ?? 520,
      });
    }
  }

  update(dtMs: number): void {
    const dt = Math.min(0.05, dtMs / 1000);
    for (const p of this.ps) {
      p.age += dtMs;
      p.vy += p.gravity * dt;
      p.vx *= 1 - 1.6 * dt;
      p.vy *= 1 - 0.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.ps = this.ps.filter((p) => p.age < p.life);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.ps) {
      const k = p.age / p.life;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const s = p.size * (k < 0.15 ? k / 0.15 : 1);
      switch (p.kind) {
        case 'star':
          starPath(ctx, p.x, p.y, s, p.rot);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = INK;
          ctx.stroke();
          break;
        case 'heart':
          heartPath(ctx, p.x, p.y, s * 0.8);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = INK;
          ctx.stroke();
          break;
        case 'bubble':
          circle(ctx, p.x, p.y, s);
          ctx.fillStyle = 'rgba(238, 248, 255, 0.55)';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(91, 59, 74, 0.6)';
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(p.x - s * 0.3, p.y - s * 0.3, s * 0.35, Math.PI * 1.1, Math.PI * 1.7);
          ctx.strokeStyle = CREAM;
          ctx.stroke();
          break;
        case 'dot':
          circle(ctx, p.x, p.y, s * 0.6);
          ctx.fillStyle = p.color;
          ctx.fill();
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.ps = [];
  }
}

/** Gentle, decaying screen shake. */
export class Shake {
  private amount = 0;
  private last = 0;

  kick(px: number): void {
    this.amount = Math.min(14, this.amount + px);
  }

  offset(now: number): { x: number; y: number } {
    const dt = this.last ? Math.min(100, now - this.last) : 16;
    this.last = now;
    this.amount *= Math.pow(0.0025, dt / 1000); // ~-6 dB per 110 ms
    if (this.amount < 0.3) {
      this.amount = 0;
      return { x: 0, y: 0 };
    }
    return { x: Math.sin(now / 17) * this.amount, y: Math.cos(now / 23) * this.amount * 0.7 };
  }
}
