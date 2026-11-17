/**
 * Template matcher in the style of the $1 recognizer (Wobbrock, Wilson & Li 2007):
 *   resample to N points -> (optionally) rotate to the indicative angle -> scale to a box
 *   -> centre on the origin -> mean point distance to each template, minimised over a
 *   small rotation range with golden-section search.
 *
 * Changes from vanilla $1:
 *   - Rotation invariance is per template (`rotationDeg`), so horizontal vs vertical
 *     lines and V vs ^ stay distinguishable while circles match at any rotation.
 *   - 1D-aware scaling: strokes whose bounding box is very thin (lines) are scaled
 *     uniformly, so hand jitter across a line isn't blown up to fill the box.
 *   - Variants (reversed, other start vertex for closed shapes) are expanded from data.
 */
import { SHAPES, type ShapeDef } from './shapes';

export interface Pt {
  x: number;
  y: number;
}

export const N_POINTS = 64;
const SIZE = 250;
const HALF_DIAGONAL = 0.5 * Math.sqrt(2 * SIZE * SIZE);
/** Elongation at or below this counts as a 1D gesture (scaled uniformly). */
const ONE_D_RATIO = 0.2;
const PHI = 0.5 * (-1 + Math.sqrt(5));
const ANGLE_PRECISION = (2 * Math.PI) / 180;
const FULL_SEARCH = (45 * Math.PI) / 180;
const DEG = Math.PI / 180;
/** Extra rotation searched beyond a template's tolerance (penalised). */
const ROTATION_SLACK = 35 * DEG;
/** Score lost per radian rotated beyond tolerance (0.015 per degree). */
const ROTATION_PENALTY = 0.015 / DEG;

// ---------- geometry

export function pathLength(pts: readonly Pt[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return d;
}

export function resample(points: readonly Pt[], n = N_POINTS): Pt[] {
  const total = pathLength(points);
  if (points.length === 0) return [];
  if (total === 0) return Array.from({ length: n }, () => ({ ...points[0] }));
  const interval = total / (n - 1);
  const src = points.map((p) => ({ x: p.x, y: p.y }));
  const out: Pt[] = [{ ...src[0] }];
  let acc = 0;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1];
    const b = src[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > 0 && acc + d >= interval) {
      const t = (interval - acc) / d;
      const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
      out.push(q);
      src.splice(i, 0, q); // q becomes the next segment's start
      acc = 0;
    } else {
      acc += d;
    }
  }
  while (out.length < n) out.push({ ...src[src.length - 1] }); // float rounding
  out.length = n;
  return out;
}

export function centroid(pts: readonly Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function rotateBy(pts: readonly Pt[], theta: number): Pt[] {
  const c = centroid(pts);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return pts.map((p) => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }));
}

function indicativeAngle(pts: readonly Pt[]): number {
  const c = centroid(pts);
  return Math.atan2(c.y - pts[0].y, c.x - pts[0].x);
}

/**
 * Elongation: sqrt(minor / major) eigenvalue of the point covariance. ~0 for a line in
 * any orientation, ~1 for a circle. Unlike a bounding-box ratio, a diagonal line is 1D too.
 */
export function elongation(pts: readonly Pt[]): number {
  return principalAxis(pts).elongation;
}

/** Principal axis orientation (radians, mod π) and elongation of a point cloud. */
export function principalAxis(pts: readonly Pt[]): { angle: number; elongation: number } {
  const c = centroid(pts);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const tr = sxx + syy;
  if (tr === 0) return { angle: 0, elongation: 1 };
  const disc = Math.sqrt(Math.max(0, ((sxx - syy) / 2) ** 2 + sxy * sxy));
  const major = tr / 2 + disc;
  const minor = Math.max(0, tr / 2 - disc);
  return { angle: 0.5 * Math.atan2(2 * sxy, sxx - syy), elongation: Math.sqrt(minor / major) };
}

/** Smallest difference between two undirected axis angles, in [0, π/2]. */
function axisDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
}

/** Moving average over ±1 neighbours, endpoints kept. */
function smooth(pts: readonly Pt[], passes: number): Pt[] {
  let p = pts.map((q) => ({ ...q }));
  for (let k = 0; k < passes; k++) {
    const out = p.map((q) => ({ ...q }));
    for (let i = 1; i < p.length - 1; i++) {
      out[i] = { x: (p[i - 1].x + p[i].x + p[i + 1].x) / 3, y: (p[i - 1].y + p[i].y + p[i + 1].y) / 3 };
    }
    p = out;
  }
  return p;
}

