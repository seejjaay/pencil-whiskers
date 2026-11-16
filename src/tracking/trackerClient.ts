import { RateMeter, Sampler } from '../debug/stats';
import type { Delegate, FromWorker, HandFrame, ToWorker } from './protocol';

export interface TrackerOptions {
  wasmBase: string;
  modelUrl: string;
  delegate: Delegate;
  /** Width of the bitmap sent to the worker (height keeps aspect). 0 = native. */
  inputWidth: number;
  /** Give up on model load after this long. */
  loadTimeoutMs: number;
}

export interface TrackResult {
  hand: HandFrame | null;
  /** performance.now() when the result arrived on the main thread. */
  receivedAt: number;
  /** When the frame was captured (rVFC captureTime, else grab time): the right clock for filtering. */
  frameTime: number;
  frameId: number;
}

export interface TrackerStats {
  cameraFps: number;
  trackFps: number;
  handFps: number;
  inferMs: Sampler;
  /** Frame grab start (rVFC callback) -> result on main. */
  grabToResultMs: Sampler;
  /** Camera capture timestamp (rVFC metadata.captureTime) -> result on main, when available. */
  captureToResultMs: Sampler;
  /** createImageBitmap call -> resolve, on the main thread. */
  grabMs: Sampler;
  skippedBusy: number;
  delegate: Delegate | null;
  fellBack: boolean;
  loadMs: number;
  inputSize: string;
}

export function emptyTrackerStats(): TrackerStats {
  return {
    cameraFps: 0,
    trackFps: 0,
    handFps: 0,
    inferMs: new Sampler(120),
    grabToResultMs: new Sampler(120),
    captureToResultMs: new Sampler(120),
    grabMs: new Sampler(120),
    skippedBusy: 0,
    delegate: null,
    fellBack: false,
    loadMs: NaN,
    inputSize: '-',
  };
}

interface Pending {
  frameId: number;
  grabStart: number;
  captureTime: number | undefined;
}

export class TrackerClient {
  /** Latest result. The render loop reads this; nothing ever awaits it. */
  latest: TrackResult | null = null;
  lastError: string | null = null;
  /** Called synchronously for every result, in order. Keep handlers cheap. */
  readonly listeners = new Set<(r: TrackResult) => void>();

  private worker: Worker | null = null;
  private ready = false;
  private inFlight: Pending | null = null;
  private nextFrameId = 1;
  private rvfcHandle = 0;
  private stopped = false;

  private cameraRate = new RateMeter(1000);
  private trackRate = new RateMeter(1000);
  private handRate = new RateMeter(1000);
  readonly stats: TrackerStats = emptyTrackerStats();

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly opts: TrackerOptions,
  ) {}

  /** Loads the model in the worker, then starts pumping frames. Rejects on failure/timeout. */
  start(): Promise<void> {
    this.worker = new Worker(new URL('./hand.worker.ts', import.meta.url), { type: 'module', name: 'hand-tracker' });

    const readyPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Hand model did not load within ${Math.round(this.opts.loadTimeoutMs / 1000)} s.`)),
        this.opts.loadTimeoutMs,
      );
      this.worker!.onerror = (e) => {
        clearTimeout(timer);
        reject(new Error(`Tracking worker crashed: ${e.message || 'unknown error'}`));
      };
      this.worker!.onmessage = (e: MessageEvent<FromWorker>) => {
        const msg = e.data;
        if (msg.type === 'ready') {
          clearTimeout(timer);
          this.ready = true;
          this.stats.delegate = msg.delegate;
          this.stats.fellBack = msg.fellBack;
          this.stats.loadMs = msg.loadMs;
          resolve();
        } else if (msg.type === 'error' && msg.stage === 'init') {
          clearTimeout(timer);
          reject(new Error(msg.message));
        } else {
          this.onMessage(msg);
        }
      };
    });

    this.post({ type: 'init', wasmBase: this.opts.wasmBase, modelUrl: this.opts.modelUrl, delegate: this.opts.delegate });
    this.rvfcHandle = this.video.requestVideoFrameCallback(this.onVideoFrame);
    return readyPromise;
  }

  stop(): void {
    this.stopped = true;
    this.video.cancelVideoFrameCallback(this.rvfcHandle);
    this.worker?.terminate();
    this.worker = null;
  }

  /** Refreshes the fps numbers in `stats`. Call from the HUD, not every frame. */
  sampleRates(now: number): void {
    this.stats.cameraFps = this.cameraRate.rate(now);
    this.stats.trackFps = this.trackRate.rate(now);
    this.stats.handFps = this.handRate.rate(now);
  }

  private post(msg: ToWorker, transfer: Transferable[] = []): void {
    this.worker?.postMessage(msg, transfer);
  }

  private onVideoFrame = (now: number, meta: VideoFrameCallbackMetadata): void => {
    if (this.stopped) return;
    this.rvfcHandle = this.video.requestVideoFrameCallback(this.onVideoFrame);
    this.cameraRate.tick(now);
    if (!this.ready) return;
    if (this.inFlight) {
      // Backpressure: never queue frames. Skipping keeps latency flat.
      this.stats.skippedBusy++;
      return;
    }
    const pending: Pending = {
      frameId: this.nextFrameId++,
      grabStart: performance.now(),
      captureTime: meta.captureTime,
    };
    this.inFlight = pending;

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const w = this.opts.inputWidth > 0 && this.opts.inputWidth < vw ? this.opts.inputWidth : vw;
    const h = Math.round((vh * w) / vw);
    this.stats.inputSize = `${w}x${h}`;
    const grab = w === vw ? createImageBitmap(this.video) : createImageBitmap(this.video, { resizeWidth: w, resizeHeight: h, resizeQuality: 'low' });

    grab.then(
      (bitmap) => {
        this.stats.grabMs.add(performance.now() - pending.grabStart);
        if (this.stopped || !this.worker) {
          bitmap.close();
          return;
        }
        this.post({ type: 'frame', frameId: pending.frameId, timestampMs: now, bitmap }, [bitmap]);
      },
      (err) => {
        this.lastError = `Frame grab failed: ${String(err)}`;
        this.inFlight = null;
      },
    );
  };

  private onMessage(msg: FromWorker): void {
    if (msg.type === 'error') {
      this.lastError = msg.message;
      return;
    }
    if (msg.type !== 'result') return;
    const now = performance.now();
    const p = this.inFlight;
    let frameTime = now;
    if (p && p.frameId === msg.frameId) {
      frameTime = p.captureTime ?? p.grabStart;
      this.stats.grabToResultMs.add(now - p.grabStart);
      if (p.captureTime !== undefined) this.stats.captureToResultMs.add(now - p.captureTime);
      this.inFlight = null;
    }
    this.stats.inferMs.add(msg.inferMs);
    this.trackRate.tick(now);
    if (msg.hand) this.handRate.tick(now);
    this.latest = { hand: msg.hand, receivedAt: now, frameTime, frameId: msg.frameId };
    for (const fn of this.listeners) fn(this.latest);
  }
}
