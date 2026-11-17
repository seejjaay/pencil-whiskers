import { Game, type GameEvent } from '../../src/game/game';
import { createRng } from '../../src/game/rng';

export interface BotSkill {
  /** Time to draw one shape, from deciding to the stroke being recognised. */
  strokeMs: number;
  /** A threat must have been on screen this long before the bot reacts to it. */
  reactMs: number;
  /** Chance a stroke is recognised; otherwise it is wasted (rejected strokes cost nothing). */
  accuracy: number;
}

export interface BotResult {
  wave: number;
  score: number;
  over: boolean;
  timeMs: number;
  events: GameEvent[];
}

/**
 * A simulated player: always works on the threat closest to Mochi, needs `strokeMs` per
 * shape, and sometimes fails to be recognised. Deterministic for a given seed.
 */
export function playBot(seed: number, skill: BotSkill | null, opts: { maxWave?: number; maxMs?: number; frameMs?: number } = {}): BotResult {
  const { maxWave = 30, maxMs = 30 * 60_000, frameMs = 33 } = opts;
  const g = new Game(seed);
  const events: GameEvent[] = [...g.start()];
  const r = createRng(seed ^ 0x9e3779b9);
  let pending: { at: number; shape: string | null } | null = null;
  while (g.phase !== 'gameover' && g.time < maxMs && g.wave <= maxWave) {
    events.push(...g.step(frameMs));
    if (!skill || g.phase !== 'playing') continue;
    if (pending && g.time >= pending.at) {
      if (pending.shape) events.push(...g.submit(pending.shape));
      pending = null;
    }
    if (!pending) {
      const ready = g.threats.filter((t) => g.time - t.spawnedAt >= skill.reactMs);
      if (ready.length === 0) continue;
      const target = ready.reduce((a, b) => (b.y > a.y ? b : a));
      const recognised = r.chance(skill.accuracy);
      pending = { at: g.time + skill.strokeMs, shape: recognised ? target.symbols[target.cleared] : null };
    }
  }
  return { wave: g.wave, score: g.score, over: g.phase === 'gameover', timeMs: g.time, events };
}
