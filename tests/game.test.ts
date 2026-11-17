import { describe, expect, it } from 'vitest';
import { Game, RULES, multiplierFor, type GameEvent, type PowerItem, type Threat } from '../src/game/game';
import { POWERS, POWER_RULES, powerDef, type PowerKind } from '../src/game/powerups';
import { createRng } from '../src/game/rng';
import { BOSS_EVERY, SHAPE_UNLOCKS, THREAT_KINDS, isBossWave, waveSpec } from '../src/game/waves';
import { SHAPES, roleOf } from '../src/recognizer/shapes';
import { ENTITIES, entitiesFor } from '../src/game/entities';
import { playBot, type BotSkill } from './helpers/bot';

/** Starts a game and skips the wave banner so threats can be placed by hand. */
function playing(seed = 1): Game {
  const g = new Game(seed);
  g.start();
  g.step(RULES.introMs);
  expect(g.phase).toBe('playing');
  g.threats = [];
  return g;
}

let nextTestId = 1000;
function threat(over: Partial<Threat> & { symbols: string[] }): Threat {
  return { id: nextTestId++, kind: 'vacuum', x: 0.5, y: 0.2, speed: 0.1, cleared: 0, spawnedAt: 0, boss: false, ...over };
}

const types = (evs: GameEvent[]) => evs.map((e) => e.type);

describe('seeded rng', () => {
  it('same seed, same sequence; different seed, different sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const sa = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 20 }, () => c.next())).not.toEqual(sa);
  });

  it('int is inclusive and in range; pick covers every item', () => {
    const r = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
    const items = ['a', 'b', 'c'];
    expect(new Set(Array.from({ length: 300 }, () => r.pick(items))).size).toBe(3);
  });
});

describe('wave table', () => {
  it('regular waves get harder every time and never easier (boss waves are their own set piece)', () => {
    const regular = Array.from({ length: 25 }, (_, i) => i + 1).filter((n) => !isBossWave(n));
    for (let i = 0; i + 1 < regular.length; i++) {
      const a = waveSpec(regular[i]);
      const b = waveSpec(regular[i + 1]);
      expect(b.speed).toBeGreaterThanOrEqual(a.speed);
      expect(b.spawnEveryMs).toBeLessThanOrEqual(a.spawnEveryMs);
      expect(b.threatCount).toBeGreaterThanOrEqual(a.threatCount);
      expect(b.maxOnScreen).toBeGreaterThanOrEqual(a.maxOnScreen);
      expect(b.shapes.length).toBeGreaterThanOrEqual(a.shapes.length);
    }
  });

  it('teaches shapes gradually: lines first, then circle, V, triangle; sequences from wave 3', () => {
    expect(waveSpec(1).shapes).toEqual(['hline', 'vline']);
    expect(waveSpec(2).shapes).toContain('circle');
    expect(waveSpec(3).shapes).toContain('v');
    expect(waveSpec(4).shapes).toContain('triangle');
    expect(waveSpec(2).seqChance).toBe(0);
    expect(waveSpec(3).seqChance).toBeGreaterThan(0);
    expect(waveSpec(5).seqMax).toBe(3);
  });

  it('only uses shapes the recognizer knows and real threat kinds', () => {
    const known = new Set(SHAPES.map((s) => s.id));
    for (const id of SHAPE_UNLOCKS.flat()) {
      expect(known.has(id), id).toBe(true);
      expect(roleOf(id), `${id} is a power shape: threats must never carry it`).toBe('threat');
    }
    for (const p of POWERS) expect(roleOf(p.useShape), p.useShape).toBe('power');
    for (let n = 1; n < 12; n++) for (const k of waveSpec(n).kinds) expect(THREAT_KINDS).toContain(k);
  });
});

