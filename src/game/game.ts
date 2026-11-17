/**
 * Gameplay rules as pure, deterministic TypeScript: no DOM, no wall clock, no Math.random.
 * Time only advances through step(dt), randomness only comes from the seeded Rng, and every
 * change the view might animate is reported as an event. Same seed + same calls = same game.
 */
import { createRng, type Rng } from './rng';
import { KIND_SPEED, newShapesIn, waveSpec, type ThreatKind, type WaveSpec } from './waves';

export type Phase = 'title' | 'intro' | 'playing' | 'gameover';

export interface Threat {
  readonly id: number;
  readonly kind: ThreatKind;
  /** 0..1 across the playfield. */
  readonly x: number;
  /** 0 = just appeared at the top, 1 = reached Mochi. */
  y: number;
  /** Playfield heights per second. */
  readonly speed: number;
  /** Shape ids to draw, in order. */
  readonly symbols: readonly string[];
  /** How many of `symbols` are already drawn. */
  cleared: number;
  /** Game time it appeared (ms). */
  readonly spawnedAt: number;
  /** The boss of a boss wave: long sequence, costs more hearts, pays more. */
  readonly boss: boolean;
}

/** A frozen copy of a threat at the moment of an event (it may be gone from the field after). */
export type ThreatSnapshot = Readonly<Threat>;

export type GameEvent =
  | { type: 'waveStart'; wave: number; newShapes: readonly string[]; boss: boolean }
  | { type: 'spawn'; threat: ThreatSnapshot }
  | { type: 'hit'; threat: ThreatSnapshot; points: number }
  | { type: 'defeat'; threat: ThreatSnapshot; points: number }
  | { type: 'miss'; shape: string }
  | { type: 'combo'; combo: number; multiplier: number }
  | { type: 'escape'; threat: ThreatSnapshot }
  | { type: 'heartLost'; hearts: number; lost: number }
  | { type: 'waveClear'; wave: number; bonus: number }
  | { type: 'gameOver'; score: number; wave: number; bestCombo: number };

export const RULES = {
  hearts: 3,
  /** Banner time before a wave's first threat. */
  introMs: 2200,
  /** Internal fixed step, so a long frame never lets a threat skip past an event. */
  stepMs: 50,
  symbolPoints: 100,
  defeatBonusPerSymbol: 50,
  waveBonus: 250,
  /** Consecutive correct shapes per purr level (x2 at 4, x3 at 8, x4 at 12). */
  comboPerLevel: 4,
  maxMultiplier: 4,
  /** A partial hit on a sequence threat nudges it back up a little. */
  knockback: 0.05,
  bossKnockback: 0.035,
  /** Hearts lost when the boss reaches Mochi. */
  bossHeartCost: 2,
  /** Defeat bonus multiplier for the boss. */
  bossBonusFactor: 2,
} as const;

export function multiplierFor(combo: number): number {
  return Math.min(RULES.maxMultiplier, 1 + Math.floor(Math.max(0, combo) / RULES.comboPerLevel));
}

export interface GameStats {
  defeated: number;
  escaped: number;
  correct: number;
  wrong: number;
}

const snap = (t: Threat): ThreatSnapshot => ({ ...t });

export class Game {
  phase: Phase = 'title';
  /** Game time in ms (advances only while a run is active). */
  time = 0;
  wave = 0;
  spec: WaveSpec = waveSpec(1);
  threats: Threat[] = [];
  hearts: number = RULES.hearts;
  score = 0;
  combo = 0;
  bestCombo = 0;
  stats: GameStats = { defeated: 0, escaped: 0, correct: 0, wrong: 0 };
  spawned = 0;

  private rng: Rng;
  private nextSpawnAt = 0;
  private introEndsAt = 0;
  private nextId = 1;

  constructor(public seed: number) {
    this.rng = createRng(seed);
  }

  get multiplier(): number {
    return multiplierFor(this.combo);
  }

  /** Starts (or restarts) a run, optionally at a later wave (debug / practice). */
  start(seed: number = this.seed, firstWave = 1): GameEvent[] {
    this.seed = seed;
    this.rng = createRng(seed);
    this.time = 0;
    this.threats = [];
    this.hearts = RULES.hearts;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.stats = { defeated: 0, escaped: 0, correct: 0, wrong: 0 };
    this.nextId = 1;
    const events: GameEvent[] = [];
    this.beginWave(Math.max(1, Math.floor(firstWave)), events);
    return events;
  }

  /** Advances the game by `dtMs` of play time. Does nothing on the title / game-over screens. */
  step(dtMs: number): GameEvent[] {
    const events: GameEvent[] = [];
    let left = Math.max(0, dtMs);
    while (left > 0 && (this.phase === 'intro' || this.phase === 'playing')) {
      const h = Math.min(RULES.stepMs, left);
      this.tick(h, events);
      left -= h;
    }
    return events;
  }

