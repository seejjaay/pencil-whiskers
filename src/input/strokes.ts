export interface StrokePoint {
  x: number;
  y: number;
  t: number;
}

/** One pen-down -> pen-up stroke in player (mirrored screen) space, CSS px. */
export interface Stroke {
  points: StrokePoint[];
  startT: number;
  endT: number;
}

/** Why a stroke ended: pinch opened, hand lost, mouse button up, or input mode switched. */
export type StrokeEnd = 'release' | 'lost' | 'mouse' | 'switch';

export interface PointerSample extends StrokePoint {
  down: boolean;
  /** Camera only: this frame's pinch ratio (diagnostics / stroke log). */
  ratio?: number;
  /** On a pen-up sample: why the stroke ended. */
  end?: StrokeEnd;
}

export interface RecorderParams {
  /** Trim up to this long before release (the hand opening can drag the point)... */
  tailTrimMs: number;
  /** ...but never more than this much path. A fixed time trim scales with speed: at
   *  1500 px/s, 50 ms is 75 px, which visibly cuts the end off fast strokes. */
  maxTrimPx: number;
  /** Strokes with a shorter path are treated as accidental taps and discarded. */
  minPathPx: number;
  /** Zero-lag smoothing passes for DRAWING strokes (live and finished). Recognition uses the
   *  unsmoothed points; see recognizer/pipeline.ts. 0 = off. */
  smoothPasses: number;
}

export const DEFAULT_RECORDER: RecorderParams = { tailTrimMs: 40, maxTrimPx: 24, minPathPx: 24, smoothPasses: 2 };

export function pathLength(pts: readonly StrokePoint[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/**
 * Zero-lag smoothing for a recorded stroke: binomial [1, 2, 1] passes over neighbouring
 * samples. Centred on each point, so unlike the live One Euro filter it costs no latency,
 * which is why it can afford to be stronger. Endpoints are kept so the stroke still starts
 * and ends where the player did. Two passes = a [1, 4, 6, 4, 1] kernel, jitter x ~0.5.
 */
export function smoothStroke(pts: readonly StrokePoint[], passes: number): StrokePoint[] {
  let p = pts.map((q) => ({ ...q }));
  for (let k = 0; k < passes && p.length > 2; k++) {
    const out = p.map((q) => ({ ...q }));
    for (let i = 1; i < p.length - 1; i++) {
      out[i].x = (p[i - 1].x + 2 * p[i].x + p[i + 1].x) / 4;
      out[i].y = (p[i - 1].y + 2 * p[i].y + p[i + 1].y) / 4;
    }
    p = out;
  }
  return p;
}

export type RecorderEvent = { type: 'stroke' | 'discarded'; stroke: Stroke; end: StrokeEnd };

/** Turns a stream of pointer samples into finished strokes. Pure. */
export class StrokeRecorder {
  current: Stroke | null = null;

  constructor(public params: RecorderParams = { ...DEFAULT_RECORDER }) {}

  push(s: PointerSample): RecorderEvent | null {
    if (s.down) {
      if (!this.current) {
        this.current = { points: [{ x: s.x, y: s.y, t: s.t }], startT: s.t, endT: s.t };
        return null;
      }
      const last = this.current.points[this.current.points.length - 1];
      if (s.t < last.t) return null;
      if (Math.hypot(s.x - last.x, s.y - last.y) < 0.5) {
        last.t = s.t; // stationary: keep timing fresh without piling duplicates
      } else {
        this.current.points.push({ x: s.x, y: s.y, t: s.t });
      }
      this.current.endT = s.t;
      return null;
    }
    return this.finish(s.t, s.end ?? 'release');
  }

  /**
   * Ends the current stroke. `releaseT` is when the pen really lifted; it can be earlier than
   * the last recorded point (the pen state holds the pen down briefly to ride out misreads),
   * and anything recorded after it is not part of the stroke.
   */
  finish(releaseT: number, end: StrokeEnd): RecorderEvent | null {
    const stroke = this.current;
    if (!stroke) return null;
    this.current = null;
    const pts = stroke.points;
    let keep = pts.length;
    // Exact, no minimum: after the real release the hand is open, so nothing after it counts.
    // (A floor here once kept one post-release point of a one-frame false pinch, turning it
    // into a 2-point "line" that was recognised.)
    while (keep > 0 && pts[keep - 1].t > releaseT) keep--;
    if (keep < 2) {
      pts.length = keep;
      return { type: 'discarded', stroke, end };
    }
    const cutoff = releaseT - this.params.tailTrimMs;
    let trimmed = 0;
    while (keep > 2 && pts[keep - 1].t > cutoff) {
      trimmed += Math.hypot(pts[keep - 1].x - pts[keep - 2].x, pts[keep - 1].y - pts[keep - 2].y);
      if (trimmed > this.params.maxTrimPx) break;
      keep--;
    }
    pts.length = keep;
    const lastT = pts[keep - 1].t;
    stroke.endT = Math.max(lastT, Math.min(releaseT, lastT + 1000));
    const type = pathLength(pts) < this.params.minPathPx ? 'discarded' : 'stroke';
    return { type, stroke, end };
  }
}
