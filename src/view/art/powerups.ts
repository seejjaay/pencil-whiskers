/** Power-up art: a ribboned capsule for falling items, and small icons for each kind. */
import type { PowerKind } from '../../game/powerups';
import { INK, circle, line, outlined, phase, roundRect } from './draw';

const TINT: Readonly<Record<PowerKind, string>> = { slow: '#bfe3ff', erase: '#ffd1e3', barrier: '#d8f3c8' };

/** Icon for a power kind, centred on (x, y), roughly `s` px across. */
export function drawPowerIcon(ctx: CanvasRenderingContext2D, kind: PowerKind, x: number, y: number, s: number): void {
  const r = s / 2;
  ctx.save();
  switch (kind) {
    case 'slow': {
      circle(ctx, x, y, r);
      outlined(ctx, '#fff', Math.max(2, s * 0.08));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - r * 0.6);
      ctx.moveTo(x, y);
      ctx.lineTo(x + r * 0.45, y + r * 0.2);
      line(ctx, Math.max(2, s * 0.09));
      break;
    }
    case 'erase': {
      ctx.translate(x, y);
      ctx.rotate(-0.5);
      roundRect(ctx, 0, 0, s, s * 0.5, s * 0.12);
      outlined(ctx, '#f39bbb', Math.max(2, s * 0.08));
      roundRect(ctx, s * 0.28, 0, s * 0.44, s * 0.5, s * 0.1);
      outlined(ctx, '#fff', Math.max(2, s * 0.08));
      break;
    }
    case 'barrier': {
      ctx.beginPath();
      ctx.moveTo(x - r, y + r * 0.8);
      ctx.lineTo(x - r, y);
      ctx.arc(x, y, r, Math.PI, 0);
      ctx.lineTo(x + r, y + r * 0.8);
      line(ctx, Math.max(3, s * 0.18));
      ctx.beginPath();
      ctx.moveTo(x - r, y + r * 0.8);
      ctx.lineTo(x - r, y);
      ctx.arc(x, y, r, Math.PI, 0);
      ctx.lineTo(x + r, y + r * 0.8);
      line(ctx, Math.max(1.5, s * 0.08), '#9bd38a');
      break;
    }
  }
  ctx.restore();
}

/** A falling power-up: a glowing capsule tied with a ribbon, its icon inside. */
export function drawPowerItem(ctx: CanvasRenderingContext2D, kind: PowerKind, now: number, id: number): void {
  const glow = 0.5 + 0.5 * Math.sin(now / 260 + phase(id) * 6);
  ctx.save();
  ctx.globalAlpha *= 0.35 + 0.25 * glow;
  circle(ctx, 0, 0, 40);
  ctx.fillStyle = TINT[kind];
  ctx.fill();
  ctx.restore();
  circle(ctx, 0, 0, 28);
  outlined(ctx, TINT[kind]);
  // ribbon
  ctx.beginPath();
  ctx.moveTo(-28, 0);
  ctx.lineTo(28, 0);
  ctx.moveTo(0, -28);
  ctx.lineTo(0, 28);
  line(ctx, 3, 'rgba(91,59,74,0.35)');
  drawPowerIcon(ctx, kind, 0, 0, 26);
  // sparkles
  for (let i = 0; i < 3; i++) {
    const a = now / 700 + i * 2.1 + phase(id) * 6;
    const k = (Math.sin(now / 300 + i) + 1) / 2;
    circle(ctx, Math.cos(a) * 38, Math.sin(a) * 38, 2 + 2 * k);
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.4 * k;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