describe('game flow', () => {
  it('does nothing on the title screen', () => {
    const g = new Game(1);
    expect(g.step(5000)).toEqual([]);
    expect(g.submit('hline')).toEqual([]);
    expect(g.phase).toBe('title');
  });

  it('starts with a wave banner, then spawns wave-1 threats using only wave-1 shapes', () => {
    const g = new Game(5);
    expect(types(g.start())).toEqual(['waveStart']);
    expect(g.step(RULES.introMs - 100)).toEqual([]); // banner: nothing spawns
    expect(types(g.step(200))).toContain('spawn');
    for (let i = 0; i < 400; i++) g.step(50);
    for (const t of g.threats) {
      expect(['hline', 'vline']).toContain(t.symbols[0]);
      expect(t.symbols).toHaveLength(1);
    }
  });

  it('moves threats toward Mochi at their speed', () => {
    const g = playing();
    const t = threat({ symbols: ['hline'], y: 0.2, speed: 0.1 });
    g.threats = [t];
    g.step(1000);
    expect(t.y).toBeCloseTo(0.3, 5);
  });

  it('a threat reaching Mochi costs a nap heart and breaks the purr streak', () => {
    const g = playing();
    g.hearts = 3; // the mechanics, independent of how many hearts a run starts with
    g.threats = [threat({ symbols: ['hline'], y: 0.99, speed: 0.1 }), threat({ symbols: ['vline'], y: 0.1 })];
    g.combo = 5;
    const evs = g.step(200);
    expect(types(evs)).toEqual(expect.arrayContaining(['escape', 'heartLost', 'combo']));
    expect(g.hearts).toBe(2);
    expect(g.combo).toBe(0);
    expect(g.threats).toHaveLength(1);
  });

  it('one nap heart: the first threat to reach Mochi ends the run; then nothing moves', () => {
    expect(RULES.hearts).toBe(1);
    const g = playing();
    g.threats = [threat({ symbols: ['hline'], y: 0.99, speed: 0.2 }), threat({ symbols: ['vline'], y: 0.5 })];
    const evs = g.step(500);
    expect(evs.filter((e) => e.type === 'heartLost')).toHaveLength(1);
    expect(evs[evs.length - 1]).toMatchObject({ type: 'gameOver', wave: 1 });
    expect(g.phase).toBe('gameover');
    expect(g.step(10_000)).toEqual([]);
    expect(g.submit('hline')).toEqual([]);
  });

  it('one shape hits EVERY threat whose next shape matches, most urgent first', () => {
    const g = playing();
    const far = threat({ symbols: ['circle'], y: 0.2 });
    const near = threat({ symbols: ['circle'], y: 0.7 });
    const seq = threat({ symbols: ['circle', 'v'], y: 0.4 });
    const later = threat({ symbols: ['v', 'circle'], y: 0.6 }); // contains circle, but not next
    const other = threat({ symbols: ['hline'], y: 0.9 });
    g.threats = [far, near, seq, later, other];
    const evs = g.submit('circle');
    const struck = evs.filter((e) => e.type === 'defeat' || e.type === 'hit').map((e) => (e as { threat: Threat }).threat.id);
    expect(struck).toEqual([near.id, seq.id, far.id]);
    expect(evs).toContainEqual({ type: 'multiHit', count: 3 });
    expect(seq.cleared).toBe(1);
    expect(later.cleared).toBe(0);
    expect(g.threats.map((t) => t.id).sort()).toEqual([seq.id, later.id, other.id].sort());
  });

  it('the purr streak grows once per stroke, however many threats it hits; each hit scores', () => {
    const g = playing();
    g.threats = [threat({ symbols: ['circle'] }), threat({ symbols: ['circle'] })];
    g.submit('circle');
    expect(g.combo).toBe(1);
    expect(g.score).toBe(2 * (RULES.symbolPoints + RULES.defeatBonusPerSymbol));
  });

  it('sequence threats need every symbol in order; partial hits knock them back', () => {
    const g = playing();
    const seq = threat({ symbols: ['v', 'circle', 'hline'], y: 0.5 });
    g.threats = [seq];
    expect(types(g.submit('circle'))).toEqual(['miss']); // not its NEXT symbol
    expect(types(g.submit('v'))).toEqual(['combo', 'hit']);
    expect(seq.cleared).toBe(1);
    expect(seq.y).toBeCloseTo(0.5 - RULES.knockback);
    g.submit('circle');
    expect(types(g.submit('hline'))).toEqual(['combo', 'defeat']);
    expect(g.threats).toHaveLength(0);
  });

  it('a recognised but wrong shape breaks the streak and costs nothing else', () => {
    const g = playing();
    g.threats = [threat({ symbols: ['hline'] })];
    g.combo = 6;
    const hearts = g.hearts;
    const score = g.score;
    const evs = g.submit('triangle');
    expect(evs).toEqual([
      { type: 'miss', shape: 'triangle' },
      { type: 'combo', combo: 0, multiplier: 1 },
    ]);
    expect(g.hearts).toBe(hearts);
    expect(g.score).toBe(score);
    expect(g.threats).toHaveLength(1);
  });

  it('scores symbols and defeats with the purr multiplier', () => {
    expect([0, 1, 3, 4, 7, 8, 12, 40].map(multiplierFor)).toEqual([1, 1, 1, 2, 2, 3, 4, 4]);
    const g = playing();
    g.threats = [threat({ symbols: ['hline'] })];
    g.combo = 3; // this stroke makes it 4 -> x2
    const evs = g.submit('hline');
    const points = (RULES.symbolPoints + RULES.defeatBonusPerSymbol) * 2;
    expect(evs).toContainEqual(expect.objectContaining({ type: 'defeat', points }));
    expect(g.score).toBe(points);
  });

  it('clearing every threat in a wave pays a bonus and starts the next, faster wave', () => {
    const g = playing();
    g.spawned = g.spec.threatCount; // pretend everything has spawned
    g.threats = [threat({ symbols: ['hline'] })];
    g.submit('hline');
    const evs = g.step(50);
    expect(types(evs)).toEqual(['waveClear', 'waveStart']);
    expect(evs[0]).toMatchObject({ wave: 1, bonus: RULES.waveBonus });
    expect(evs[1]).toMatchObject({ wave: 2, newShapes: ['circle'] });
    expect(g.wave).toBe(2);
    expect(g.spec.speed).toBeGreaterThan(waveSpec(1).speed);
  });

  it('restart resets everything', () => {
    const g = playing();
    g.threats = [threat({ symbols: ['hline'], y: 0.99 })];
    g.step(500);
    g.score = 999;
    g.start(77);
    expect(g).toMatchObject({ phase: 'intro', wave: 1, hearts: RULES.hearts, score: 0, combo: 0, seed: 77 });
    expect(g.threats).toHaveLength(0);
  });
});

