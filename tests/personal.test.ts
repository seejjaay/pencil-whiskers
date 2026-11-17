import { describe, expect, it } from 'vitest';
import type { LoggedStroke } from '../src/debug/strokeLog';
import { DEFAULT_RECORDER, StrokeRecorder, type PointerSample, type RecorderEvent, type StrokePoint } from '../src/input/strokes';
import { SAMPLES_PER_SHAPE, applyPersonal, checkSample, compactSample, parsePersonal, type PersonalSet } from '../src/recognizer/personal';
import { DEFAULT_RECOGNIZER, Recognizer, type Pt } from '../src/recognizer/recognizer';
import { SHAPES } from '../src/recognizer/shapes';
import fixture from './fixtures/real-strokes-2026-11-17.json';
import { between, distort, rng, variantOf, type Rng } from './helpers/synth';

const P = (a: number[][]): Pt[] => a.map(([x, y]) => ({ x, y }));
const plain = (r: Rng, samples = 60) => ({ size: between(r, 150, 400), rotateDeg: between(r, -8, 8), noise: 0.01, wobble: 0.02, aspect: 1, roundCorners: 1, speedVariation: 0.3, samples });
const standard = () => new Recognizer(SHAPES, { ...DEFAULT_RECOGNIZER });
/** A player whose hearts come out as one-stroke stars: nothing in the standard vocabulary claims those. */
const STAR = Array.from({ length: 6 }, (_, k) => { const a = -Math.PI / 2 + (k * 4 * Math.PI) / 5; return [Math.cos(a), Math.sin(a)]; });
const star = (r: Rng) => distort(P(STAR), plain(r), r);

describe('calibration sample checks', () => {
  it('refuses strokes too small to carry a shape', () => {
    expect(checkSample(standard(), 'circle', P([[0, 0], [10, 0], [10, 10], [0, 10]])).ok).toBe(false);
  });

  it('refuses a stroke that is clearly a different shape', () => {
    const r = rng(1);
    const tri = distort(variantOf(SHAPES.find((s) => s.id === 'triangle')!, r), plain(r), r);
    const res = checkSample(standard(), 'circle', tri);
    expect(res).toMatchObject({ ok: false });
    expect(res.ok ? '' : res.reason).toContain('triangle');
  });

  it('welcomes a quirky stroke the standard set merely rejects', () => {
    expect(checkSample(standard(), 'heart', star(rng(2))).ok).toBe(true);
  });
});

describe('personal set storage', () => {
  it('round-trips through JSON and drops junk', () => {
    const set: PersonalSet = { heart: [compactSample(star(rng(3)))] };
    expect(parsePersonal(JSON.parse(JSON.stringify(set)))).toEqual(set);
    const junk = {
      circle: [[{ x: 1, y: 'a' }, { x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]],
      nope: [P([[0, 0], [1, 1], [2, 2], [3, 3]])],
      v: Array.from({ length: 9 }, () => P([[0, 0], [1, 1], [2, 2], [3, 3]])),
    };
    const parsed = parsePersonal(junk);
    expect(parsed.circle).toBeUndefined();
    expect((parsed as Record<string, unknown>).nope).toBeUndefined();
    expect(parsed.v).toHaveLength(SAMPLES_PER_SHAPE);
    expect(parsePersonal('x')).toEqual({});
  });
});

describe('personal templates', () => {
  it("teach the player's own style: star-shaped 'hearts' go from rejected to recognised", () => {
    const base = standard();
    const r = rng(10);
    const tests = Array.from({ length: 60 }, () => star(r));
    expect(tests.filter((s) => base.recognize(s).accepted).length).toBe(0);

    const mine = standard();
    const cal = rng(20);
    applyPersonal(mine, { heart: Array.from({ length: 3 }, () => compactSample(star(cal))) });
    const hits = tests.filter((s) => {
      const res = mine.recognize(s);
      return res.accepted && res.top?.id === 'heart';
    }).length;
    expect(hits / tests.length).toBeGreaterThanOrEqual(0.9);
  });

  it("don't steal other shapes: triangles stay triangles after calibrating a quirky heart", () => {
    const mine = standard();
    const cal = rng(20);
    applyPersonal(mine, { heart: Array.from({ length: 3 }, () => compactSample(star(cal))) });
    const r = rng(30);
    const tri = SHAPES.find((s) => s.id === 'triangle')!;
    let ok = 0;
    for (let i = 0; i < 60; i++) {
      const res = mine.recognize(distort(variantOf(tri, r), plain(r), r));
      if (res.accepted && res.top?.id === 'triangle') ok++;
    }
    expect(ok / 60).toBeGreaterThanOrEqual(0.95);
  });

  it('on real camera strokes, calibrating with 3 strokes per shape costs nothing on the rest', () => {
    const log = fixture as unknown as { strokes: LoggedStroke[] };
    const strokes: { intent: string; pts: StrokePoint[] }[] = [];
    for (const e of log.strokes) {
      if (!e.intent) continue;
      const rec = new StrokeRecorder({ ...DEFAULT_RECORDER });
      let ev: RecorderEvent | null = null;
      for (const [x, y, dt, d, rr] of e.s) {
        const s: PointerSample = { x, y, t: e.start + dt, down: d === 1, ratio: rr < 0 ? undefined : rr };
        if (!s.down) s.end = e.end;
        ev = rec.push(s) ?? ev;
      }
      if (ev?.type === 'stroke') strokes.push({ intent: e.intent, pts: ev.stroke.points });
    }
    const base = standard();
    const set: PersonalSet = {};
    const held: typeof strokes = [];
    for (const s of strokes) {
      const n = set[s.intent]?.length ?? 0;
      if (s.intent !== 'none' && n < 3 && checkSample(base, s.intent, s.pts).ok) (set[s.intent] ??= []).push(compactSample(s.pts));
      else held.push(s);
    }
    const mine = standard();
    applyPersonal(mine, set);
    const correct = (rec: Recognizer) =>
      held.filter((s) => {
        const res = rec.recognize(s.pts);
        return s.intent === 'none' ? !res.accepted : res.accepted && res.top?.id === s.intent;
      }).length;
    expect(correct(mine)).toBeGreaterThanOrEqual(correct(base));
  });
});
