import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, applyPrefs, changedPrefs, type Prefs } from '../src/prefs';

describe('player prefs', () => {
  it('saves only what differs from the defaults', () => {
    const p: Prefs = { ...DEFAULT_PREFS };
    expect(changedPrefs(p)).toEqual({});
    p.sound = false;
    p.tint = 0.1;
    expect(changedPrefs(p)).toEqual({ sound: false, tint: 0.1 });
  });

  it('round-trips and clamps tint; ignores junk', () => {
    const p: Prefs = { ...DEFAULT_PREFS };
    applyPrefs(p, { sound: false, shake: 'nope', tint: 9 });
    expect(p).toEqual({ sound: false, shake: DEFAULT_PREFS.shake, tint: 0.6 });
    applyPrefs(p, null);
    applyPrefs(p, 'x');
    expect(p.sound).toBe(false);
  });
});
