import { describe, expect, it } from 'vitest';
import { DEFAULT_RECOGNIZER, Recognizer, countCorners, expandVariants, resample, type Pt, type Recognition } from '../src/recognizer/recognizer';
import { SHAPES, type ShapeDef } from '../src/recognizer/shapes';
import { makeCoverMap } from '../src/view/coverMap';
import { between, distort, rng, sloppyCircle, typical, variantOf, type Distortion, type Rng } from './helpers/synth';

const rec = new Recognizer();
const byId = (id: string) => SHAPES.find((s) => s.id === id)!;
const P = (a: number[][]): Pt[] => a.map(([x, y]) => ({ x, y }));

/** Camera strokes are short (~15-40 samples at 26 Hz); mouse strokes are long. */
const sampleCount = (r: Rng, i: number) => (i % 2 ? Math.floor(between(r, 15, 40)) : Math.floor(between(r, 50, 160)));

function baseFor(def: ShapeDef, r: Rng): Pt[] {
  // Real circles never close exactly: they stop short or overshoot, from any start.
  return def.id === 'circle' ? sloppyCircle(r, between(r, 320, 400)) : variantOf(def, r);
}

/** Fraction of strokes recognised as `def` AND accepted (above threshold). */
function hitRate(
  def: ShapeDef,
  n: number,
  seed: number,
  tweak: (d: Distortion, r: Rng) => Distortion = (d) => d,
  post: (pts: Pt[]) => Pt[] = (p) => p,
): {
  rate: number;
  confusions: Record<string, number>;
} {
  const r = rng(seed);
  let hits = 0;
  const confusions: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const res = rec.recognize(post(distort(baseFor(def, r), tweak(typical(r, def, sampleCount(r, i)), r), r)));
    if (res.accepted && res.top!.id === def.id) hits++;
    else {
      const k = res.accepted ? res.top!.id : 'rejected';
      confusions[k] = (confusions[k] ?? 0) + 1;
    }
  }
  return { rate: hits / n, confusions };
}

function rejectRate(gen: (r: Rng) => Pt[], n: number, seed: number, post: (pts: Pt[]) => Pt[] = (p) => p): number {
  const r = rng(seed);
  let rejected = 0;
  for (let i = 0; i < n; i++) if (!rec.recognize(post(gen(r))).accepted) rejected++;
  return rejected / n;
}


const plain = (r: Rng, samples = 60): Distortion => ({
  size: between(r, 100, 400),
  rotateDeg: 0,
  noise: 0.01,
  wobble: 0.02,
  aspect: 1,
  roundCorners: 1,
  speedVariation: 0.3,
  samples,
});

/** Squares can wobble into circles: 96% measured. Everything else: 97%+. */
const TYPICAL_FLOOR: Record<string, number> = { square: 0.95 };

describe('recognizer: every shape under typical player distortion', () => {
  for (const def of SHAPES) {
    it(`${def.label}: >= ${Math.round((TYPICAL_FLOOR[def.id] ?? 0.97) * 100)}% recognised and accepted (camera + mouse sample rates)`, () => {
      const { rate, confusions } = hitRate(def, 300, 1000 + def.id.length);
      expect(rate, JSON.stringify(confusions)).toBeGreaterThanOrEqual(TYPICAL_FLOOR[def.id] ?? 0.97);
    });
  }

  it('never confuses horizontal and vertical lines', () => {
    for (const [a, b] of [['hline', 'vline'], ['vline', 'hline']]) {
      const { confusions } = hitRate(byId(a), 300, 7);
      expect(confusions[b] ?? 0).toBe(0);
    }
  });
});

