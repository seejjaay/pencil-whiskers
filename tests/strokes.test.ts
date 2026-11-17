import { describe, expect, it } from 'vitest';
import { StrokeRecorder, pathLength, smoothStroke } from '../src/input/strokes';

const down = (x: number, y: number, t: number) => ({ x, y, t, down: true });
const up = (x: number, y: number, t: number) => ({ x, y, t, down: false });

describe('StrokeRecorder', () => {
  it('records a stroke from pen down to pen up', () => {
    const r = new StrokeRecorder({ tailTrimMs: 0, minPathPx: 10, maxTrimPx: 1e9, smoothPasses: 0 });
    expect(r.push(down(0, 0, 0))).toBeNull();
    r.push(down(50, 0, 40));
    r.push(down(100, 0, 80));
    const ev = r.push(up(100, 0, 120));
    expect(ev?.type).toBe('stroke');
    expect(ev?.stroke.points.map((p) => p.x)).toEqual([0, 50, 100]);
    expect(r.current).toBeNull();
  });

  it('ignores pen-up samples when no stroke is active', () => {
    const r = new StrokeRecorder();
    expect(r.push(up(1, 1, 0))).toBeNull();
  });

  it('trims the release tail', () => {
    const r = new StrokeRecorder({ tailTrimMs: 50, minPathPx: 10, maxTrimPx: 1e9, smoothPasses: 0 });
    for (let i = 0; i <= 10; i++) r.push(down(i * 20, 0, i * 20)); // ends at t=200
    const ev = r.push(up(200, 0, 210));
    const xs = ev!.stroke.points.map((p) => p.x);
    expect(Math.max(...xs)).toBe(160); // released at t=210: points with t > 160 dropped
  });

  it('never trims below two points', () => {
    const r = new StrokeRecorder({ tailTrimMs: 10_000, minPathPx: 1, maxTrimPx: 1e9, smoothPasses: 0 });
    r.push(down(0, 0, 0));
    r.push(down(30, 0, 10));
    r.push(down(60, 0, 20));
    const ev = r.push(up(60, 0, 30));
    expect(ev!.stroke.points.length).toBe(2);
  });

  it('discards taps shorter than minPathPx', () => {
    const r = new StrokeRecorder({ tailTrimMs: 0, minPathPx: 24, maxTrimPx: 1e9, smoothPasses: 0 });
    r.push(down(0, 0, 0));
    r.push(down(5, 5, 30));
    expect(r.push(up(5, 5, 60))?.type).toBe('discarded');
  });

  it('collapses stationary samples instead of piling duplicates', () => {
    const r = new StrokeRecorder({ tailTrimMs: 0, minPathPx: 1, maxTrimPx: 1e9, smoothPasses: 0 });
    r.push(down(0, 0, 0));
    for (let i = 1; i < 10; i++) r.push(down(0.1, 0.1, i * 10));
    r.push(down(40, 0, 100));
    const ev = r.push(up(40, 0, 110));
    expect(ev!.stroke.points.length).toBe(2);
  });

  it('pathLength sums segment lengths', () => {
    expect(pathLength([{ x: 0, y: 0, t: 0 }, { x: 3, y: 4, t: 1 }, { x: 3, y: 10, t: 2 }])).toBe(11);
  });
});

describe('StrokeRecorder release handling', () => {
  const params = { tailTrimMs: 40, maxTrimPx: 24, minPathPx: 10, smoothPasses: 0 };

  it('drops points recorded after the real release moment (pen held down while confirming)', () => {
    const r = new StrokeRecorder({ ...params, tailTrimMs: 0 });
    for (let i = 0; i <= 10; i++) r.push(down(i * 10, 0, i * 33)); // last point t=330
    // Pen state confirmed the lift at t=330 but it began at t=264 (stamped just before).
    const ev = r.push({ x: 100, y: 0, t: 263.5, down: false, end: 'release' as const });
    expect(Math.max(...ev!.stroke.points.map((p) => p.t))).toBe(231);
    expect(ev!.end).toBe('release');
  });

  it('caps the tail trim by distance, so fast strokes keep their ends', () => {
    const r = new StrokeRecorder({ ...params, tailTrimMs: 50 });
    for (let i = 0; i <= 10; i++) r.push(down(i * 60, 0, i * 33)); // 60 px per frame: fast
    const ev = r.push(up(600, 0, 340));
    // A 50 ms time trim would remove 60+ px; the 24 px cap keeps everything.
    expect(Math.max(...ev!.stroke.points.map((p) => p.x))).toBe(600);
  });

  it('still trims small release hooks within the cap', () => {
    const r = new StrokeRecorder({ ...params, tailTrimMs: 50 });
    for (let i = 0; i <= 10; i++) r.push(down(i * 30, 0, i * 33));
    r.push(down(305, 8, 340)); // little hook as the fingers open
    const ev = r.push(up(305, 8, 350));
    expect(ev!.stroke.points[ev!.stroke.points.length - 1]).toMatchObject({ x: 300, y: 0 });
  });

  it('reports why the stroke ended (mouse up defaults to release when unspecified)', () => {
    const r = new StrokeRecorder({ ...params });
    r.push(down(0, 0, 0));
    r.push(down(100, 0, 50));
    expect(r.push({ x: 100, y: 0, t: 400, down: false, end: 'mouse' as const })?.end).toBe('mouse');
    r.push(down(0, 0, 500));
    r.push(down(100, 0, 550));
    expect(r.push(up(100, 0, 900))?.end).toBe('release');
  });
});

describe('smoothStroke', () => {
  const noisyLine = (seed: number) => {
    let s = seed;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
    return Array.from({ length: 60 }, (_, i) => ({ x: i * 10, y: rand() * 12, t: i * 33 }));
  };
  const rms = (pts: { y: number }[]) => Math.sqrt(pts.slice(2, -2).reduce((a, p) => a + p.y * p.y, 0) / (pts.length - 4));

  it('roughly halves sample jitter with two passes', () => {
    const raw = noisyLine(7);
    expect(rms(smoothStroke(raw, 2)) * 1.7).toBeLessThan(rms(raw));
  });

  it('keeps both endpoints exactly and never mutates the input', () => {
    const raw = noisyLine(3);
    const copy = raw.map((p) => ({ ...p }));
    const out = smoothStroke(raw, 3);
    expect(out[0]).toEqual(raw[0]);
    expect(out[out.length - 1]).toEqual(raw[raw.length - 1]);
    expect(raw).toEqual(copy);
  });

  it('0 passes is an identical copy; short strokes pass through', () => {
    const raw = noisyLine(1);
    expect(smoothStroke(raw, 0)).toEqual(raw);
    const two = [{ x: 0, y: 0, t: 0 }, { x: 5, y: 5, t: 1 }];
    expect(smoothStroke(two, 4)).toEqual(two);
  });
});

describe('StrokeRecorder false pinches', () => {
  it('a one-frame false pinch (then open hand, held by the release hold) is discarded, not a 2-point line', () => {
    // Real case from the 2026-11-17 log (#56): ratio dipped under press for one frame while
    // the hand moved, then read ~1.0; the hold kept the pen down while the hand kept moving.
    const r = new StrokeRecorder({ tailTrimMs: 40, maxTrimPx: 24, minPathPx: 24, smoothPasses: 0 });
    r.push(down(705, 433, 0));
    r.push(down(704, 388, 65)); // already open (released at t=65)
    r.push(down(704, 373, 98));
    r.push(down(703, 358, 160));
    const ev = r.push({ x: 703, y: 346, t: 64.5, down: false, end: 'release' as const });
    expect(ev?.type).toBe('discarded');
  });
});
