import type { StrokePoint } from '../input/strokes';

interface P {
  x: number;
  y: number;
}

export interface YarnStyle {
  body: string;
  plyLight: string;
  plyDark: string;
  outline: string;
  width: number;
}

export const YARN_PINK: YarnStyle = {
  body: '#f39bbb',
  plyLight: '#ffd6e4',
  plyDark: '#d36f98',
  outline: '#5b3b4a',
  width: 9,
};

export const YARN_DUD: YarnStyle = {
  body: '#cbbfc6',
  plyLight: '#ebe3e7',
  plyDark: '#a2949b',
  outline: '#6f6268',
  width: 8,
};

/**
 * A small inward spiral hanging off the stroke's first point, curling away from the
 * stroke: the loose end of the yarn. Returned in drawing order ending at `pts[0]`.
 */
export function curlPoints(pts: readonly P[], radius = 9): P[] {
  if (pts.length < 2) return [];
  const p0 = pts[0];
  // Direction from a point a bit into the stroke back toward the start.
  let ref = pts[pts.length - 1];
  for (const p of pts) {
    if (Math.hypot(p.x - p0.x, p.y - p0.y) >= radius * 1.5) {
      ref = p;
      break;
    }
  }
  const len = Math.hypot(p0.x - ref.x, p0.y - ref.y);
  if (len < 1) return [];
  const d = { x: (p0.x - ref.x) / len, y: (p0.y - ref.y) / len };
  const n = { x: -d.y, y: d.x };
  const c = { x: p0.x + n.x * radius, y: p0.y + n.y * radius };
  const a0 = Math.atan2(-n.y, -n.x);
  const out: P[] = [];
  const steps = 14;
  for (let k = steps; k >= 1; k--) {
    const f = k / steps;
    const a = a0 + f * Math.PI * 1.55;
    const r = radius * (1 - 0.45 * f);
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return out;
}

/** Smooth path through points using midpoint quadratic curves. */
function trace(ctx: CanvasRenderingContext2D, pts: readonly P[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

/**
 * Draws a yarn strand: dark rounded outline, pastel body, and two offset dashed plies
 * that read as twisted fibre. `head` extends the strand to the live cursor.
 */
export function drawYarn(
  ctx: CanvasRenderingContext2D,
  stroke: readonly StrokePoint[],
  style: YarnStyle,
  opts: { alpha?: number; widthScale?: number; head?: P | null; curl?: boolean } = {},
): void {
  if (stroke.length === 0) return;
  let pts: readonly P[] = stroke;
  if (opts.head) pts = [...pts, opts.head];
  if (pts.length < 2) return;
  if (opts.curl !== false) pts = [...curlPoints(pts), ...pts];

  const w = style.width * (opts.widthScale ?? 1);
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  trace(ctx, pts);
  ctx.strokeStyle = style.outline;
  ctx.lineWidth = w + 5;
  ctx.stroke();

  ctx.strokeStyle = style.body;
  ctx.lineWidth = w;
  ctx.stroke();

  ctx.lineWidth = w * 0.32;
  ctx.setLineDash([w * 0.8, w * 0.9]);
  ctx.strokeStyle = style.plyLight;
  ctx.stroke();
  ctx.lineDashOffset = w * 0.85;
  ctx.strokeStyle = style.plyDark;
  ctx.stroke();
  ctx.restore();
}
