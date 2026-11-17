import { describe, expect, it } from 'vitest';
import { applySaved, changedValues, defaultTuning } from '../src/settings';

describe('tuning persistence', () => {
  it('saves only values that differ from the defaults', () => {
    const t = defaultTuning();
    expect(changedValues(t)).toEqual({});
    t.pen.press = 0.33;
    t.recognizer.minScore = 0.7;
    expect(changedValues(t)).toEqual({ pen: { press: 0.33 }, recognizer: { minScore: 0.7 } });
  });

  it('round-trips, and untouched keys keep following the (possibly newer) defaults', () => {
    const t = defaultTuning();
    t.pen.release = 0.66;
    const saved = JSON.parse(JSON.stringify(changedValues(t)));
    const loaded = defaultTuning();
    applySaved(loaded, saved);
    expect(loaded.pen.release).toBe(0.66);
    expect(loaded.pen.releaseHoldMs).toBe(defaultTuning().pen.releaseHoldMs);
  });

  it('ignores junk: unknown groups/keys, strings, NaN, non-objects', () => {
    const t = defaultTuning();
    applySaved(t, { pen: { press: 'x', release: NaN, bogus: 1 }, nope: { a: 1 } });
    applySaved(t, null);
    applySaved(t, 42);
    expect(t).toEqual(defaultTuning());
  });
});