  /**
   * The player drew a recognised shape. It hits the threat closest to Mochi whose NEXT symbol
   * matches (the most urgent one). A shape that matches nothing breaks the purr streak but
   * costs no heart. Strokes outside active play are ignored.
   */
  submit(shape: string): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.phase !== 'playing') return events;
    let target: Threat | null = null;
    for (const t of this.threats) {
      if (t.symbols[t.cleared] !== shape) continue;
      if (!target || t.y > target.y || (t.y === target.y && t.id < target.id)) target = t;
    }
    if (!target) {
      this.stats.wrong++;
      events.push({ type: 'miss', shape });
      this.breakCombo(events);
      return events;
    }
    this.stats.correct++;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const mult = this.multiplier;
    events.push({ type: 'combo', combo: this.combo, multiplier: mult });
    target.cleared++;
    let points = RULES.symbolPoints * mult;
    if (target.cleared >= target.symbols.length) {
      points += RULES.defeatBonusPerSymbol * target.symbols.length * mult * (target.boss ? RULES.bossBonusFactor : 1);
      const hit = target;
      this.threats = this.threats.filter((t) => t !== hit);
      this.stats.defeated++;
      events.push({ type: 'defeat', threat: snap(hit), points });
    } else {
      target.y = Math.max(0, target.y - (target.boss ? RULES.bossKnockback : RULES.knockback));
      events.push({ type: 'hit', threat: snap(target), points });
    }
    this.score += points;
    return events;
  }

  private tick(h: number, events: GameEvent[]): void {
    this.time += h;
    if (this.phase === 'intro') {
      if (this.time < this.introEndsAt) return;
      this.phase = 'playing';
      this.nextSpawnAt = this.time;
    }

    if (
      this.spawned < this.spec.threatCount &&
      this.time >= this.nextSpawnAt &&
      this.threats.length < this.spec.maxOnScreen
    ) {
      events.push({ type: 'spawn', threat: snap(this.spawn()) });
      this.nextSpawnAt = this.time + this.spec.spawnEveryMs * this.rng.range(0.8, 1.2);
    }

    for (const t of this.threats) t.y += (t.speed * h) / 1000;

    if (this.threats.some((t) => t.y >= 1)) {
      const escaped = this.threats.filter((t) => t.y >= 1).sort((a, b) => a.id - b.id);
      this.threats = this.threats.filter((t) => t.y < 1);
      for (const t of escaped) {
        this.stats.escaped++;
        const before = this.hearts;
        this.hearts = Math.max(0, this.hearts - (t.boss ? RULES.bossHeartCost : 1));
        events.push({ type: 'escape', threat: snap(t) }, { type: 'heartLost', hearts: this.hearts, lost: before - this.hearts });
        this.breakCombo(events);
        if (this.hearts === 0) {
          this.phase = 'gameover';
          this.threats = [];
          events.push({ type: 'gameOver', score: this.score, wave: this.wave, bestCombo: this.bestCombo });
          return;
        }
      }
    }

    if (this.spawned >= this.spec.threatCount && this.threats.length === 0) {
      const bonus = RULES.waveBonus * this.wave;
      this.score += bonus;
      events.push({ type: 'waveClear', wave: this.wave, bonus });
      this.beginWave(this.wave + 1, events);
    }
  }

  private beginWave(n: number, events: GameEvent[]): void {
    this.wave = n;
    this.spec = waveSpec(n);
    this.spawned = 0;
    this.phase = 'intro';
    this.introEndsAt = this.time + RULES.introMs;
    events.push({ type: 'waveStart', wave: n, newShapes: newShapesIn(n), boss: this.spec.boss !== null });
  }

  private breakCombo(events: GameEvent[]): void {
    if (this.combo === 0) return;
    this.combo = 0;
    events.push({ type: 'combo', combo: 0, multiplier: 1 });
  }

  private spawn(): Threat {
    const spec = this.spec;
    if (spec.boss && this.spawned === 0) return this.spawnBoss(spec.boss.symbols, spec.boss.speed);
    const length = this.rng.chance(spec.seqChance) ? this.rng.int(2, spec.seqMax) : 1;
    const wantedNow = new Set(this.threats.map((t) => t.symbols[t.cleared]));
    const symbols: string[] = [];
    for (let i = 0; i < length; i++) {
      let s = this.rng.pick(spec.shapes);
      // Prefer symbols that read distinctly: no immediate repeats inside a sequence, and the
      // first symbol different from what the threats already on screen need (when possible).
      for (
        let tries = 0;
        tries < 4 && (s === symbols[i - 1] || (i === 0 && wantedNow.has(s) && wantedNow.size < spec.shapes.length));
        tries++
      ) {
        s = this.rng.pick(spec.shapes);
      }
      symbols.push(s);
    }
    const kind = this.rng.pick(spec.kinds);
    const threat: Threat = {
      id: this.nextId++,
      kind,
      x: this.pickLane(),
      y: 0,
      speed: spec.speed * KIND_SPEED[kind] * this.rng.range(0.9, 1.1),
      symbols,
      cleared: 0,
      spawnedAt: this.time,
      boss: false,
    };
    this.threats.push(threat);
    this.spawned++;
    return threat;
  }

  /** The "Bath Time" tub: centre stage, a long sequence of every unlocked shape, no repeats in a row. */
  private spawnBoss(length: number, speed: number): Threat {
    const symbols: string[] = [];
    for (let i = 0; i < length; i++) {
      let s = this.rng.pick(this.spec.shapes);
      for (let tries = 0; tries < 6 && s === symbols[i - 1]; tries++) s = this.rng.pick(this.spec.shapes);
      symbols.push(s);
    }
    const boss: Threat = { id: this.nextId++, kind: 'bathTime', x: 0.5, y: 0, speed, symbols, cleared: 0, spawnedAt: this.time, boss: true };
    this.threats.push(boss);
    this.spawned++;
    return boss;
  }

  /** A spot away from threats near the top, so new bubbles don't overlap recent ones. */
  private pickLane(): number {
    let best = 0.5;
    let bestGap = -1;
    for (let i = 0; i < 8; i++) {
      const x = this.rng.range(0.1, 0.9);
      let gap = 1;
      for (const t of this.threats) if (t.y < 0.4) gap = Math.min(gap, Math.abs(t.x - x));
      if (gap > bestGap) {
        bestGap = gap;
        best = x;
      }
    }
    return best;
  }
}
