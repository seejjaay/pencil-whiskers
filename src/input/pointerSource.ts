import type { TrackResult, TrackerClient } from '../tracking/trackerClient';
import type { CoverMap } from '../view/coverMap';
import { OneEuro2D, type OneEuroParams } from './oneEuro';
import { PenState, pinchPoint, pinchRatio, type PenParams } from './pinch';
import type { PointerSample, StrokeEnd } from './strokes';

export interface CursorState {
  x: number;
  y: number;
  down: boolean;
  /** performance.now() of the observation behind this position. */
  t: number;
}

/**
 * Input abstraction. Everything is in player space: mirrored screen CSS px, exactly what
 * the player sees, so strokes are recorded and matched in the same frame they are drawn.
 */
export interface PointerSource {
  readonly kind: 'camera' | 'mouse';
  /** All samples since the last call, oldest first. Feed these to the StrokeRecorder. */
  drain(): PointerSample[];
  /** Where to draw the cursor now, or null when there is nothing to show. */
  cursor(): CursorState | null;
  /** Forget any in-progress pen state (e.g. on mode switch). */
  reset(): void;
  dispose(): void;
}

const MAX_QUEUE = 256;

export interface CameraSourceDebug {
  ratio: number;
  down: boolean;
  /** Pen down, ratio above release, hold running. */
  releasing: boolean;
  hand: boolean;
}

export class CameraPointerSource implements PointerSource {
  readonly kind = 'camera';
  readonly debug: CameraSourceDebug = { ratio: NaN, down: false, releasing: false, hand: false };
  private queue: PointerSample[] = [];
  private last: CursorState | null = null;
  private lastHandAt = -Infinity;
  private readonly filter: OneEuro2D;
  private readonly pen: PenState;
  private readonly onResult = (r: TrackResult) => this.ingest(r);

  constructor(
    private readonly tracker: TrackerClient,
    private readonly getMap: () => CoverMap,
    private readonly getImageSize: () => { width: number; height: number },
    filterParams: OneEuroParams,
    penParams: PenParams,
    /** Hide the cursor when tracking is older than this. */
    private readonly staleMs = 300,
  ) {
    this.filter = new OneEuro2D(filterParams);
    this.pen = new PenState(penParams);
    tracker.listeners.add(this.onResult);
  }

  private ingest(r: TrackResult): void {
    const t = r.frameTime;
    if (!r.hand) {
      this.debug.hand = false;
      const wasDown = this.pen.down;
      const down = this.pen.update(null, t);
      this.debug.down = down;
      this.debug.releasing = false;
      // Pen lifted by losing the hand: emit the release so the recorder closes the stroke.
      if (wasDown && !down && this.last) this.pushEnd(this.last.x, this.last.y, NaN);
      if (down && this.last) this.last = { ...this.last, t };
      return;
    }
    const lm = r.hand.landmarks;
    const size = this.getImageSize();
    const ratio = pinchRatio(lm, size.width, size.height);
    const wasDown = this.pen.down;
    const down = this.pen.update(Number.isFinite(ratio) ? ratio : null, t);
    this.debug.ratio = ratio;
    this.debug.down = down;
    this.debug.releasing = this.pen.releasing;
    this.debug.hand = true;

    const n = pinchPoint(lm);
    const raw = this.getMap()(n.x, n.y);
    if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y)) {
      if (wasDown && !down && this.last) this.pushEnd(this.last.x, this.last.y, ratio);
      return;
    }
    // Hand reappeared after a gap: restart the filter so it doesn't glide from the old spot.
    if (t - this.lastHandAt > 250) this.filter.reset();
    this.lastHandAt = t;
    const p = this.filter.filter(raw.x, raw.y, t);
    this.last = { x: p.x, y: p.y, down, t };
    if (wasDown && !down) this.pushEnd(p.x, p.y, ratio);
    else this.push({ x: p.x, y: p.y, t, down, ratio });
  }

  /**
   * Pen-up sample stamped just before the moment the lift really began (see PenState.lastEnd),
   * so the recorder drops the frames recorded while the release hold / lost grace was running.
   */
  private pushEnd(x: number, y: number, ratio: number): void {
    const end = this.pen.lastEnd;
    const t = end ? end.at - 0.5 : performance.now();
    this.push({ x, y, t, down: false, ratio, end: end?.reason ?? 'release' });
  }

  private push(s: PointerSample): void {
    this.queue.push(s);
    if (this.queue.length > MAX_QUEUE) this.queue.shift();
  }

  drain(): PointerSample[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  cursor(): CursorState | null {
    if (!this.last) return null;
    if (performance.now() - this.last.t > this.staleMs) return null;
    return this.last;
  }

  reset(): void {
    this.pen.reset();
    this.filter.reset();
    this.queue = [];
    this.last = null;
  }

  dispose(): void {
    this.tracker.listeners.delete(this.onResult);
  }
}

/** Mouse/pen/touch: hold the button to draw. Uses coalesced events for full-rate input. */
export class MousePointerSource implements PointerSource {
  readonly kind = 'mouse';
  private queue: PointerSample[] = [];
  private last: CursorState | null = null;
  private down = false;
  private readonly ac = new AbortController();

  constructor(private readonly el: HTMLElement) {
    const opts = { signal: this.ac.signal };
    el.addEventListener('pointerdown', this.onDown, opts);
    el.addEventListener('pointermove', this.onMove, opts);
    el.addEventListener('pointerup', this.onUp, opts);
    el.addEventListener('pointercancel', this.onUp, opts);
    el.addEventListener('pointerleave', this.onLeave, opts);
  }

  private sample(e: PointerEvent, down: boolean, end?: StrokeEnd): void {
    const s: PointerSample = { x: e.clientX, y: e.clientY, t: e.timeStamp, down, end };
    this.queue.push(s);
    if (this.queue.length > MAX_QUEUE) this.queue.shift();
    this.last = s;
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // pointer no longer active (or synthetic): drawing still works without capture
    }
    this.down = true;
    this.sample(e, true);
  };

  private onMove = (e: PointerEvent) => {
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (events.length === 0) this.sample(e, this.down);
    else for (const c of events) this.sample(c, this.down);
  };

  private onUp = (e: PointerEvent) => {
    if (!this.down) return;
    this.down = false;
    this.sample(e, false, 'mouse');
  };

  private onLeave = () => {
    if (!this.down) this.last = null;
  };

  drain(): PointerSample[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  cursor(): CursorState | null {
    return this.last;
  }

  reset(): void {
    this.down = false;
    this.queue = [];
  }

  dispose(): void {
    this.ac.abort();
  }
}
