import { expandVariants, type Pt } from '../../src/recognizer/recognizer';
import type { ShapeDef } from '../../src/recognizer/shapes';

export type Rng = () => number;

export function rng(seed: number): Rng {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const between = (r: Rng, a: number, b: number) => a + (b - a) * r();

export function gauss(r: Rng): number {
  const u = Math.max(1e-9, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export interface Distortion {
  /** Final size of the longest side, px. */
  size: number;
  /** Rotation applied, degrees. */
  rotateDeg: number;
  /** Per-point gaussian jitter, as a fraction of size. */
  noise: number;
  /** Low-frequency sideways wobble amplitude, fraction of size. */
  wobble: number;
  /** Horizontal stretch (1 = none); circles become ovals, etc. */
  aspect: number;
  /** Corner-rounding passes (hand-drawn corners are never sharp). Each pass bevels every
   *  corner by 10% of the adjacent segments; two passes ~ a corner radius of ~10% side. */
  roundCorners: number;
  /** Uneven drawing speed: 0 = even sample spacing. */
  speedVariation: number;
  /** Number of samples (camera ~ 15-40 per stroke, mouse ~ 50-200). */
  samples: number;
}

/** Chaikin-style corner cutting with cut ratio q (classic Chaikin is q = 0.25). */
function chaikin(pts: Pt[], passes: number, q = 0.1): Pt[] {
  let p = pts;
  for (let k = 0; k < passes; k++) {
    const out: Pt[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i];
      const b = p[i + 1];
      out.push({ x: (1 - q) * a.x + q * b.x, y: (1 - q) * a.y + q * b.y });
      out.push({ x: q * a.x + (1 - q) * b.x, y: q * a.y + (1 - q) * b.y });
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

/** Point at arc-length fraction u (0..1) along a polyline. */
function along(pts: Pt[], u: number): Pt {
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const target = u * lens[lens.length - 1];
  let i = 1;
  while (i < lens.length - 1 && lens[i] < target) i++;
  const seg = lens[i] - lens[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (target - lens[i - 1]) / seg));
  return { x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y) };
}

/** A believable hand-drawn version of `base` (a polyline in drawing order). */
export function distort(base: Pt[], d: Distortion, r: Rng): Pt[] {
  let poly = chaikin(base, d.roundCorners);
  // normalize to unit size around origin
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const big = Math.max(w, h) || 1;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  poly = poly.map((p) => ({ x: ((p.x - cx) / big) * d.aspect, y: (p.y - cy) / big }));

  const phase = r() * Math.PI * 2;
  const freq = between(r, 0.8, 2.5);
  const wobPhase = r() * Math.PI * 2;
  const out: Pt[] = [];
  const th = (d.rotateDeg * Math.PI) / 180;
  const ox = between(r, 200, 1000);
  const oy = between(r, 150, 600);
  for (let i = 0; i < d.samples; i++) {
    const lin = i / (d.samples - 1);
    // monotonic speed warp
    const u = Math.min(1, Math.max(0, lin + (d.speedVariation * Math.sin(lin * Math.PI * 2 + phase)) / (2 * Math.PI)));
    const p = along(poly, u);
    // sideways wobble along the local normal
    const q = along(poly, Math.min(1, u + 0.01));
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const nx = -(q.y - p.y) / len;
    const ny = (q.x - p.x) / len;
    const wob = d.wobble * Math.sin(u * Math.PI * 2 * freq + wobPhase);
    let x = p.x + nx * wob + gauss(r) * d.noise;
    let y = p.y + ny * wob + gauss(r) * d.noise;
    const rx = x * Math.cos(th) - y * Math.sin(th);
    const ry = x * Math.sin(th) + y * Math.cos(th);
    x = rx * d.size + ox;
    y = ry * d.size + oy;
    out.push({ x, y });
  }
  return out;
}

/** Picks one drawing order for the shape (start vertex / direction) at random. */
export function variantOf(def: ShapeDef, r: Rng): Pt[] {
  const vs = expandVariants(def);
  return vs[Math.floor(r() * vs.length)];
}

/** A circle drawn as an arc that under- or overshoots a full turn, starting anywhere. */
export function sloppyCircle(r: Rng, sweepDeg: number): Pt[] {
  const start = r() * Math.PI * 2;
  const dir = r() < 0.5 ? 1 : -1;
  const n = 48;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = start + dir * ((i / n) * sweepDeg * Math.PI) / 180;
    pts.push({ x: Math.cos(a), y: Math.sin(a) });
  }
  return pts;
}

/** Typical player-level distortion. */
export function typical(r: Rng, def: ShapeDef, samples: number): Distortion {
  const limit = def.rotationDeg >= 180 ? 180 : Math.min(def.rotationDeg * 0.6, 15);
  const thin = def.id === 'hline' || def.id === 'vline';
  return {
    size: between(r, 80, 450),
    rotateDeg: between(r, -limit, limit),
    noise: between(r, 0.005, 0.02),
    wobble: between(r, 0, thin ? 0.03 : 0.05),
    aspect: thin ? 1 : between(r, 0.75, 1.33),
    roundCorners: Math.floor(between(r, 0, 3)),
    speedVariation: between(r, 0, 0.6),
    samples,
  };
}
