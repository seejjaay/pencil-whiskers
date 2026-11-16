import type { TrackerStats } from '../tracking/trackerClient';
import { RateMeter, Sampler } from './stats';

/** Main-thread render metrics, fed from the rAF loop. */
export class RenderStats {
  readonly rate = new RateMeter(1000);
  /** rAF-to-rAF interval. */
  readonly frameMs = new Sampler(240);
  /** Time spent inside our own frame callback. */
  readonly workMs = new Sampler(240);
  longFrames = 0;
  private last = 0;

  frame(now: number, workMs: number): void {
    if (this.last > 0) {
      const dt = now - this.last;
      this.frameMs.add(dt);
      if (dt > 25) this.longFrames++;
    }
    this.last = now;
    this.rate.tick(now);
    this.workMs.add(workMs);
  }
}

export interface Snapshot {
  renderFps: number;
  frameMsP50: number;
  frameMsP95: number;
  frameMsMax: number;
  longFrames: number;
  renderWorkMsP95: number;
  cameraFps: number;
  trackFps: number;
  handFps: number;
  inferMsP50: number;
  inferMsP95: number;
  grabToResultP50: number;
  grabToResultP95: number;
  captureToResultP50: number;
  captureToResultP95: number;
  grabMsP50: number;
  grabMsP95: number;
  skippedBusy: number;
  delegate: string;
  modelLoadMs: number;
  trackInput: string;
  video: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function snapshot(now: number, render: RenderStats, t: TrackerStats, video: string): Snapshot {
  return {
    renderFps: render.rate.rate(now),
    frameMsP50: r1(render.frameMs.percentile(50)),
    frameMsP95: r1(render.frameMs.percentile(95)),
    frameMsMax: r1(render.frameMs.max()),
    longFrames: render.longFrames,
    renderWorkMsP95: r1(render.workMs.percentile(95)),
    cameraFps: t.cameraFps,
    trackFps: t.trackFps,
    handFps: t.handFps,
    inferMsP50: r1(t.inferMs.percentile(50)),
    inferMsP95: r1(t.inferMs.percentile(95)),
    grabToResultP50: r1(t.grabToResultMs.percentile(50)),
    grabToResultP95: r1(t.grabToResultMs.percentile(95)),
    captureToResultP50: r1(t.captureToResultMs.percentile(50)),
    captureToResultP95: r1(t.captureToResultMs.percentile(95)),
    grabMsP50: r1(t.grabMs.percentile(50)),
    grabMsP95: r1(t.grabMs.percentile(95)),
    skippedBusy: t.skippedBusy,
    delegate: t.delegate ? `${t.delegate}${t.fellBack ? ' (GPU failed)' : ''}` : '-',
    modelLoadMs: Math.round(t.loadMs),
    trackInput: t.inputSize,
    video,
  };
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '-');

export function renderHud(el: HTMLElement, s: Snapshot, extra: string[]): void {
  el.textContent = [
    `render   ${fmt(s.renderFps)} fps   frame p50 ${fmt(s.frameMsP50)} / p95 ${fmt(s.frameMsP95)} ms   long ${s.longFrames}`,
    `camera   ${fmt(s.cameraFps)} fps   ${s.video}`,
    `tracking ${fmt(s.trackFps)} fps   hand ${fmt(s.handFps)} fps   ${s.delegate}   in ${s.trackInput}`,
    `infer    p50 ${fmt(s.inferMsP50)} / p95 ${fmt(s.inferMsP95)} ms   grab p50 ${fmt(s.grabMsP50)} ms`,
    `latency  grab→result p50 ${fmt(s.grabToResultP50)} / p95 ${fmt(s.grabToResultP95)} ms`,
    `         capture→result p50 ${fmt(s.captureToResultP50)} / p95 ${fmt(s.captureToResultP95)} ms`,
    ...extra,
    `[D] hud  [M] camera/mouse  [T] tuning`,
  ].join('\n');
}
