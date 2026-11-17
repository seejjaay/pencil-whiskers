/**
 * The cat (Thomas, see src/cat.ts): a round, solid-orange loaf on a cushion, drawn from shapes.
 * Procedural animations: breathing, a sleepy one-eye peek, ear twitches, tail swish, pounce
 * (stretch + paw raised out to the side), happy squish, and a startled fur-puff.
 *
 * Layout rule: every part has its own slot and no pose moves one part into another's.
 * Measured in body units (body centre at 0,0, unscaled):
 *   ears        x ±22..±58, y -74..-34      eyes      x ±10..±30, y -22..-3
 *   muzzle      x -18..18,  y -2..20        cheeks    x ±24..±44, y -2..10
 *   whiskers    x ±46..±74, y -8..16        paws      y 25..47 (raised paw: x 75..109, y -41..-19)
 *   tail        right side, x ≥ 58 below y 18 (asleep) / x ≥ 70 when puffed
 * Captions sit outside the body: "zzz" up and right of x 86, "!" left of x -70.
 */
import { BLUSH, INK, circle, ellipse, line, outlined, roundRect } from './draw';

export type Mood = 'sleep' | 'pounce' | 'startled' | 'happy';

export interface CatPose {
  x: number;
  y: number;
  mood: Mood;
  /** 0..1 progress through the current mood (sleep ignores it). */
  t: number;
  now: number;
  /** -1..1: which way a pounce leans. */
  lean: number;
}

const ORANGE = '#f5a04a';
const ORANGE_DEEP = '#e8893a';
const MUZZLE = '#fff1df';
const INNER_EAR = '#f7b9a6';

export function drawCat(ctx: CanvasRenderingContext2D, p: CatPose): void {
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
    lift = 30 * arc;
    sy = 1 + 0.1 * arc;
    sx = 1 - 0.06 * arc;
  } else if (mood === 'happy') {
    const k = Math.sin(p.t * Math.PI * 2) * (1 - p.t);
    sx = 1 + 0.1 * k;
    sy = 1 - 0.1 * k;
  } else {
    lift = 14 * Math.max(0, 1 - p.t * 4);
    sx = 0.96;
    sy = 1.05;
  }

  // cushion (stays put)
  roundRect(ctx, p.x, p.y + 34, 210, 34, 17);
  outlined(ctx, '#d9c8f2', 4);
  ctx.save();
  ctx.setLineDash([6, 7]);
  roundRect(ctx, p.x, p.y + 34, 186, 18, 9);
  line(ctx, 2, 'rgba(91,59,74,0.35)');
  ctx.restore();

  ctx.save();
  ctx.translate(p.x + p.lean * 8 * (mood === 'pounce' ? Math.sin(p.t * Math.PI) : 0), p.y - lift);
  drawTail(ctx, now, mood);
  ctx.save();
  ctx.scale(sx, sy);
  drawEars(ctx, now, mood);
  drawBody(ctx, mood);
  drawPaws(ctx, mood, p.t);
  drawFace(ctx, p);
  ctx.restore();
  ctx.restore();

  drawCaption(ctx, p);
}

