/**
 * One Euro filter (Casiez et al. 2012): a low-pass whose cutoff rises with speed, so it
 * removes jitter when the hand is still and adds little lag when it moves fast.
 *
 *   minCutoff  Hz. Lower = smoother at rest, more lag when slow.
 *   beta       Speed coefficient (per px/s here). Higher = less lag on fast moves.
 *   dCutoff    Hz. Cutoff for the speed estimate itself.
 */
export interface OneEuroParams {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

export const DEFAULT_ONE_EURO: OneEuroParams = { minCutoff: 1.5, beta: 0.01, dCutoff: 1.0 };

function alpha(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
}

/**
 * 2D variant: one shared speed estimate (vector magnitude) drives the cutoff for both
 * axes, so a diagonal move isn't filtered differently from a horizontal one.
 */
export class OneEuro2D {
  private x = 0;
  private y = 0;
  private dx = 0;
  private dy = 0;
  private lastT = NaN;

  constructor(public params: OneEuroParams = { ...DEFAULT_ONE_EURO }) {}

  reset(): void {
    this.lastT = NaN;
  }

  /** `tMs` must be a millisecond timestamp. Returns the filtered point. */
  filter(x: number, y: number, tMs: number): { x: number; y: number } {
    if (Number.isNaN(this.lastT)) {
      this.x = x;
      this.y = y;
      this.dx = 0;
      this.dy = 0;
      this.lastT = tMs;
      return { x, y };
    }
    // Guard against duplicate/out-of-order timestamps.
    const dt = Math.max(1e-3, (tMs - this.lastT) / 1000);
    this.lastT = tMs;

    const ad = alpha(this.params.dCutoff, dt);
    this.dx += ad * ((x - this.x) / dt - this.dx);
    this.dy += ad * ((y - this.y) / dt - this.dy);
    const speed = Math.hypot(this.dx, this.dy);

    const a = alpha(this.params.minCutoff + this.params.beta * speed, dt);
    this.x += a * (x - this.x);
    this.y += a * (y - this.y);
    return { x: this.x, y: this.y };
  }
}
