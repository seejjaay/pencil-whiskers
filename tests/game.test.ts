import { describe, expect, it } from 'vitest';
import { Game, RULES, multiplierFor, type GameEvent, type Threat } from '../src/game/game';
import { createRng } from '../src/game/rng';
import { SHAPE_UNLOCKS, THREAT_KINDS, waveSpec } from '../src/game/waves';
import { SHAPES } from '../src/recognizer/shapes';
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
  return { id: nextTestId++, kind: 'vacuum', x: 0.5, y: 0.2, speed: 0.1, cleared: 0, spawnedAt: 0, ...over };
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
  it('gets harder every wave and never easier', () => {
    for (let n = 1; n < 25; n++) {
      const a = waveSpec(n);
      const b = waveSpec(n + 1);
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
    for (const id of SHAPE_UNLOCKS.flat()) expect(known.has(id), id).toBe(true);
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
    g.threats = [threat({ symbols: ['hline'], y: 0.99, speed: 0.1 }), threat({ symbols: ['vline'], y: 0.1 })];
    g.combo = 5;
    const evs = g.step(200);
    expect(types(evs)).toEqual(expect.arrayContaining(['escape', 'heartLost', 'combo']));
    expect(g.hearts).toBe(RULES.hearts - 1);
    expect(g.combo).toBe(0);
    expect(g.threats).toHaveLength(1);
  });

  it('three escapes end the game; afterwards nothing moves and strokes are ignored', () => {
    const g = playing();
    g.threats = [0.99, 0.98, 0.97].map((y) => threat({ symbols: ['hline'], y, speed: 0.2 }));
    const evs = g.step(500);
    expect(evs.filter((e) => e.type === 'heartLost')).toHaveLength(3);
    expect(evs[evs.length - 1]).toMatchObject({ type: 'gameOver', wave: 1 });
    expect(g.phase).toBe('gameover');
    expect(g.step(10_000)).toEqual([]);
    expect(g.submit('hline')).toEqual([]);
  });

  it('a correct shape hits the matching threat closest to Mochi', () => {
    const g = playing();
    const far = threat({ symbols: ['circle'], y: 0.2 });
    const near = threat({ symbols: ['circle'], y: 0.7 });
    const other = threat({ symbols: ['hline'], y: 0.9 });
    g.threats = [far, near, other];
    const evs = g.submit('circle');
    expect(evs.find((e) => e.type === 'defeat')).toMatchObject({ threat: { id: near.id } });
    expect(g.threats.map((t) => t.id)).toEqual([far.id, other.id]);
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