function drawBody(ctx: CanvasRenderingContext2D, mood: Mood): void {
  ctx.beginPath();
  if (mood === 'startled') {
    const spikes = 26;
    for (let i = 0; i <= spikes; i++) {
      const a = (i / spikes) * Math.PI * 2;
      const r = i % 2 ? 1 : 1.06;
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
  outlined(ctx, ORANGE, 5);
  ctx.clip();
  // a slightly deeper back and a cream belly: still one solid orange cat
  ctx.fillStyle = ORANGE_DEEP;
  ellipse(ctx, 0, -60, 70, 22);
  ctx.fill();
  ctx.fillStyle = MUZZLE;
  ellipse(ctx, 0, 34, 44, 18);
  ctx.fill();
  ctx.restore();
}

function drawTail(ctx: CanvasRenderingContext2D, now: number, mood: Mood): void {
  const path = () => {
    ctx.beginPath();
    if (mood === 'startled') {
      // puffed straight up, well outside the whiskers (x ≤ 74) and the right ear (x ≤ 58)
      ctx.moveTo(70, 30);
      ctx.quadraticCurveTo(124, 12, 110, -58);
    } else {
      const swish = Math.sin(now / 1100) * 0.5;
      ctx.moveTo(58, 26);
      ctx.bezierCurveTo(104, 30, 108, 50 + swish * 8, 70 + swish * 14, 52);
    }
  };
  ctx.save();
  path();
  line(ctx, mood === 'startled' ? 24 : 18);
  path();
  line(ctx, mood === 'startled' ? 15 : 10, ORANGE);
  ctx.restore();
}

function drawEars(ctx: CanvasRenderingContext2D, now: number, mood: Mood): void {
  const cycle = (now / 4300) % 1;
  for (const s of [-1, 1]) {
    const twitch = mood === 'sleep' && s === 1 && cycle > 0.92 ? Math.sin((cycle - 0.92) * 80) * 0.18 : 0;
    const perk = mood === 'startled' ? -0.12 : 0;
    ctx.save();
    ctx.translate(s * 40, -44);
    ctx.rotate(s * (0.32 + perk) + twitch);
    ctx.beginPath();
    ctx.moveTo(-18, 10);
    ctx.quadraticCurveTo(-6, -30, 2, -28);
    ctx.quadraticCurveTo(12, -24, 18, 10);
    ctx.closePath();
    outlined(ctx, ORANGE, 5);
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

function drawPaws(ctx: CanvasRenderingContext2D, mood: Mood, t: number): void {
  const raise = mood === 'pounce' ? Math.sin(t * Math.PI) : 0;
  for (const s of [-1, 1]) {
    const up = s === 1 ? raise : 0;
    ctx.save();
    if (up > 0.05) {
      // The pounce paw goes OUT first (below and past the whisker tips at x 74), then up beside
      // the head, so at no moment does it cross the whiskers or the face.
      const k1 = Math.min(1, up / 0.5);
      const k2 = Math.max(0, (up - 0.5) / 0.5);
      const px = 30 + 70 * k1;
      const py = 36 - 6 * k1 - 60 * k2;
      // arm leaves the body edge below the whiskers; half-width 7 keeps it ≥ 3 px off their tips
      ctx.beginPath();
      ctx.moveTo(84, 12);
      ctx.lineTo(px - 8, py + 2);
      line(ctx, 14);
      ctx.beginPath();
      ctx.moveTo(84, 12);
      ctx.lineTo(px - 8, py + 2);
      line(ctx, 7, ORANGE);
      ctx.translate(px, py);
      ctx.rotate(-up * 0.6);
    } else {
      ctx.translate(s * 30, 36);
      ctx.rotate(-s * 0.1);
    }
    ellipse(ctx, 0, 0, 17, 11);
    outlined(ctx, ORANGE, 4);
    ctx.beginPath();
    for (const dx of [-5, 5]) {
      ctx.moveTo(dx, 2);
      ctx.lineTo(dx, 9);
    }
    line(ctx, 2.5);
    if (up > 0.4) {
      ctx.beginPath();
      for (const dy of [-12, -2, 8]) {
        ctx.moveTo(22, dy);
        ctx.lineTo(36, dy - 6);
      }
      line(ctx, 3, '#d36f98');
    }
    ctx.restore();
  }
}

function drawFace(ctx: CanvasRenderingContext2D, p: CatPose): void {
  const { mood, now } = p;
  // muzzle and cheeks
  ellipse(ctx, 0, 9, 18, 11);
  ctx.fillStyle = MUZZLE;
  ctx.fill();
  ctx.fillStyle = BLUSH;
  ellipse(ctx, -34, 4, 10, 6);
  ctx.fill();
  ellipse(ctx, 34, 4, 10, 6);
  ctx.fill();

  if (mood === 'startled') {
    for (const s of [-1, 1]) {
      circle(ctx, s * 20, -12, 9);
      outlined(ctx, '#fff', 3);
      circle(ctx, s * 20, -11, 4);
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
        ctx.beginPath();
        ctx.ellipse(s * 20, -9, 6, 5 * peek, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fillStyle = INK;
        ctx.fill();
      }
    }
  }
  // nose + mouth (inside the muzzle)
  ctx.beginPath();
  ctx.moveTo(-5, 1);
  ctx.lineTo(5, 1);
  ctx.lineTo(0, 6);
  ctx.closePath();
  ctx.fillStyle = '#e06f86';
  ctx.fill();
  line(ctx, 2);
  ctx.beginPath();
  if (mood === 'startled') {
    ctx.ellipse(0, 13, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#c2455f';
    ctx.fill();
  } else {
    ctx.moveTo(0, 6);
    ctx.quadraticCurveTo(-5, 13, -10, 9);
    ctx.moveTo(0, 6);
    ctx.quadraticCurveTo(5, 13, 10, 9);
  }
  line(ctx, 3);
  // whiskers (their own slot: x 46..74)
  ctx.beginPath();
  for (const s of [-1, 1]) {
    for (const [dy, tilt] of [[-2, -6], [4, 0], [10, 6]] as const) {
      ctx.moveTo(s * 46, dy);
      ctx.lineTo(s * 74, dy + tilt);
    }
  }
  line(ctx, 2, 'rgba(91,59,74,0.7)');
}

/** "zzz" while napping (up and right, clear of ear and tail); "!" when startled (left side). */
function drawCaption(ctx: CanvasRenderingContext2D, p: CatPose): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  if (p.mood === 'sleep') {
    for (let i = 0; i < 3; i++) {
      const k = (((p.now / 2000 + i / 3) % 1) + 1) % 1;
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.75;
      ctx.font = `800 ${13 + i * 5}px ui-rounded, system-ui, sans-serif`;
      ctx.fillText('z', p.x + 86 + k * 34 + i * 9, p.y - 58 - k * 54);
    }
  } else if (p.mood === 'startled') {
    ctx.font = '900 44px ui-rounded, system-ui, sans-serif';
    ctx.fillStyle = '#c2455f';
    ctx.fillText('!', p.x - 92, p.y - 52);
  }
  ctx.restore();
}
