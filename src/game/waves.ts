import { ENTITIES, entitiesFor, type EntityId } from './entities';

/** Threat kinds are entity ids from the entity table (src/game/entities.ts). */
export type ThreatKind = EntityId;

/** Regular threats (the boss only appears in boss waves). */
export const THREAT_KINDS: readonly ThreatKind[] = ENTITIES.filter((e) => !('boss' in e && e.boss)).map((e) => e.id);

/**
 * Shapes are introduced one wave at a time: lines first (easiest to draw in the air and the
 * most reliably recognised), triangle last. Ids match src/recognizer/shapes.ts (a test checks).
 */
export const SHAPE_UNLOCKS: readonly (readonly string[])[] = [
  ['hline', 'vline'],
  ['circle'],
  ['v', 'square'],
  ['triangle', 'w'],
  [], // wave 5: the first boss, no new shape
  ['lightning'],
  ['heart'],
];

/** Every BOSS_EVERY-th wave is a boss wave: the giant "Bath Time" tub and a few escorts. */
export const BOSS_EVERY = 5;

export const isBossWave = (wave: number): boolean => wave > 0 && wave % BOSS_EVERY === 0;

export interface BossSpec {
  /** Length of the boss's symbol sequence. */
  symbols: number;
  /** Fall speed (playfield heights per second); slow, it's a set piece. */
  speed: number;
  /** Regular threats that spawn after the boss to keep the pressure on. */
  escorts: number;
}

export interface WaveSpec {
  wave: number;
  /** Threats spawned in this wave (boss included). */
  threatCount: number;
  /** Base fall speed in playfield heights per second (1 / seconds to reach the cat). */
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
  boss: BossSpec | null;
}

/**
 * The difficulty curve, as data. Wave 1 is gentle on purpose: a camera stroke takes the player
 * ~1-1.5 s, so a threat that needs 14 s to arrive leaves room to learn the pinch.
 */
export function waveSpec(wave: number): WaveSpec {
  const n = Math.max(1, Math.floor(wave));
  const regular: WaveSpec = {
    wave: n,
    threatCount: Math.min(20, 5 + 2 * (n - 1)),
    speed: Math.min(0.2, 0.07 * Math.pow(1.1, n - 1)),
    spawnEveryMs: Math.max(1100, 3400 - 250 * (n - 1)),
    maxOnScreen: Math.min(6, 2 + Math.floor((n - 1) / 2)),
    shapes: SHAPE_UNLOCKS.slice(0, Math.min(n, SHAPE_UNLOCKS.length)).flat(),
    kinds: entitiesFor(n),
    seqChance: n < 3 ? 0 : n < 5 ? 0.3 : 0.45,
    seqMax: n < 5 ? 2 : 3,
    boss: null,
  };
  if (!isBossWave(n)) return regular;
  const nth = n / BOSS_EVERY; // 1st boss, 2nd boss, ...
  const boss: BossSpec = { symbols: Math.min(10, 5 + nth), speed: 0.03, escorts: Math.min(6, 1 + nth) };
  return {
    ...regular,
    threatCount: 1 + boss.escorts,
    spawnEveryMs: regular.spawnEveryMs * 1.8,
    maxOnScreen: 3,
    seqChance: 0,
    boss,
  };
}

/** Shapes that first appear in this wave (for the "new shape" banner). */
export function newShapesIn(wave: number): readonly string[] {
  return wave >= 1 && wave <= SHAPE_UNLOCKS.length ? SHAPE_UNLOCKS[wave - 1] : [];
}
