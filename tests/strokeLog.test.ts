import { describe, expect, it } from 'vitest';
import { INTENT_NONE, StrokeLog } from '../src/debug/strokeLog';
import type { Recognition } from '../src/recognizer/recognizer';

const res = (top: string, accepted: boolean): Recognition => ({
  accepted,
  top: { id: top, label: top, score: 0.9, personal: false },
  runnerUp: { id: 'x', label: 'x', score: 0.5, personal: false },
  ms: 1,
});

function draw(log: StrokeLog, startT: number): void {
  log.sample({ x: 0, y: 0, t: startT, down: true, ratio: 0.2 });
  log.sample({ x: 50, y: 0, t: startT + 33, down: true, ratio: 0.21 });
  log.sample({ x: 50, y: 0, t: startT + 66, down: false, ratio: 0.8, end: 'release' });
}

describe('StrokeLog', () => {
  it('records raw samples relative to stroke start, with ratio, and ignores hover', () => {
    const log = new StrokeLog();
    log.sample({ x: 9, y: 9, t: 1, down: false });
    draw(log, 1000);
    const e = log.commit('camera', 'release', false, res('circle', true))!;
    expect(e.start).toBe(1000);
    expect(e.s).toEqual([
      [0, 0, 0, 1, 0.2],
      [50, 0, 33, 1, 0.21],
      [50, 0, 66, 0, 0.8],
    ]);
    expect(e.result).toMatchObject({ accepted: true, top: 'circle', next: 'x' });
  });

  it('tallies per intent: shapes must be accepted as that shape, not-a-shape must be rejected', () => {
    const log = new StrokeLog();
    log.setIntent('circle', -1);
    draw(log, 0);
    log.commit('camera', 'release', false, res('circle', true));
    draw(log, 100);
    log.commit('camera', 'release', false, res('triangle', true));
    draw(log, 200);
    log.commit('camera', 'release', true, null); // a fragment thrown away as a tap
    log.setIntent(INTENT_NONE, 250);
    draw(log, 300);
    log.commit('camera', 'release', false, res('circle', false));
    log.setIntent(null, 350);
    draw(log, 400);
    log.commit('mouse', 'mouse', false, res('v', true));
    expect(log.stats()).toEqual([
      { intent: 'circle', n: 2, ok: 1, taps: 1 },
      { intent: INTENT_NONE, n: 1, ok: 1, taps: 0 },
    ]);
  });

  it('keeps only the most recent strokes and drops an abandoned one', () => {
    const log = new StrokeLog(3);
    for (let i = 0; i < 5; i++) {
      draw(log, i * 100);
      log.commit('mouse', 'mouse', false, null);
    }
    expect(log.entries.map((e) => e.start)).toEqual([200, 300, 400]);
    log.sample({ x: 0, y: 0, t: 999, down: true });
    log.dropPending();
    expect(log.commit('mouse', 'switch', false, null)).toBeNull();
  });

  it('serializes with metadata', () => {
    const log = new StrokeLog();
    draw(log, 0);
    log.commit('mouse', 'mouse', false, null);
    const parsed = JSON.parse(log.toJSON({ view: [800, 600] }));
    expect(parsed).toMatchObject({ format: 'pencil-whiskers-strokes', version: 1, view: [800, 600] });
    expect(parsed.strokes).toHaveLength(1);
  });
});

describe('StrokeLog intent timing', () => {
  it('tags a stroke with the intent in effect when it STARTED, even if committed after a key press', () => {
    const log = new StrokeLog();
    log.setIntent('circle', 0);
    draw(log, 100); // circle drawn from t=100
    log.setIntent('triangle', 180); // next key pressed before the circle was committed
    log.commit('camera', 'release', false, res('circle', true));
    draw(log, 300);
    log.commit('camera', 'release', false, res('triangle', true));
    expect(log.entries.map((e) => e.intent)).toEqual(['circle', 'triangle']);
    expect(log.intent).toBe('triangle');
  });
});