/** Turning angle (radians) at each resampled point between chords spanning k points each side. */
export function turningAngles(pts: readonly Pt[], k: number): number[] {
  const out = new Array<number>(pts.length).fill(0);
  for (let i = k; i < pts.length - k; i++) {
    const ax = pts[i].x - pts[i - k].x;
    const ay = pts[i].y - pts[i - k].y;
    const bx = pts[i + k].x - pts[i].x;
    const by = pts[i + k].y - pts[i].y;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    out[i] = la > 0 && lb > 0 ? Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) : 0;
  }
  return out;
}

/**
 * Counts sharp interior turns in a resampled stroke: smooth away jitter, measure the
 * turning angle over a chord window, then pick peaks above `thresholdDeg` that are at
 * least `k` points apart. Endpoints are skipped, so start/end hooks don't count.
 */
export function countCorners(pts: readonly Pt[], k = 8, thresholdDeg = 65): number {
  const th = (thresholdDeg * Math.PI) / 180;
  const turn = turningAngles(smooth(pts, 2), k);
  let corners = 0;
  let lastPeak = -Infinity;
  for (let i = k; i < pts.length - k; i++) {
    const t = turn[i];
    if (t <= th || t < turn[i - 1] || t < turn[i + 1]) continue; // not a local max above threshold
    if (i - lastPeak < k) continue; // same corner (plateau or noise split)
    corners++;
    lastPeak = i;
  }
  return corners;
}

function scaleToBox(pts: readonly Pt[]): Pt[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const big = Math.max(w, h);
  if (big === 0) return pts.map(() => ({ x: 0, y: 0 }));
  const uniform = elongation(pts) <= ONE_D_RATIO || Math.min(w, h) === 0;
  const sx = uniform ? SIZE / big : SIZE / w;
  const sy = uniform ? SIZE / big : SIZE / h;
  return pts.map((p) => ({ x: p.x * sx, y: p.y * sy }));
}

function translateToOrigin(pts: readonly Pt[]): Pt[] {
  const c = centroid(pts);
  return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

/** Full $1 preprocessing. `alignRotation` = rotate to the indicative angle first. */
export function normalize(points: readonly Pt[], alignRotation: boolean): Pt[] {
  let pts = resample(points);
  if (alignRotation) pts = rotateBy(pts, -indicativeAngle(pts));
  return translateToOrigin(scaleToBox(pts));
}

function pathDistance(a: readonly Pt[], b: readonly Pt[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  return d / a.length;
}

function distanceAtAngle(pts: readonly Pt[], tpl: readonly Pt[], theta: number): number {
  return pathDistance(theta === 0 ? pts : rotateBy(pts, theta), tpl);
}

/**
 * Golden-section search over rotation in [-range, +range] for the lowest cost, where
 * cost = normalized distance + a penalty for rotating beyond the template's tolerance.
 * Searching past the tolerance (instead of clamping at it) is what lets a 45° diagonal
 * be recognised as "a line, rotated too far" rather than "a slightly-off horizontal line".
 */
function bestCost(pts: readonly Pt[], tpl: readonly Pt[], range: number, tolerance: number): number {
  const cost = (theta: number) =>
    distanceAtAngle(pts, tpl, theta) / HALF_DIAGONAL + ROTATION_PENALTY * Math.max(0, Math.abs(theta) - tolerance);
  if (range <= 0) return cost(0);
  let a = -range;
  let b = range;
  let x1 = PHI * a + (1 - PHI) * b;
  let f1 = cost(x1);
  let x2 = (1 - PHI) * a + PHI * b;
  let f2 = cost(x2);
  while (Math.abs(b - a) > ANGLE_PRECISION) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = PHI * a + (1 - PHI) * b;
      f1 = cost(x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - PHI) * a + PHI * b;
      f2 = cost(x2);
    }
  }
  return Math.min(f1, f2, cost(0));
}

// ---------- templates

interface Template {
  id: string;
  label: string;
  /** Normalized points. */
  pts: Pt[];
  fullRotation: boolean;
  /** Search range in radians. */
  range: number;
  /** Rotation allowed without penalty, radians. */
  tolerance: number;
  /** For line-like templates: principal axis angle, to penalise wrong orientation directly. */
  axis: number | null;
  /** Expected interior corner count [min, max]; null = don't check. */
  corners: readonly [number, number] | null;
  personal: boolean;
}

/** All accepted drawing orders for a shape definition. */
export function expandVariants(def: ShapeDef): Pt[][] {
  const base: Pt[] = def.points.map(([x, y]) => ({ x, y }));
  const starts: Pt[][] = [];
  if (def.closed && base.length > 2) {
    const ring = base.slice(0, -1); // drop the duplicated closing vertex
    for (let s = 0; s < ring.length; s++) {
      const seq = [...ring.slice(s), ...ring.slice(0, s)];
      starts.push([...seq, seq[0]]);
    }
  } else {
    starts.push(base);
  }
  const out: Pt[][] = [];
  for (const v of starts) {
    out.push(v);
    if (def.bidirectional) out.push([...v].reverse());
  }
  return out;
}

