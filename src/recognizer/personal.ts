/**
 * Personal templates: the player draws each shape a few times in the calibration screen and
 * those strokes join the standard templates, so the recognizer learns their hand. Samples
 * keep each shape's own rules (rotation tolerance, corner range) from shapes.ts.
 */
import { countCorners, pathLength, resample, templateOptions, type Pt, type Recognizer } from './recognizer';
import { SHAPES } from './shapes';

export const SAMPLES_PER_SHAPE = 3;
/** Points kept per stored sample (resampled; the recognizer re-normalises anyway). */
const STORED_POINTS = 32;
const KEY = 'pencil-whiskers.personal.v1';

/** shape id -> recorded samples */
export type PersonalSet = Record<string, Pt[][]>;

export type SampleCheck = { ok: true } | { ok: false; reason: string };

/**
 * Should this stroke become a personal template for `shapeId`? It is refused when it is too
 * small to carry a shape, or when the standard recognizer is confident it is a DIFFERENT
 * vocabulary shape: a "circle" sample that is clearly a triangle would teach the wrong thing.
 * Strokes the standard recognizer merely rejects are welcome; that is the point of calibrating.
 */
export function checkSample(standard: Recognizer, shapeId: string, points: readonly Pt[]): SampleCheck {
  if (points.length < 4 || pathLength(points) < 80) return { ok: false, reason: 'A bit bigger, please: draw it across more of the screen.' };
  const r = standard.recognize(points);
  if (r.accepted && r.top && r.top.id !== shapeId && r.top.score >= 0.85) {
    return { ok: false, reason: `That looked like a ${r.top.label}. Try the ${labelOf(shapeId)} again.` };
  }
  return { ok: true };
}

export function labelOf(shapeId: string): string {
  return SHAPES.find((s) => s.id === shapeId)?.label ?? shapeId;
}

/** Small, storable copy of a stroke. */
export function compactSample(points: readonly Pt[]): Pt[] {
  return resample(points, STORED_POINTS).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}

/**
 * Replaces the recognizer's personal templates with this set. Each shape keeps its rotation
 * rule, but its corner range is widened to include the player's own samples: if their circles
 * come out with 3 corners, their samples are the truth about what their circle looks like.
 */
export function applyPersonal(rec: Recognizer, set: PersonalSet): void {
  rec.removePersonal();
  for (const def of SHAPES) {
    const samples = set[def.id] ?? [];
    if (!samples.length) continue;
    let corners: [number, number] | null = def.corners ? [def.corners[0], def.corners[1]] : null;
    if (corners) {
      for (const s of samples) {
        const c = countCorners(resample(s));
        corners = [Math.min(corners[0], c), Math.max(corners[1], c)];
      }
    }
    for (const sample of samples) rec.addPersonal(def.id, def.label, sample, { ...templateOptions(def), corners });
  }
}

/** Validates untrusted stored data: known shape ids, arrays of finite {x, y}, capped counts. */
export function parsePersonal(raw: unknown): PersonalSet {
  const out: PersonalSet = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const def of SHAPES) {
    const samples = (raw as Record<string, unknown>)[def.id];
    if (!Array.isArray(samples)) continue;
    const good: Pt[][] = [];
    for (const s of samples.slice(0, SAMPLES_PER_SHAPE)) {
      if (!Array.isArray(s) || s.length < 4 || s.length > 256) continue;
      const pts = s.filter((p): p is Pt => !!p && typeof p === 'object' && Number.isFinite((p as Pt).x) && Number.isFinite((p as Pt).y));
      if (pts.length === s.length) good.push(pts.map((p) => ({ x: p.x, y: p.y })));
    }
    if (good.length) out[def.id] = good;
  }
  return out;
}

export function countSamples(set: PersonalSet): number {
  return Object.values(set).reduce((n, s) => n + s.length, 0);
}

export function loadPersonal(): PersonalSet {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parsePersonal(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function savePersonal(set: PersonalSet): void {
  try {
    if (countSamples(set) === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(set));
  } catch {
    // not persisted; still applies for this visit
  }
}
