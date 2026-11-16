import { describe, expect, it } from 'vitest';
import { PenState, pinchPoint, pinchRatio } from '../src/input/pinch';

/** Builds a 21-landmark array with the 4 points that matter set. */
function hand(opts: { wrist: number[]; mid: number[]; thumb: number[]; index: number[] }): Float32Array {
  const lm = new Float32Array(63);
  const set = (i: number, p: number[]) => {
    lm[i * 3] = p[0];
    lm[i * 3 + 1] = p[1];
    lm[i * 3 + 2] = p[2] ?? 0;
  };
  set(0, opts.wrist);
  set(9, opts.mid);
  set(4, opts.thumb);
  set(8, opts.index);
  return lm;
}

describe('pinchRatio', () => {
  it('is distance(thumb, index) / distance(wrist, middle base) in pixel units', () => {
    // 1000x1000 image to keep numbers obvious: hand size 200px, pinch gap 50px
    const lm = hand({ wrist: [0.5, 0.8], mid: [0.5, 0.6], thumb: [0.4, 0.5], index: [0.45, 0.5] });
    expect(pinchRatio(lm, 1000, 1000)).toBeCloseTo(0.25);
  });

  it('is scale invariant (hand near vs far)', () => {
    const near = hand({ wrist: [0.5, 0.9], mid: [0.5, 0.5], thumb: [0.3, 0.4], index: [0.4, 0.4] });
    // Same hand at a quarter of the size, scaled about (0.5, 0.5).
    const s = (p: number[]) => [0.5 + (p[0] - 0.5) / 4, 0.5 + (p[1] - 0.5) / 4];
    const far = hand({ wrist: s([0.5, 0.9]), mid: s([0.5, 0.5]), thumb: s([0.3, 0.4]), index: s([0.4, 0.4]) });
    expect(pinchRatio(far, 1280, 720)).toBeCloseTo(pinchRatio(near, 1280, 720), 6);
  });

  it('corrects for the 16:9 aspect ratio', () => {
    // Same physical gap horizontally and vertically: 72px each on a 1280x720 frame.
    const horiz = hand({ wrist: [0.5, 0.9], mid: [0.5, 0.6], thumb: [0.5, 0.5], index: [0.5 + 72 / 1280, 0.5] });
    const vert = hand({ wrist: [0.5, 0.9], mid: [0.5, 0.6], thumb: [0.5, 0.5], index: [0.5, 0.5 + 72 / 720] });
    expect(pinchRatio(horiz, 1280, 720)).toBeCloseTo(pinchRatio(vert, 1280, 720));
  });

  it('returns NaN for a degenerate hand', () => {
    const lm = hand({ wrist: [0.5, 0.5], mid: [0.5, 0.5], thumb: [0.4, 0.5], index: [0.45, 0.5] });
    expect(Number.isNaN(pinchRatio(lm, 1280, 720))).toBe(true);
  });
});

describe('pinchPoint', () => {
  it('is the thumb/index midpoint', () => {
    const lm = hand({ wrist: [0, 0], mid: [0, 0], thumb: [0.2, 0.4], index: [0.4, 0.6] });
    const p = pinchPoint(lm);
    expect(p.x).toBeCloseTo(0.3);
    expect(p.y).toBeCloseTo(0.5);
  });
});

describe('PenState hysteresis', () => {
  it('goes down below press and up only above release', () => {
    const pen = new PenState({ press: 0.25, release: 0.4, lostGraceMs: 150 });
    expect(pen.update(0.5, 0)).toBe(false);
    expect(pen.update(0.3, 40)).toBe(false); // inside the band, still up
    expect(pen.update(0.2, 80)).toBe(true);
    expect(pen.update(0.35, 120)).toBe(true); // inside the band, stays down
    expect(pen.update(0.39, 160)).toBe(true);
    expect(pen.update(0.45, 200)).toBe(false);
  });

  it('does not flicker when the ratio jitters around one threshold', () => {
    const pen = new PenState({ press: 0.25, release: 0.4, lostGraceMs: 150 });
    pen.update(0.2, 0);
    let flips = 0;
    let prev = true;
    for (let i = 1; i < 200; i++) {
      const ratio = 0.25 + Math.sin(i * 1.7) * 0.05; // +-0.05 around the press threshold
      const now = pen.update(ratio, i * 38);
      if (now !== prev) flips++;
      prev = now;
    }
    expect(flips).toBe(0);
  });

  it('holds the pen down through a short tracking dropout, then lifts', () => {
    const pen = new PenState({ press: 0.25, release: 0.4, lostGraceMs: 150 });
    pen.update(0.1, 0);
    expect(pen.update(null, 40)).toBe(true);
    expect(pen.update(null, 120)).toBe(true);
    expect(pen.update(0.1, 160)).toBe(true); // hand back in time
    expect(pen.update(null, 200)).toBe(true);
    expect(pen.update(null, 360)).toBe(false); // 160 ms lost > 150 ms grace
  });

  it('never goes down from a missing hand', () => {
    const pen = new PenState();
    expect(pen.update(null, 0)).toBe(false);
    expect(pen.update(NaN, 10)).toBe(false);
  });

  it('enforces release > press even if misconfigured', () => {
    const pen = new PenState({ press: 0.3, release: 0.2, lostGraceMs: 0 });
    pen.update(0.25, 0);
    expect(pen.down).toBe(true);
    expect(pen.update(0.305, 10)).toBe(true); // within the forced 0.01 band
    expect(pen.update(0.32, 20)).toBe(false);
  });
});