describe('boss waves ("Bath Time")', () => {
  /** Plays straight to the given wave by clearing waves instantly. */
  function atWave(n: number, seed = 3): Game {
    const g = new Game(seed);
    g.start();
    while (g.wave < n) {
      g.step(RULES.introMs);
      g.spawned = g.spec.threatCount;
      g.threats = [];
      g.step(50);
    }
    return g;
  }

  it('every 5th wave is a boss wave, announced as one', () => {
    expect([4, 5, 6, 10].map(isBossWave)).toEqual([false, true, false, true]);
    const g = new Game(1);
    g.start();
    let sawBossBanner = false;
    while (g.wave < BOSS_EVERY) {
      g.step(RULES.introMs);
      g.spawned = g.spec.threatCount;
      g.threats = [];
      for (const e of g.step(50)) if (e.type === 'waveStart' && e.wave === BOSS_EVERY) sawBossBanner = e.boss;
    }
    expect(sawBossBanner).toBe(true);
  });

  it('the boss comes first, centre stage, with a long sequence that never repeats a shape twice in a row', () => {
    const g = atWave(5);
    const evs = g.step(RULES.introMs + 100);
    const spawn = evs.find((e) => e.type === 'spawn');
    expect(spawn).toMatchObject({ threat: { kind: 'bathTime', boss: true, x: 0.5 } });
    const boss = g.threats.find((t) => t.boss)!;
    expect(boss.symbols.length).toBe(waveSpec(5).boss!.symbols);
    for (let i = 1; i < boss.symbols.length; i++) expect(boss.symbols[i]).not.toBe(boss.symbols[i - 1]);
    for (const s of boss.symbols) expect(waveSpec(5).shapes).toContain(s);
  });

  it('escorts follow the boss, as regular threats', () => {
    const g = atWave(5);
    g.step(RULES.introMs + 100);
    for (let i = 0; i < 160; i++) g.step(50); // 8 s: escorts are out, none has reached Mochi yet
    const regular = g.threats.filter((t) => !t.boss);
    expect(regular.length).toBeGreaterThan(0);
    for (const t of regular) expect(t.kind).not.toBe('bathTime');
  });

  it('a run can start at a later wave (practice / debug), boss included', () => {
    const g = new Game(4);
    expect(g.start(4, 5)).toEqual([{ type: 'waveStart', wave: 5, newShapes: [], boss: true }]);
    g.step(RULES.introMs + 100);
    expect(g.threats[0]).toMatchObject({ boss: true });
  });

  it('the boss reaching Mochi costs two nap hearts', () => {
    const g = playing();
    g.hearts = 3;
    g.threats = [threat({ symbols: ['hline', 'vline'], y: 0.99, speed: 0.2, boss: true, kind: 'bathTime' })];
    const evs = g.step(200);
    expect(evs).toContainEqual({ type: 'heartLost', hearts: 3 - RULES.bossHeartCost, lost: RULES.bossHeartCost });
  });

  it('beating the boss pays a doubled defeat bonus; partial hits push it back less', () => {
    const g = playing();
    const boss = threat({ symbols: ['hline', 'vline'], y: 0.5, boss: true, kind: 'bathTime' });
    g.threats = [boss];
    g.submit('hline');
    expect(boss.y).toBeCloseTo(0.5 - RULES.bossKnockback);
    const evs = g.submit('vline');
    const defeat = evs.find((e) => e.type === 'defeat');
    expect(defeat).toMatchObject({ points: RULES.symbolPoints + RULES.defeatBonusPerSymbol * 2 * RULES.bossBonusFactor });
  });
});