// ---------- recognizer

export interface Match {
  id: string;
  label: string;
  /** 0..1, 1 = identical after normalization. */
  score: number;
  personal: boolean;
}

export interface Recognition {
  /** True when `top` cleared the confidence threshold. */
  accepted: boolean;
  top: Match | null;
  /** Best match of a *different* shape, for judging ambiguity. */
  runnerUp: Match | null;
  ms: number;
}

export interface RecognizerParams {
  /** Reject anything scoring below this. */
  minScore: number;
  /** Score deducted per corner outside a shape's expected range. */
  cornerPenalty: number;
}

// From a sweep over real camera strokes + the synthetic suite (2026-11-17): 0.74 / 0.20 kept
// 93% of real shapes while rejecting >= 96% of every synthetic non-shape family.
export const DEFAULT_RECOGNIZER: RecognizerParams = { minScore: 0.74, cornerPenalty: 0.2 };

export class Recognizer {
  private templates: Template[] = [];

  constructor(
    defs: readonly ShapeDef[] = SHAPES,
    public params: RecognizerParams = { ...DEFAULT_RECOGNIZER },
  ) {
    for (const d of defs) this.addShape(d);
  }

  get shapeIds(): string[] {
    return [...new Set(this.templates.map((t) => t.id))];
  }

  addShape(def: ShapeDef): void {
    for (const v of expandVariants(def)) this.addTemplate(def.id, def.label, v, def.rotationDeg, def.corners ?? null, false);
  }

  /** A player's own recording of a shape (calibration, Milestone 4). */
  addPersonal(id: string, label: string, points: readonly Pt[], rotationDeg: number, corners: readonly [number, number] | null = null): void {
    this.addTemplate(id, label, points, rotationDeg, corners, true);
  }

  removePersonal(id?: string): void {
    this.templates = this.templates.filter((t) => !t.personal || (id !== undefined && t.id !== id));
  }

  private addTemplate(
    id: string,
    label: string,
    points: readonly Pt[],
    rotationDeg: number,
    corners: readonly [number, number] | null,
    personal: boolean,
  ): void {
    const fullRotation = rotationDeg >= 180;
    const pa = principalAxis(resample(points));
    this.templates.push({
      axis: !fullRotation && pa.elongation <= ONE_D_RATIO ? pa.angle : null,
      id,
      label,
      pts: normalize(points, fullRotation),
      fullRotation,
      range: fullRotation ? FULL_SEARCH : Math.max(0, rotationDeg) * DEG + ROTATION_SLACK,
      tolerance: fullRotation ? FULL_SEARCH : Math.max(0, rotationDeg) * DEG,
      corners,
      personal,
    });
  }

  recognize(points: readonly Pt[]): Recognition {
    const t0 = performance.now();
    if (points.length < 2 || pathLength(points) === 0 || this.templates.length === 0) {
      return { accepted: false, top: null, runnerUp: null, ms: performance.now() - t0 };
    }
    let aligned: Pt[] | null = null;
    let unaligned: Pt[] | null = null;
    const resampled = resample(points);
    const corners = countCorners(resampled);
    const axis = principalAxis(resampled);
    const bestById = new Map<string, Match>();
    for (const t of this.templates) {
      const cand = t.fullRotation ? (aligned ??= normalize(points, true)) : (unaligned ??= normalize(points, false));
      let score = 1 - bestCost(cand, t.pts, t.range, t.tolerance);
      if (t.axis !== null && axis.elongation <= ONE_D_RATIO) {
        // $1 distance barely changes for a line rotated 20° past tolerance; the axis does.
        score -= ROTATION_PENALTY * Math.max(0, axisDiff(axis.angle, t.axis) - t.tolerance);
      }
      if (t.corners) {
        const off = corners < t.corners[0] ? t.corners[0] - corners : corners > t.corners[1] ? corners - t.corners[1] : 0;
        score -= off * this.params.cornerPenalty;
      }
      score = Math.max(0, score);
      const prev = bestById.get(t.id);
      if (!prev || score > prev.score) bestById.set(t.id, { id: t.id, label: t.label, score, personal: t.personal });
    }
    const ranked = [...bestById.values()].sort((a, b) => b.score - a.score);
    const top = ranked[0] ?? null;
    return {
      accepted: !!top && top.score >= this.params.minScore,
      top,
      runnerUp: ranked[1] ?? null,
      ms: performance.now() - t0,
    };
  }
}
