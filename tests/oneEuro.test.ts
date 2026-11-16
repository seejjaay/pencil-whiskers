import { describe, expect, it } from 'vitest';
import { OneEuro2D } from '../src/input/oneEuro';

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HZ = 26; // measured tracking rate on the target laptop
const DT = 1000 / HZ;

describe('OneEuro2D', () => {
  it('passes the first sample through unchanged', () => {
    const f = new OneEuro2D();
    expect(f.filter(100, 200, 0)).toEqual({ x: 100, y: 200 });
  });

  it('cuts jitter on a still hand by at least 3x', () => {
    const r = rng(1);
    const f = new OneEuro2D();
    let rawVar = 0;
    let outVar = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const nx = (r() - 0.5) * 8; // +-4 px landmark jitter
      const ny = (r() - 0.5) * 8;
      const o = f.filter(500 + nx, 300 + ny, i * DT);
      if (i > 30) {
        rawVar += nx * nx + ny * ny;
        outVar += (o.x - 500) ** 2 + (o.y - 300) ** 2;
      }
    }
    expect(outVar * 3).toBeLessThan(rawVar);
  });

  it('keeps lag small on a fast move (speed-adaptive cutoff)', () => {
    const f = new OneEuro2D();
    const speed = 1200; // px/s, a brisk stroke
    let lag = 0;
    for (let i = 0; i <= 20; i++) {
      const t = i * DT;
      const x = (speed * t) / 1000;
      lag = x - f.filter(x, 0, t).x;
    }
    // Lag behind the true position after ~0.8 s of steady motion.
    expect(lag).toBeLessThan(40);
    expect(lag).toBeGreaterThanOrEqual(0);
  });

  it('lags more with beta = 0 than with the default beta', () => {
    const run = (beta: number) => {
      const f = new OneEuro2D({ minCutoff: 1.5, beta, dCutoff: 1 });
      let out = 0;
      for (let i = 0; i <= 20; i++) out = f.filter(i * 40, 0, i * DT).x;
      return 800 - out;
    };
    expect(run(0)).toBeGreaterThan(run(0.01) * 2);
  });

  it('survives duplicate timestamps and resets cleanly', () => {
    const f = new OneEuro2D();
    f.filter(0, 0, 100);
    const o = f.filter(10, 10, 100);
    expect(Number.isFinite(o.x)).toBe(true);
    f.reset();
    expect(f.filter(900, 900, 200)).toEqual({ x: 900, y: 900 });
  });
});
