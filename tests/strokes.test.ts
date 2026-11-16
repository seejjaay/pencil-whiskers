import { describe, expect, it } from 'vitest';
import { StrokeRecorder, pathLength } from '../src/input/strokes';

const down = (x: number, y: number, t: number) => ({ x, y, t, down: true });
const up = (x: number, y: number, t: number) => ({ x, y, t, down: false });

describe('StrokeRecorder', () => {
  it('records a stroke from pen down to pen up', () => {
    const r = new StrokeRecorder({ tailTrimMs: 0, minPathPx: 10 });
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
    const r = new StrokeRecorder({ tailTrimMs: 50, minPathPx: 10 });
    for (let i = 0; i <= 10; i++) r.push(down(i * 20, 0, i * 20)); // ends at t=200
    const ev = r.push(up(200, 0, 210));
    const xs = ev!.stroke.points.map((p) => p.x);
    expect(Math.max(...xs)).toBe(160); // released at t=210: points with t > 160 dropped
  });

  it('never trims below two points', () => {
    const r = new StrokeRecorder({ tailTrimMs: 10_000, minPathPx: 1 });
    r.push(down(0, 0, 0));
    r.push(down(30, 0, 10));
    r.push(down(60, 0, 20));
    const ev = r.push(up(60, 0, 30));
    expect(ev!.stroke.points.length).toBe(2);
  });

  it('discards taps shorter than minPathPx', () => {
    const r = new StrokeRecorder({ tailTrimMs: 0, minPathPx: 24 });
    r.push(down(0, 0, 0));
    r.push(down(5, 5, 30));
    expect(r.push(up(5, 5, 60))?.type).toBe('discarded');
  });

  it('collapses stationary samples instead of piling duplicates', () => {
    const r = new StrokeRecorder({ tailTrimMs: 0, minPathPx: 1 });
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