describe('power-ups', () => {
  const item = (over: Partial<PowerItem> & { symbol: string; kind: PowerKind }): PowerItem => ({ id: nextTestId++, x: 0.5, y: 0.3, speed: 0.05, spawnedAt: 0, ...over });

  /** Plays a wave with threats removed every step, collecting events. */
  function drift(g: Game, ms: number): GameEvent[] {
    const evs: GameEvent[] = [];
    for (let t = 0; t < ms; t += 100) {
      evs.push(...g.step(100));
      g.threats = [];
    }
    return evs;
  }

  it('none drop in wave 1; from wave 2 one falls within the first-drop window, one at a time', () => {
    const g1 = new Game(3);
    g1.start(3, 1);
    expect(drift(g1, 20_000).some((e) => e.type === 'powerSpawn')).toBe(false);
    const g = new Game(3);
    g.start(3, 2);
    g.step(RULES.introMs);
    let firstAt = -1;
    for (let t = 0; t < 14_000; t += 100) {
      if (g.step(100).some((e) => e.type === 'powerSpawn') && firstAt < 0) firstAt = t;
      g.threats = [];
      expect(g.items.length).toBeLessThanOrEqual(1);
    }
    expect(firstAt).toBeGreaterThanOrEqual(POWER_RULES.firstDropMs[0] - 100);
    expect(firstAt).toBeLessThanOrEqual(POWER_RULES.firstDropMs[1]);
  });

  it("drawing a falling power-up's shape saves it and still hits matching threats", () => {
    const g = playing();
    g.items = [item({ symbol: 'circle', kind: 'slow' })];
    g.threats = [threat({ symbols: ['circle'] })];
    const evs = g.submit('circle');
    expect(types(evs)).toEqual(expect.arrayContaining(['defeat', 'powerCollect']));
    expect(g.inventory).toEqual(['slow']);
    expect(g.items).toHaveLength(0);
  });

  it('flags the first pickup of each kind (for the teach banner), and a full inventory pays points', () => {
    const g = playing();
    g.items = [item({ symbol: 'hline', kind: 'erase' })];
    expect(g.submit('hline')).toContainEqual(expect.objectContaining({ type: 'powerCollect', first: true }));
    g.items = [item({ symbol: 'hline', kind: 'erase' })];
    expect(g.submit('hline')).toContainEqual(expect.objectContaining({ type: 'powerCollect', first: false }));
    g.inventory = ['slow', 'slow', 'slow'];
    const score = g.score;
    g.items = [item({ symbol: 'vline', kind: 'barrier' })];
    expect(types(g.submit('vline'))).toContain('powerFull');
    expect(g.score).toBe(score + POWER_RULES.fullBonus);
    expect(g.inventory).toHaveLength(POWER_RULES.inventoryMax);
  });

  it('a missed power-up just falls away: no heart lost', () => {
    const g = playing();
    g.items = [item({ symbol: 'hline', kind: 'slow', y: 0.99, speed: 0.2 })];
    const evs = g.step(200);
    expect(types(evs)).toContain('powerMissed');
    expect(g.hearts).toBe(RULES.hearts);
    expect(g.phase).toBe('playing');
  });

  it('drawing a power shape with nothing saved does nothing, streak intact', () => {
    const g = playing();
    g.combo = 5;
    expect(g.submit(powerDef('slow').useShape)).toEqual([{ type: 'powerEmpty', kind: 'slow' }]);
    expect(g.combo).toBe(5);
  });

  it('slow time runs threats at the slow factor for its duration, then ends', () => {
    const g = playing();
    const t = threat({ symbols: ['hline'], y: 0.2, speed: 0.1 });
    g.threats = [t];
    g.inventory = ['slow'];
    expect(types(g.submit(powerDef('slow').useShape))).toEqual(['powerUse']);
    g.step(1000);
    expect(t.y).toBeCloseTo(0.2 + 0.1 * POWER_RULES.slowFactor, 5);
    expect(types(g.step(powerDef('slow').durationMs))).toContain('powerEnd');
    const y = t.y;
    g.step(1000);
    expect(t.y).toBeCloseTo(y + 0.1, 5);
  });

  it('the barrier holds threats at its line, pushes back ones past it, then lets go', () => {
    const g = playing();
    const a = threat({ symbols: ['hline'], y: 0.7, speed: 0.2 });
    const b = threat({ symbols: ['vline'], y: 0.95, speed: 0.2 });
    g.threats = [a, b];
    g.inventory = ['barrier'];
    g.submit(powerDef('barrier').useShape);
    expect(b.y).toBe(POWER_RULES.barrierY);
    g.step(3000);
    expect(a.y).toBe(POWER_RULES.barrierY);
    expect(g.phase).toBe('playing');
    expect(types(g.step(powerDef('barrier').durationMs))).toContain('powerEnd');
  });

  it('erase all defeats every regular threat and strips shapes off the boss', () => {
    const g = playing();
    const boss = threat({ symbols: ['hline', 'vline', 'circle', 'v', 'hline'], boss: true, kind: 'bathTime' });
    g.threats = [threat({ symbols: ['hline'] }), threat({ symbols: ['v', 'circle'] }), boss];
    g.inventory = ['erase'];
    const evs = g.submit(powerDef('erase').useShape);
    expect(evs.filter((e) => e.type === 'defeat')).toHaveLength(2);
    expect(boss.cleared).toBe(POWER_RULES.eraseBossShapes);
    expect(g.threats).toEqual([boss]);
    expect(g.inventory).toEqual([]);
  });
});

