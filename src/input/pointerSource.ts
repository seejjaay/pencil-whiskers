import { LM } from '../tracking/protocol';
import type { TrackerClient } from '../tracking/trackerClient';
import type { CoverMap } from '../view/coverMap';

/** A pointer position in mirrored screen space (CSS px) — exactly what the player sees. */
export interface PointerSample {
  x: number;
  y: number;
  /** performance.now() of the underlying observation. */
  t: number;
}

/**
 * Input abstraction. Camera fingertip now; mouse lands in Milestone 1.
 * Pen up/down is added in Milestone 1 as well.
 */
export interface PointerSource {
  readonly kind: 'camera' | 'mouse';
  /** Latest position, or null when there is nothing to show (no hand, stale data). */
  latest(): PointerSample | null;
}

export class CameraPointerSource implements PointerSource {
  readonly kind = 'camera';

  constructor(
    private readonly tracker: TrackerClient,
    private readonly getMap: () => CoverMap,
    /** Hide the cursor if tracking results are older than this. */
    private readonly staleMs = 300,
  ) {}

  latest(): PointerSample | null {
    const r = this.tracker.latest;
    if (!r || !r.hand) return null;
    if (performance.now() - r.receivedAt > this.staleMs) return null;
    const i = LM.INDEX_TIP * 3;
    const p = this.getMap()(r.hand.landmarks[i], r.hand.landmarks[i + 1]);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return { x: p.x, y: p.y, t: r.receivedAt };
  }
}
