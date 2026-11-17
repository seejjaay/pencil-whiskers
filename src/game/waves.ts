/** Household threats, one new kind unlocked per wave. All original, drawn with shapes. */
export type ThreatKind = 'vacuum' | 'sprayBottle' | 'cucumber' | 'bathTub' | 'thunderCloud' | 'doorbell';

export const THREAT_KINDS: readonly ThreatKind[] = ['vacuum', 'sprayBottle', 'cucumber', 'bathTub', 'thunderCloud', 'doorbell'];

/** Some threats drift a little faster or slower than the wave's base speed. */
export const KIND_SPEED: Readonly<Record<ThreatKind, number>> = {
  vacuum: 1,
  sprayBottle: 1.1,
  cucumber: 0.9,
  bathTub: 0.8,
  thunderCloud: 1,
  doorbell: 1.2,
};

/**
 * Shapes are introduced one wave at a time: lines first (easiest to draw in the air and the
 * most reliably recognised), triangle last. Ids match src/recognizer/shapes.ts (a test checks).
 */
export const SHAPE_UNLOCKS: readonly (readonly string[])[] = [['hline', 'vline'], ['circle'], ['v'], ['triangle']];

export interface WaveSpec {
  wave: number;
  /** Threats spawned in this wave. */
  threatCount: number;
  /** Base fall speed in playfield heights per second (1 / seconds to reach Mochi). */
  speed: number;
  /** Average gap between spawns (each gap is jittered +-20%). */
  spawnEveryMs: number;
  /** Never more than this many threats on screen at once. */
  maxOnScreen: number;
  shapes: readonly string[];
  kinds: readonly ThreatKind[];
  /** Chance a threat carries a sequence of 2..seqMax symbols instead of one. */
  seqChance: number;
  seqMax: number;
}

/**
 * The difficulty curve, as data. Wave 1 is gentle on purpose: a camera stroke takes the player
 * ~1-1.5 s, so a threat that needs 14 s to arrive leaves room to learn the pinch.
 */
export function waveSpec(wave: number): WaveSpec {
  const n = Math.max(1, Math.floor(wave));
  return {
    wave: n,
    threatCount: Math.min(20, 5 + 2 * (n - 1)),
    speed: Math.min(0.2, 0.07 * Math.pow(1.1, n - 1)),
    spawnEveryMs: Math.max(1100, 3400 - 250 * (n - 1)),
    maxOnScreen: Math.min(6, 2 + Math.floor((n - 1) / 2)),
    shapes: SHAPE_UNLOCKS.slice(0, Math.min(n, SHAPE_UNLOCKS.length)).flat(),
    kinds: THREAT_KINDS.slice(0, Math.min(THREAT_KINDS.length, n + 1)),
    seqChance: n < 3 ? 0 : n < 5 ? 0.3 : 0.45,
    seqMax: n < 5 ? 2 : 3,
  };
}

/** Shapes that first appear in this wave (for the "new shape" banner). */
export function newShapesIn(wave: number): readonly string[] {
  return wave >= 1 && wave <= SHAPE_UNLOCKS.length ? SHAPE_UNLOCKS[wave - 1] : [];
}
