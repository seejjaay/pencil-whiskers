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

export interface PointerSample extends StrokePoint {
  down: boolean;
}

export interface RecorderParams {
  /** Drop points from the last N ms before release (the hand opening drags the point). */
  tailTrimMs: number;
  /** Strokes with a shorter path are treated as accidental taps and discarded. */
  minPathPx: number;
}

export const DEFAULT_RECORDER: RecorderParams = { tailTrimMs: 50, minPathPx: 24 };

export function pathLength(pts: readonly StrokePoint[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

export type RecorderEvent = { type: 'stroke'; stroke: Stroke } | { type: 'discarded'; stroke: Stroke };

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
    return this.finish(s.t);
  }

  /** Ends the current stroke (pen up, mode switch, hand lost). */
  finish(tMs: number): RecorderEvent | null {
    const stroke = this.current;
    if (!stroke) return null;
    this.current = null;
    stroke.endT = Math.max(stroke.endT, Math.min(tMs, stroke.endT + 1000));
    const cutoff = stroke.endT - this.params.tailTrimMs;
    let keep = stroke.points.length;
    while (keep > 2 && stroke.points[keep - 1].t > cutoff) keep--;
    stroke.points.length = keep;
    if (pathLength(stroke.points) < this.params.minPathPx) return { type: 'discarded', stroke };
    return { type: 'stroke', stroke };
  }
}