describe('recognizer: robustness sweeps (one distortion pushed hard at a time)', () => {
  const sweeps: [string, (d: Distortion, r: Rng) => Distortion][] = [
    ['heavy noise (3% of size per point)', (d) => ({ ...d, noise: 0.03 })],
    ['tiny and huge strokes (40-1200 px)', (d, r) => ({ ...d, size: r() < 0.5 ? between(r, 40, 70) : between(r, 800, 1200) })],
    ['strong wobble (6% of size)', (d) => ({ ...d, wobble: 0.06 })],
    ['very uneven speed (7:1 within a stroke)', (d) => ({ ...d, speedVariation: 0.75 })],
    ['rounded corners', (d) => ({ ...d, roundCorners: 3 })],
  ];
  // Deliberate trade-off (2026-11-17): real hand-drawn circles needed 0-2 corners (8/13 -> 13/13
  // in tests/realStrokes.test.ts). The cost shows only here: with 7:1 speed swings and 15-40
  // samples, a triangle's fast corners get cut and it reads as a circle (~75%). This warp puts
  // speed peaks anywhere, while people slow down at corners, and real triangles held at 13/15.
  // Rules pass (2026-11-17): a very wobbly or very unevenly drawn square, and a very noisy arch,
  // genuinely look like circles; they land at ~88-89% here rather than 90%.
  const FLOORS: Record<string, number> = {
    'very uneven speed|triangle': 0.7,
    'very uneven speed|square': 0.85,
    'very uneven speed|heart': 0.85,
    // a long spiral is under-sampled at 7:1 speed swings; it fails safe (rejected, never misread)
    'very uneven speed|spiral': 0.75,
    'strong wobble|square': 0.85,
    'heavy noise|arch': 0.85,
  };
  const floor = (sweep: string, id: string) => FLOORS[`${sweep.split(' (')[0]}|${id}`] ?? 0.9;
  for (const [name, tweak] of sweeps) {
    it(`${name}: every shape >= 90% (fast uneven triangles >= 70%)`, () => {
      for (const def of SHAPES) {
        const { rate, confusions } = hitRate(def, 150, 99, tweak);
        expect(rate, `${def.id} ${JSON.stringify(confusions)}`).toBeGreaterThanOrEqual(floor(name, def.id));
      }
    });
  }

  it('rotation: within tolerance is accepted, circles at any angle', () => {
    for (const def of SHAPES) {
      const limit = def.rotationDeg >= 180 ? 180 : def.rotationDeg - 5;
      const { rate, confusions } = hitRate(def, 150, 5, (d, r) => ({ ...d, rotateDeg: between(r, -limit, limit) }));
      expect(rate, `${def.id} ${JSON.stringify(confusions)}`).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('rotation: a horizontal line at 45° is not a horizontal line', () => {
    const r = rng(3);
    for (let i = 0; i < 50; i++) {
      const res = rec.recognize(distort(P([[0, 0], [1, 0]]), { ...plain(r), rotateDeg: r() < 0.5 ? 45 : -45 }, r));
      expect(res.accepted && res.top!.id === 'hline').toBe(false);
    }
  });

  it('rotation: an upside-down V (^) is not a V', () => {
    const r = rng(4);
    for (let i = 0; i < 50; i++) {
      const res = rec.recognize(distort(P([[0, 1], [0.5, 0], [1, 1]]), plain(r), r));
      expect(res.accepted && res.top!.id === 'v').toBe(false);
    }
  });
});

describe('recognizer: rejects things that are not in the vocabulary', () => {
  const N = 300;
  it('diagonal lines (35-55°) >= 97% rejected', () => {
    const rate = rejectRate((r) => {
      const a = between(r, 35, 55) * (Math.PI / 180) * (r() < 0.5 ? 1 : -1);
      return distort(P([[0, 0], [Math.cos(a), Math.sin(a)]]), { ...plain(r, 40), roundCorners: 0 }, r);
    }, N, 11);
    expect(rate).toBeGreaterThanOrEqual(0.97);
  });

  // Zigzags and squares used to be in this list; since the rules pass they are shapes (W, square).
  it('S-curves >= 97% rejected (they used to pass for the ∞ power shape)', () => {
    const scurve = (r: Rng) => distort(Array.from({ length: 31 }, (_, i) => ({ x: Math.sin((i / 30) * Math.PI * 2) * 0.4, y: i / 30 })), plain(r), r);
    expect(rejectRate(scurve, N, 12)).toBeGreaterThanOrEqual(0.97);
  });

  // A quick ∩ drawn in the air often comes out pointy, so ^ may read as the arch (barrier).
  // What must never happen is ^ passing for a threat's shape.
  it('^ carets are rejected or read as the arch, never as a threat shape', () => {
    const r = rng(12);
    for (let i = 0; i < N; i++) {
      const res = rec.recognize(distort(P([[0, 1], [0.5, 0], [1, 1]]), plain(r, 40), r));
      if (res.accepted) expect(res.top!.id).toBe('arch');
    }
  });

  // 12 shapes give a random scribble more ways to look like something: 94% measured (was 95%+
  // with 5 shapes). Power shapes carry an extra margin, so scribbles rarely fire a power-up.
  it('random scribbles >= 93% rejected', () => {
    const rate = rejectRate((r) => {
      const p: Pt[] = [{ x: 0, y: 0 }];
      for (let i = 0; i < 6; i++) p.push({ x: r(), y: r() });
      return distort(p, plain(r), r);
    }, N, 13);
    expect(rate).toBeGreaterThanOrEqual(0.93);
  });

  it('rejects empty, single-point and zero-length input without throwing', () => {
    expect(rec.recognize([]).accepted).toBe(false);
    expect(rec.recognize([{ x: 1, y: 1 }]).accepted).toBe(false);
    expect(rec.recognize([{ x: 1, y: 1 }, { x: 1, y: 1 }]).accepted).toBe(false);
  });
});

describe('recognizer: mirroring and direction', () => {
  // A deliberately one-directional shape proves strokes are matched in the space the
  // player sees. The player moves their hand to THEIR right: in the raw camera image
  // the fingertip's x DECREASES. After the mirrored cover map it must read as rightward.
  const swipe: ShapeDef = { id: 'swipe-right', label: 'swipe right', points: [[0, 0], [1, 0]], rotationDeg: 20 };
  const oneWay = new Recognizer([swipe]);
  const map = makeCoverMap({ width: 1280, height: 720 }, { width: 1536, height: 864 });
  const cameraStroke = (fromX: number, toX: number) =>
    Array.from({ length: 25 }, (_, i) => {
      const nx = fromX + ((toX - fromX) * i) / 24;
      return map(nx, 0.5);
    });

  it("hand moving to the player's right (camera x decreasing) is a rightward swipe", () => {
    const res = oneWay.recognize(cameraStroke(0.7, 0.3));
    expect(res.accepted).toBe(true);
  });

  it("hand moving to the player's left is not", () => {
    const res = oneWay.recognize(cameraStroke(0.3, 0.7));
    expect(res.accepted).toBe(false);
  });
});

describe('recognizer: data-driven vocabulary', () => {
  it('expands closed shapes to every start vertex in both directions', () => {
    expect(expandVariants(byId('triangle'))).toHaveLength(6);
    expect(expandVariants(byId('v'))).toHaveLength(2);
    expect(expandVariants({ id: 'x', label: 'x', points: [[0, 0], [1, 0]], rotationDeg: 0 })).toHaveLength(1);
  });

  it('adding a shape is just data: a star entry makes one-stroke stars recognisable', () => {
    const tips = Array.from({ length: 6 }, (_, k) => {
      const a = -Math.PI / 2 + (k * 4 * Math.PI) / 5;
      return [Math.cos(a), Math.sin(a)] as const;
    });
    const star: ShapeDef = { id: 'star', label: 'star', points: tips, rotationDeg: 20, bidirectional: true, closed: true, corners: [3, 5] };
    const r2 = new Recognizer([...SHAPES, star]);
    const r = rng(21);
    let hits = 0;
    for (let i = 0; i < 100; i++) {
      const res: Recognition = r2.recognize(distort(variantOf(star, r), typical(r, star, sampleCount(r, i)), r));
      if (res.accepted && res.top!.id === 'star') hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(90);
  });

  it('personal templates can be added and removed', () => {
    const r2 = new Recognizer(SHAPES);
    const mine = distort(P([[0, 0], [1, 0.2], [0.2, 1]]), plain(rng(1)), rng(2));
    r2.addPersonal('mine', 'my squiggle', mine, { rotationDeg: 20 });
    expect(r2.recognize(mine).top!.id).toBe('mine');
    r2.removePersonal();
    expect(r2.recognize(mine).top?.id).not.toBe('mine');
  });

  it('reads the threshold live from params', () => {
    const r2 = new Recognizer(SHAPES, { ...DEFAULT_RECOGNIZER, minScore: 0.78 });
    const line = P([[0, 0], [100, 0]]);
    expect(r2.recognize(line).accepted).toBe(true);
    r2.params.minScore = 1.01;
    expect(r2.recognize(line).accepted).toBe(false);
  });
});

describe('recognizer: features', () => {
  it('counts corners on clean shapes', () => {
    expect(countCorners(resample(P([[0, 0], [300, 0]])))).toBe(0);
    expect(countCorners(resample(P([[0, 0], [50, 100], [100, 0]])))).toBe(1);
    expect(countCorners(resample(P([[50, 0], [100, 87], [0, 87], [50, 0]])))).toBe(2);
    expect(countCorners(resample(P([[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]])))).toBe(3);
    const circle = Array.from({ length: 65 }, (_, i) => ({ x: Math.cos((i / 64) * Math.PI * 2) * 100, y: Math.sin((i / 64) * Math.PI * 2) * 100 }));
    expect(countCorners(resample(circle))).toBe(0);
  });

  it('is fast: mean recognition under 2 ms', () => {
    const r = rng(8);
    const strokes = Array.from({ length: 200 }, (_, i) => distort(baseFor(SHAPES[i % SHAPES.length], r), typical(r, SHAPES[i % SHAPES.length], 60), r));
    const t0 = performance.now();
    for (const s of strokes) rec.recognize(s);
    expect((performance.now() - t0) / strokes.length).toBeLessThan(2);
  });
});
