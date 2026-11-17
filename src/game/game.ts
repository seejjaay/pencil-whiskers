/**
 * Gameplay rules as pure, deterministic TypeScript: no DOM, no wall clock, no Math.random.
 * Time only advances through step(dt), randomness only comes from the seeded Rng, and every
 * change the view might animate is reported as an event. Same seed + same calls = same game.
 */
import { createRng, type Rng } from './rng';
import { BOSS_ID, speedOf } from './entities';
import { POWERS, POWER_RULES, powerByShape, powerDef, type PowerKind } from './powerups';
import { newShapesIn, waveSpec, type ThreatKind, type WaveSpec } from './waves';

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

/** A falling power-up: draw its symbol to save it for later. Harmless if it reaches the bottom. */
export interface PowerItem {
  readonly id: number;
  readonly kind: PowerKind;
  readonly x: number;
  y: number;
  readonly speed: number;
  readonly symbol: string;
  readonly spawnedAt: number;
}

/** A frozen copy of a threat at the moment of an event (it may be gone from the field after). */
export type ThreatSnapshot = Readonly<Threat>;
export type ItemSnapshot = Readonly<PowerItem>;

export type GameEvent =
  | { type: 'waveStart'; wave: number; newShapes: readonly string[]; boss: boolean }
  | { type: 'spawn'; threat: ThreatSnapshot }
  | { type: 'hit'; threat: ThreatSnapshot; points: number }
  | { type: 'defeat'; threat: ThreatSnapshot; points: number }
  | { type: 'miss'; shape: string }
  | { type: 'multiHit'; count: number }
  | { type: 'combo'; combo: number; multiplier: number }
  | { type: 'escape'; threat: ThreatSnapshot }
  | { type: 'heartLost'; hearts: number; lost: number }
  | { type: 'waveClear'; wave: number; bonus: number }
  | { type: 'gameOver'; score: number; wave: number; bestCombo: number }
  | { type: 'powerSpawn'; item: ItemSnapshot }
  | { type: 'powerCollect'; item: ItemSnapshot; first: boolean }
  | { type: 'powerFull'; item: ItemSnapshot; bonus: number }
  | { type: 'powerMissed'; item: ItemSnapshot }
  | { type: 'powerUse'; kind: PowerKind }
  | { type: 'powerEmpty'; kind: PowerKind }
  | { type: 'powerEnd'; kind: PowerKind };

