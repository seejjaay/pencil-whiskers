import { describe, expect, it } from 'vitest';
import { RateMeter, Sampler } from '../src/debug/stats';

describe('RateMeter', () => {
  it('reports 60/s for ticks every 16.67ms', () => {
    const m = new RateMeter(1000);
    let t = 0;
    for (let i = 0; i < 300; i++) {
      t = i * (1000 / 60);
      m.tick(t);
    }
    expect(m.rate(t)).toBeCloseTo(60, 0);
  });

  it('decays to 0 when ticks stop', () => {
    const m = new RateMeter(1000);
    for (let i = 0; i < 30; i++) m.tick(i * 33);
    expect(m.rate(33 * 29 + 1001)).toBe(0);
  });
});

describe('Sampler', () => {
  it('computes nearest-rank percentiles', () => {
    const s = new Sampler(100);
    for (let i = 1; i <= 100; i++) s.add(i);
    expect(s.percentile(50)).toBe(50);
    expect(s.percentile(95)).toBe(95);
    expect(s.percentile(100)).toBe(100);
    expect(s.percentile(0)).toBe(1);
    expect(s.mean()).toBeCloseTo(50.5);
    expect(s.max()).toBe(100);
  });

  it('keeps only the most recent `capacity` samples', () => {
    const s = new Sampler(4);
    [1, 2, 3, 4, 100, 200].forEach((v) => s.add(v));
    expect(s.count).toBe(4);
    expect(s.values().sort((a, b) => a - b)).toEqual([3, 4, 100, 200]);
  });

  it('ignores non-finite samples and is NaN when empty', () => {
    const s = new Sampler(4);
    s.add(NaN);
    s.add(Infinity);
    expect(s.count).toBe(0);
    expect(Number.isNaN(s.percentile(50))).toBe(true);
  });
});