describe('determinism', () => {
  /** A scripted session: uneven frame times and strokes from a separate seeded stream. */
  function session(seed: number): { events: GameEvent[]; state: unknown } {
    const g = new Game(seed);
    const events = [...g.start()];
    const input = createRng(999);
    for (let i = 0; i < 3000 && g.phase !== 'gameover'; i++) {
      events.push(...g.step(10 + input.int(0, 40)));
      if (input.chance(0.03)) events.push(...g.submit(input.pick(['hline', 'vline', 'circle', 'v', 'triangle'])));
    }
    const state = { phase: g.phase, time: g.time, wave: g.wave, score: g.score, hearts: g.hearts, combo: g.combo, threats: g.threats, stats: g.stats };
    return { events, state };
  }

  it('same seed and same inputs replay exactly', () => {
    expect(session(1234)).toEqual(session(1234));
  });

  it('different seeds play differently', () => {
    const spawns = (s: number) => session(s).events.filter((e) => e.type === 'spawn');
    expect(spawns(1)).not.toEqual(spawns(2));
  });

  it('one long frame equals many short ones (no tunnelling past events)', () => {
    const a = new Game(9);
    const b = new Game(9);
    a.start();
    b.start();
    const ea = a.step(20_000);
    const eb: GameEvent[] = [];
    for (let i = 0; i < 400; i++) eb.push(...b.step(50));
    expect(ea).toEqual(eb);
    expect(a.threats).toEqual(b.threats);
  });
});

