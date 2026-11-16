import { describe, expect, it } from 'vitest';
import { makeCoverMap } from '../src/view/coverMap';

describe('makeCoverMap', () => {
  it('maps corners 1:1 when aspect ratios match (no mirror)', () => {
    const map = makeCoverMap({ width: 1280, height: 720 }, { width: 1920, height: 1080 }, false);
    expect(map(0, 0)).toEqual({ x: 0, y: 0 });
    expect(map(1, 1)).toEqual({ x: 1920, y: 1080 });
    expect(map(0.5, 0.5)).toEqual({ x: 960, y: 540 });
  });

  it('mirrors x so the camera-left edge lands on screen-right', () => {
    const map = makeCoverMap({ width: 1280, height: 720 }, { width: 1920, height: 1080 });
    expect(map(0, 0)).toEqual({ x: 1920, y: 0 });
    expect(map(1, 0)).toEqual({ x: 0, y: 0 });
    expect(map(0.25, 0.5).x).toBeCloseTo(1440);
  });

  it('a rightward hand motion in the mirror is a rightward screen motion', () => {
    // The user moves their hand to their right -> in the raw camera image it moves left
    // (x decreases). On a mirrored display it must move right (screen x increases).
    const map = makeCoverMap({ width: 640, height: 480 }, { width: 800, height: 600 });
    const a = map(0.6, 0.5);
    const b = map(0.4, 0.5);
    expect(b.x).toBeGreaterThan(a.x);
  });

  it('crops the sides when the viewport is narrower than the video (portrait window)', () => {
    // 16:9 video into a 1:1 view of 1000x1000 -> scaled to 1777.7x1000, 388.8px cropped each side
    const map = makeCoverMap({ width: 1280, height: 720 }, { width: 1000, height: 1000 }, false);
    const drawnW = 1280 * (1000 / 720);
    const off = (1000 - drawnW) / 2;
    expect(map(0, 0).x).toBeCloseTo(off);
    expect(map(0.5, 0.5).x).toBeCloseTo(500);
    expect(map(0.5, 1).y).toBeCloseTo(1000);
  });

  it('crops top and bottom when the viewport is wider than the video (ultrawide window)', () => {
    const map = makeCoverMap({ width: 640, height: 480 }, { width: 1600, height: 600 }, false);
    // scale = max(2.5, 1.25) = 2.5 -> drawn 1600x1200, 300px cropped top and bottom
    expect(map(0, 0)).toEqual({ x: 0, y: -300 });
    expect(map(1, 1)).toEqual({ x: 1600, y: 900 });
    expect(map(0.5, 0.5)).toEqual({ x: 800, y: 300 });
  });

  it('centre stays centre with mirroring and any crop', () => {
    const map = makeCoverMap({ width: 1280, height: 720 }, { width: 1366, height: 900 });
    const c = map(0.5, 0.5);
    expect(c.x).toBeCloseTo(683);
    expect(c.y).toBeCloseTo(450);
  });

  it('returns NaN for degenerate sizes instead of Infinity garbage', () => {
    const map = makeCoverMap({ width: 0, height: 0 }, { width: 800, height: 600 });
    const p = map(0.5, 0.5);
    expect(Number.isNaN(p.x)).toBe(true);
  });
});
