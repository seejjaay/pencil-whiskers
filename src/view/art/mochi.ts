/**
 * Mochi: a round, chubby loaf-shaped cat on a cushion, drawn entirely from shapes.
 * Animations are procedural: breathing, a sleepy one-eye peek, ear twitches, tail swish,
 * pounce (stretch + raised paw), happy squish, and a startled fur-puff.
 */
import { BLUSH, CREAM, INK, PINK, PINK_DARK, circle, ellipse, line, outlined, roundRect } from './draw';

export type Mood = 'sleep' | 'pounce' | 'startled' | 'happy';

export interface MochiPose {
  x: number;
  y: number;
  mood: Mood;
  /** 0..1 progress through the current mood (sleep ignores it). */
  t: number;
  now: number;
  /** -1..1: which way a pounce leans. */
  lean: number;
}

const PATCH = '#c9b8c4';
const INNER_EAR = '#f7c3d4';

export function drawMochi(ctx: CanvasRenderingContext2D, p: MochiPose): void {
  const { now, mood } = p;
  let sx = 1;
  let sy = 1;
  let lift = 0;
  if (mood === 'sleep') {
    const breath = Math.sin(now / 900) * 0.035;
    sx = 1 + breath;
    sy = 1 - breath * 0.7;
  } else if (mood === 'pounce') {
    const arc = Math.sin(p.t * Math.PI);
    lift = 34 * arc;
    sy = 1 + 0.16 * arc;
    sx = 1 - 0.1 * arc;
  } else if (mood === 'happy') {
    const k = Math.sin(p.t * Math.PI * 2) * (1 - p.t);
    sx = 1 + 0.12 * k;
    sy = 1 - 0.12 * k;
  } else {
    const jolt = Math.max(0, 1 - p.t * 4);
    lift = 14 * jolt;
    sx = 0.95;
    sy = 1.06;
  }

  // cushion (doesn't jump)
  roundRect(ctx, p.x, p.y + 34, 210, 34, 17);
  outlined(ctx, '#d9c8f2', 4);
  ctx.save();
  ctx.setLineDash([6, 7]);
  roundRect(ctx, p.x, p.y + 34, 186, 18, 9);
  line(ctx, 2, 'rgba(91,59,74,0.35)');
  ctx.restore();

  ctx.save();
  ctx.translate(p.x + p.lean * 10 * (mood === 'pounce' ? Math.sin(p.t * Math.PI) : 0), p.y - lift);

  drawTail(ctx, now, mood);

  ctx.save();
  ctx.scale(sx, sy);
  drawEars(ctx, now, mood);

  // body: a soft loaf; puffed outline when startled
  ctx.beginPath();
  if (mood === 'startled') {
    const spikes = 26;
    for (let i = 0; i <= spikes; i++) {
      const a = (i / spikes) * Math.PI * 2;
      const r = i % 2 ? 1 : 1.07;
      const x = Math.cos(a) * 80 * r;
      const y = Math.sin(a) * 52 * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else {
    ctx.moveTo(-78, 18);
    ctx.bezierCurveTo(-84, -40, -40, -54, 0, -54);
    ctx.bezierCurveTo(40, -54, 84, -40, 78, 18);
    ctx.bezierCurveTo(74, 44, -74, 44, -78, 18);
    ctx.closePath();
  }
  ctx.save();
  outlined(ctx, CREAM, 5);
  ctx.clip();
  // grey patches (clipped to the body)
  ctx.fillStyle = PATCH;
  ellipse(ctx, -58, -34, 34, 26, -0.4);
  ctx.fill();
  ellipse(ctx, 62, 6, 22, 30, 0.3);
  ctx.fill();
  // lighter belly
  ctx.fillStyle = '#fffaf6';
  ellipse(ctx, 0, 30, 46, 22);
  ctx.fill();
  ctx.restore();

  drawPaws(ctx, mood, p.t);
  drawFace(ctx, p);
  ctx.restore();
  ctx.restore();

  drawSleepOrAlarm(ctx, p);
}

function drawTail(ctx: CanvasRenderingContext2D, now: number, mood: string): void {
  ctx.save();
  if (mood === 'startled') {
    ctx.beginPath();
    ctx.moveTo(62, 10);
    ctx.quadraticCurveTo(102, -10, 96, -74);
    line(ctx, 22);
    ctx.beginPath();
    ctx.moveTo(62, 10);
    ctx.quadraticCurveTo(102, -10, 96, -74);
    line(ctx, 13, CREAM);
  } else {
    const swish = Math.sin(now / 1100) * 0.5;
    ctx.beginPath();
    ctx.moveTo(58, 26);
    ctx.bezierCurveTo(104, 30, 108, 50 + swish * 8, 70 + swish * 14, 52);
    line(ctx, 18);
    ctx.beginPath();
    ctx.moveTo(58, 26);
    ctx.bezierCurveTo(104, 30, 108, 50 + swish * 8, 70 + swish * 14, 52);
    line(ctx, 10, CREAM);
    // grey tail tip
    circle(ctx, 70 + swish * 14, 52, 6);
    ctx.fillStyle = PATCH;
    ctx.fill();
  }
  ctx.restore();
}

function drawEars(ctx: CanvasRenderingContext2D, now: number, mood: string): void {
  // an ear twitch every few seconds, one ear at a time
  const cycle = (now / 4300) % 1;
  for (const s of [-1, 1]) {
    const twitch = mood === 'sleep' && s === 1 && cycle > 0.92 ? Math.sin((cycle - 0.92) * 80) * 0.2 : 0;
    const perk = mood === 'startled' ? -0.15 : 0;
    ctx.save();
    ctx.translate(s * 40, -44);
    ctx.rotate(s * (0.32 + perk) + twitch);
    ctx.beginPath();
    ctx.moveTo(-18, 10);
    ctx.quadraticCurveTo(-6, -30, 2, -28);
    ctx.quadraticCurveTo(12, -24, 18, 10);
    ctx.closePath();
    outlined(ctx, s < 0 ? PATCH : CREAM, 5);
    ctx.beginPath();
    ctx.moveTo(-9, 6);
    ctx.quadraticCurveTo(-2, -16, 2, -15);
    ctx.quadraticCurveTo(7, -12, 9, 6);
    ctx.closePath();
    ctx.fillStyle = INNER_EAR;
    ctx.fill();
    ctx.restore();
  }
}

function drawPaws(ctx: CanvasRenderingContext2D, mood: string, t: number): void {
  const raise = mood === 'pounce' ? Math.sin(t * Math.PI) : 0;
  for (const s of [-1, 1]) {
    const up = s === 1 ? raise : 0;
    ctx.save();
    ctx.translate(s * 30, 36 - up * 52);
    ctx.rotate(-s * 0.1 - up * 0.6);
    ellipse(ctx, 0, 0, 17, 11);
    outlined(ctx, '#fffaf6', 4);
    ctx.beginPath();
    for (const dx of [-5, 5]) {
      ctx.moveTo(dx, 2);
      ctx.lineTo(dx, 9);
    }
    line(ctx, 2.5);
    if (up > 0.4) {
      // swipe lines
      ctx.beginPath();
      for (const dy of [-14, -4, 6]) {
        ctx.moveTo(22, dy);
        ctx.lineTo(36, dy - 6);
      }
      line(ctx, 3, PINK_DARK);
    }
    ctx.restore();
  }
}

function drawFace(ctx: CanvasRenderingContext2D, p: MochiPose): void {
  const { mood, now } = p;
  // cheeks
  ctx.fillStyle = BLUSH;
  ellipse(ctx, -34, 4, 10, 6);
  ctx.fill();
  ellipse(ctx, 34, 4, 10, 6);
  ctx.fill();

  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  if (mood === 'startled') {
    for (const s of [-1, 1]) {
      circle(ctx, s * 20, -12, 10);
      outlined(ctx, '#fff', 3);
      circle(ctx, s * 20, -11, 4.5);
      ctx.fillStyle = INK;
      ctx.fill();
    }
  } else if (mood === 'happy' || mood === 'pounce') {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 20 - 9, -8);
      ctx.quadraticCurveTo(s * 20, -20, s * 20 + 9, -8);
      line(ctx, 4);
    }
  } else {
    // asleep; every ~7 s one eye peeks open for a moment, then slowly closes again
    const cycle = (now / 7000) % 1;
    const peek = cycle > 0.86 ? Math.sin(((cycle - 0.86) / 0.14) * Math.PI) : 0;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 20, -14, 9, 0.15 * Math.PI, 0.85 * Math.PI);
      line(ctx, 4);
      if (s === 1 && peek > 0.05) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(s * 20, -9, 6, 5 * peek, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fillStyle = INK;
        ctx.fill();
        ctx.restore();
      }
    }
  }
  // nose + mouth
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(5, 0);
  ctx.lineTo(0, 5);
  ctx.closePath();
  ctx.fillStyle = PINK;
  ctx.fill();
  line(ctx, 2);
  ctx.beginPath();
  if (mood === 'startled') {
    ctx.ellipse(0, 12, 5, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#c2455f';
    ctx.fill();
  } else {
    ctx.moveTo(0, 5);
    ctx.quadraticCurveTo(-5, 12, -11, 8);
    ctx.moveTo(0, 5);
    ctx.quadraticCurveTo(5, 12, 11, 8);
  }
  line(ctx, 3);
  // whiskers
  ctx.beginPath();
  for (const s of [-1, 1]) {
    for (const [dy, tilt] of [[-2, -6], [4, 0], [10, 6]] as const) {
      ctx.moveTo(s * 46, dy);
      ctx.lineTo(s * 74, dy + tilt);
    }
  }
  line(ctx, 2, 'rgba(91,59,74,0.7)');
}

function drawSleepOrAlarm(ctx: CanvasRenderingContext2D, p: MochiPose): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  if (p.mood === 'sleep') {
    for (let i = 0; i < 3; i++) {
      const k = (((p.now / 2000 + i / 3) % 1) + 1) % 1;
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.75;
      ctx.font = `800 ${13 + i * 5}px ui-rounded, system-ui, sans-serif`;
      ctx.fillText('z', p.x + 64 + k * 34 + i * 9, p.y - 60 - k * 54);
    }
  } else if (p.mood === 'startled') {
    ctx.font = '900 44px ui-rounded, system-ui, sans-serif';
    ctx.fillStyle = '#c2455f';
    ctx.fillText('!', p.x + 72, p.y - 70);
  }
  ctx.restore();
}