export const RULES = {
  /** One nap heart: a single threat reaching Mochi wakes her (CJ, rules pass 2026-11-17). */
  hearts: 1,
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

const snap = <T extends object>(t: T): Readonly<T> => ({ ...t });
const byUrgency = (a: Threat, b: Threat) => b.y - a.y || a.id - b.id;

export class Game {
  phase: Phase = 'title';
  /** Game time in ms (advances only while a run is active). */
  time = 0;
  wave = 0;
  spec: WaveSpec = waveSpec(1);
  threats: Threat[] = [];
  items: PowerItem[] = [];
  /** Saved power-ups, oldest first. */
  inventory: PowerKind[] = [];
  /** Game time slow-time / the barrier run until (0 = off). */
  slowUntil = 0;
  barrierUntil = 0;
  hearts: number = RULES.hearts;
  score = 0;
  combo = 0;
  bestCombo = 0;
  stats: GameStats = { defeated: 0, escaped: 0, correct: 0, wrong: 0 };
  spawned = 0;

  private rng: Rng;
  /** Field clock: runs slower during slow time; drives spawns and drops. */
  private fieldTime = 0;
  private nextSpawnAt = 0;
  private nextDropAt = Infinity;
  private introEndsAt = 0;
  private nextId = 1;
  private seenKinds = new Set<PowerKind>();

  constructor(public seed: number) {
    this.rng = createRng(seed);
  }

  get multiplier(): number {
    return multiplierFor(this.combo);
  }

  get slowActive(): boolean {
    return this.time < this.slowUntil;
  }

  get barrierActive(): boolean {
    return this.time < this.barrierUntil;
  }

  /** Starts (or restarts) a run, optionally at a later wave (debug / practice). */
  start(seed: number = this.seed, firstWave = 1): GameEvent[] {
    this.seed = seed;
    this.rng = createRng(seed);
    this.time = 0;
    this.fieldTime = 0;
    this.threats = [];
    this.items = [];
    this.inventory = [];
    this.slowUntil = 0;
    this.barrierUntil = 0;
    this.nextDropAt = Infinity;
    this.seenKinds = new Set();
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
   * The player drew a recognised shape.
   *  - A power-up activation shape uses a saved power of that kind (nothing saved: no penalty).
   *  - Otherwise it hits EVERY threat whose next symbol matches (most urgent first; sequences
   *    keep their order) and saves any falling power-up carrying that shape.
   * The purr streak grows by one per useful stroke; a shape that matches nothing breaks it.
   * Strokes outside active play are ignored.
   */
  submit(shape: string): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.phase !== 'playing') return events;
    const power = powerByShape(shape);
    if (power) return this.usePower(power.kind);

    const targets = this.threats.filter((t) => t.symbols[t.cleared] === shape).sort(byUrgency);
    const pickups = this.items.filter((it) => it.symbol === shape);
    if (targets.length === 0 && pickups.length === 0) {
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
    for (const target of targets) this.hit(target, 1, mult, events);
    if (targets.length > 1) events.push({ type: 'multiHit', count: targets.length });
    for (const item of pickups) this.collect(item, events);
    return events;
  }

  /** Uses a saved power-up of this kind, if there is one. */
  usePower(kind: PowerKind): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.phase !== 'playing') return events;
    const idx = this.inventory.indexOf(kind);
    if (idx < 0) {
      events.push({ type: 'powerEmpty', kind });
      return events;
    }
    this.inventory.splice(idx, 1);
    events.push({ type: 'powerUse', kind });
    const def = powerDef(kind);
    switch (kind) {
      case 'slow':
        this.slowUntil = this.time + def.durationMs;
        break;
      case 'barrier':
        this.barrierUntil = this.time + def.durationMs;
        // Anything already past the line is pushed back to it.
        for (const t of this.threats) t.y = Math.min(t.y, POWER_RULES.barrierY);
        break;
      case 'erase': {
        const mult = this.multiplier;
        for (const t of [...this.threats].sort(byUrgency)) {
          this.hit(t, t.boss ? POWER_RULES.eraseBossShapes : t.symbols.length - t.cleared, mult, events);
        }
        break;
      }
    }
    return events;
  }

  /** Clears `count` symbols of a threat (defeating it when none are left) and scores them. */
  private hit(target: Threat, count: number, mult: number, events: GameEvent[]): void {
    target.cleared = Math.min(target.symbols.length, target.cleared + count);
    let points = RULES.symbolPoints * mult * count;
    if (target.cleared >= target.symbols.length) {
      points += RULES.defeatBonusPerSymbol * target.symbols.length * mult * (target.boss ? RULES.bossBonusFactor : 1);
      this.threats = this.threats.filter((t) => t !== target);
      this.stats.defeated++;
      events.push({ type: 'defeat', threat: snap(target), points });
    } else {
      target.y = Math.max(0, target.y - (target.boss ? RULES.bossKnockback : RULES.knockback));
      events.push({ type: 'hit', threat: snap(target), points });
    }
    this.score += points;
  }

  private collect(item: PowerItem, events: GameEvent[]): void {
    this.items = this.items.filter((it) => it !== item);
    if (this.inventory.length >= POWER_RULES.inventoryMax) {
      this.score += POWER_RULES.fullBonus;
      events.push({ type: 'powerFull', item: snap(item), bonus: POWER_RULES.fullBonus });
      return;
    }
    this.inventory.push(item.kind);
    const first = !this.seenKinds.has(item.kind);
    this.seenKinds.add(item.kind);
    events.push({ type: 'powerCollect', item: snap(item), first });
  }

  private tick(h: number, events: GameEvent[]): void {
    this.time += h;
    if (this.phase === 'intro') {
      if (this.time < this.introEndsAt) return;
      this.phase = 'playing';
      this.nextSpawnAt = this.fieldTime;
    }

    if (this.slowUntil && !this.slowActive) {
      this.slowUntil = 0;
      events.push({ type: 'powerEnd', kind: 'slow' });
    }
    if (this.barrierUntil && !this.barrierActive) {
      this.barrierUntil = 0;
      events.push({ type: 'powerEnd', kind: 'barrier' });
    }

    // Slow time slows the whole field: movement, spawns and drops.
    const fh = h * (this.slowActive ? POWER_RULES.slowFactor : 1);
    this.fieldTime += fh;

    if (
      this.spawned < this.spec.threatCount &&
      this.fieldTime >= this.nextSpawnAt &&
      this.threats.length < this.spec.maxOnScreen
    ) {
      events.push({ type: 'spawn', threat: snap(this.spawn()) });
      this.nextSpawnAt = this.fieldTime + this.spec.spawnEveryMs * this.rng.range(0.8, 1.2);
    }

    if (this.items.length === 0 && this.fieldTime >= this.nextDropAt) {
      events.push({ type: 'powerSpawn', item: snap(this.spawnItem()) });
      this.nextDropAt = this.fieldTime + this.rng.range(POWER_RULES.dropEveryMs[0], POWER_RULES.dropEveryMs[1]);
    }

    const hold = this.barrierActive ? POWER_RULES.barrierY : Infinity;
    for (const t of this.threats) t.y = Math.min(t.y + (t.speed * fh) / 1000, Math.max(t.y, hold));
    for (const it of this.items) it.y += (it.speed * fh) / 1000;
    if (this.items.some((it) => it.y >= 1)) {
      for (const it of this.items.filter((i) => i.y >= 1)) events.push({ type: 'powerMissed', item: snap(it) });
      this.items = this.items.filter((it) => it.y < 1);
    }

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
          this.items = [];
          this.slowUntil = 0;
          this.barrierUntil = 0;
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
    if (n >= POWER_RULES.firstDropWave && !Number.isFinite(this.nextDropAt)) {
      this.nextDropAt = this.fieldTime + this.rng.range(POWER_RULES.firstDropMs[0], POWER_RULES.firstDropMs[1]);
    }
    // A boss wave always offers a power-up as the boss appears.
    if (this.spec.boss) this.nextDropAt = Math.min(this.nextDropAt, this.fieldTime);
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
      speed: spec.speed * speedOf(kind) * this.rng.range(0.9, 1.1),
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
    const boss: Threat = { id: this.nextId++, kind: BOSS_ID, x: 0.5, y: 0, speed, symbols, cleared: 0, spawnedAt: this.time, boss: true };
    this.threats.push(boss);
    this.spawned++;
    return boss;
  }

  private spawnItem(): PowerItem {
    let roll = this.rng.next() * POWERS.reduce((s, p) => s + p.weight, 0);
    let kind: PowerKind = POWERS[POWERS.length - 1].kind;
    for (const p of POWERS) {
      roll -= p.weight;
      if (roll < 0) {
        kind = p.kind;
        break;
      }
    }
    const item: PowerItem = {
      id: this.nextId++,
      kind,
      x: this.pickLane(),
      y: 0,
      speed: this.spec.speed * POWER_RULES.itemSpeedFactor,
      symbol: this.rng.pick(this.spec.shapes),
      spawnedAt: this.time,
    };
    this.items.push(item);
    return item;
  }

  /** A spot away from threats and items near the top, so new bubbles don't overlap recent ones. */
  private pickLane(): number {
    let best = 0.5;
    let bestGap = -1;
    const near = [...this.threats, ...this.items].filter((t) => t.y < 0.4);
    for (let i = 0; i < 8; i++) {
      const x = this.rng.range(0.1, 0.9);
      let gap = 1;
      for (const t of near) gap = Math.min(gap, Math.abs(t.x - x));
      if (gap > bestGap) {
        bestGap = gap;
        best = x;
      }
    }
    return best;
  }
}