describe('difficulty (simulated players over 12 seeds)', () => {
  const seeds = Array.from({ length: 12 }, (_, i) => 1000 + i * 7919);
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const run = (skill: BotSkill | null) => seeds.map((s) => playBot(s, skill, { maxWave: 25 }));
  const expert: BotSkill = { strokeMs: 1000, reactMs: 300, accuracy: 0.97 };
  const good: BotSkill = { strokeMs: 1500, reactMs: 500, accuracy: 0.93 }; // ~measured camera accuracy
  const casual: BotSkill = { strokeMs: 2000, reactMs: 700, accuracy: 0.9 };

  it('doing nothing loses during wave 1', () => {
    for (const r of run(null)) expect(r).toMatchObject({ over: true, wave: 1 });
  });

  it('a good camera player (1.5 s per shape, 93% recognised) always gets past wave 3', () => {
    for (const r of run(good)) expect(r.wave).toBeGreaterThanOrEqual(4);
  });

  it('a casual player (2 s per shape) still reaches wave 3 on most runs', () => {
    expect(median(run(casual).map((r) => r.wave))).toBeGreaterThanOrEqual(3);
  });

  it('skill shows: faster players get further', () => {
    const e = median(run(expert).map((r) => r.wave));
    const g = median(run(good).map((r) => r.wave));
    const c = median(run(casual).map((r) => r.wave));
    expect(e).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(c);
  });

  it('it does end: even an expert falls before wave 15', () => {
    for (const r of run(expert)) expect(r.over && r.wave < 15).toBe(true);
  });
});

describe('entity table', () => {
  it('drives which threats appear each wave; the boss never spawns as a regular threat', () => {
    expect(entitiesFor(1)).toEqual(['vacuum', 'sprayBottle']);
    for (let n = 1; n <= 12; n++) {
      expect(waveSpec(n).kinds).toEqual(entitiesFor(n));
      expect(waveSpec(n).kinds).not.toContain('bathTime');
    }
    for (const e of ENTITIES) expect(e.speed).toBeGreaterThan(0);
  });
});
