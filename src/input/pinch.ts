import { LM } from '../tracking/protocol';

/**
 * Pinch distance (thumb tip 4 <-> index tip 8) divided by hand size (wrist 0 <-> middle
 * finger base 9), so it means the same thing near or far from the camera.
 *
 * Landmarks are normalized to the image (x by width, y by height; MediaPipe's z uses
 * roughly the same scale as x), so they are converted to pixel units first; otherwise a
 * 16:9 frame would make horizontal pinches look ~1.8x wider than vertical ones.
 */
export function pinchRatio(lm: ArrayLike<number>, imgW: number, imgH: number): number {
  const d = (a: number, b: number) =>
    Math.hypot(
      (lm[a * 3] - lm[b * 3]) * imgW,
      (lm[a * 3 + 1] - lm[b * 3 + 1]) * imgH,
      (lm[a * 3 + 2] - lm[b * 3 + 2]) * imgW,
    );
  const size = d(LM.WRIST, LM.MIDDLE_MCP);
  if (!(size > 0)) return NaN;
  return d(LM.THUMB_TIP, LM.INDEX_TIP) / size;
}

/**
 * The drawing point: the midpoint between thumb tip and index tip, normalized.
 * The index tip alone jumps toward the thumb as you pinch, which leaves a hook at the start
 * and end of every stroke; the midpoint barely moves during the pinch itself.
 */
export function pinchPoint(lm: ArrayLike<number>): { x: number; y: number } {
  const t = LM.THUMB_TIP * 3;
  const i = LM.INDEX_TIP * 3;
  return { x: (lm[t] + lm[i]) / 2, y: (lm[t + 1] + lm[i + 1]) / 2 };
}

export interface PenParams {
  /** Ratio below which the pen goes down. */
  press: number;
  /** Ratio above which the pen comes back up. Must be > press (hysteresis band). */
  release: number;
  /** Keep the pen down this long through dropped hand detections. */
  lostGraceMs: number;
}

export const DEFAULT_PEN: PenParams = { press: 0.25, release: 0.4, lostGraceMs: 150 };

/** Hysteresis state machine for pen up/down. Pure; feed it one observation per frame. */
export class PenState {
  down = false;
  private lostSince = NaN;

  constructor(public params: PenParams = { ...DEFAULT_PEN }) {}

  /** `ratio` is null when no hand was detected this frame. Returns the new pen state. */
  update(ratio: number | null, tMs: number): boolean {
    if (ratio === null || !Number.isFinite(ratio)) {
      if (!this.down) return false;
      if (Number.isNaN(this.lostSince)) this.lostSince = tMs;
      if (tMs - this.lostSince >= this.params.lostGraceMs) {
        this.down = false;
        this.lostSince = NaN;
      }
      return this.down;
    }
    this.lostSince = NaN;
    const release = Math.max(this.params.release, this.params.press + 0.01);
    if (this.down) {
      if (ratio > release) this.down = false;
    } else if (ratio < this.params.press) {
      this.down = true;
    }
    return this.down;
  }

  reset(): void {
    this.down = false;
    this.lostSince = NaN;
  }
}
