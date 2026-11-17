/**
 * Tiny synthesized sound effects with Web Audio: no files, no libraries. Everything is short
 * and quiet (master gain ~0.16). Browsers keep audio locked until the first click or key
 * press on the page, so `unlock()` is called from those; until then sounds are skipped.
 */
import { RULES, type GameEvent } from '../game/game';

export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Call from a user gesture. Safe to call often. */
  unlock(): void {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.16;
        this.master.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 1);
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null; // no audio on this device; the game is fine without it
    }
  }

  private get live(): AudioContext | null {
    return this.enabled && this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  /** Soft bell-ish plink; `step` raises the pitch in semitones (combo climbs a scale). */
  plink(step = 0): void {
    const ctx = this.live;
    if (!ctx || !this.master) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const f = 660 * Math.pow(2, scale[Math.min(scale.length - 1, Math.max(0, step))] / 12);
    const t = ctx.currentTime;
    for (const [mult, vol] of [[1, 0.5], [2.01, 0.12]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f * mult;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.25);
    }
  }

  /** Gentle "bonk" for a shape that matched nothing. */
  bonk(): void {
    const ctx = this.live;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.14);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.2);
  }

  /** Bubbly pop when a threat is sent packing. */
  pop(): void {
    const ctx = this.live;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.exponentialRampToValueAtTime(600, t + 0.08);
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.1);
  }

  /** Purr: filtered noise with a ~24 Hz flutter, swelling in and out (combo level-up). */
  purr(): void {
    const ctx = this.live;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const flutter = ctx.createGain();
    flutter.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 24;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth).connect(flutter.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.9, t + 0.18);
    env.gain.setValueAtTime(0.9, t + 0.4);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    src.connect(lp).connect(flutter).connect(env).connect(this.master);
    src.start(t);
    lfo.start(t);
    src.stop(t + 0.9);
    lfo.stop(t + 0.9);
  }

  /** A tiny synthesized meow: a pitch glide through a vowel-ish band filter. */
  meow(mood: 'happy' | 'sad' = 'happy'): void {
    const ctx = this.live;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const [a, b, c, dur] = mood === 'happy' ? [520, 860, 640, 0.36] : [700, 560, 380, 0.55];
    o.frequency.setValueAtTime(a, t);
    o.frequency.exponentialRampToValueAtTime(b, t + dur * 0.35);
    o.frequency.exponentialRampToValueAtTime(c, t + dur);
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.Q.value = 4;
    formant.frequency.setValueAtTime(900, t);
    formant.frequency.exponentialRampToValueAtTime(1500, t + dur * 0.4);
    formant.frequency.exponentialRampToValueAtTime(800, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
    g.gain.setValueAtTime(0.5, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(formant).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Startled little chirp when a threat gets through. */
  eep(): void {
    const ctx = this.live;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.07);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.12);
  }

  /** Two soft notes a fifth apart for a new wave; lower and slower for a boss. */
  chime(boss = false): void {
    this.plink(boss ? 0 : 2);
    setTimeout(() => this.plink(boss ? 3 : 5), boss ? 220 : 140);
  }
}

/** Maps game events to sounds. Kept here so the game stays silent and testable. */
export function playEventSounds(sfx: Sfx, events: readonly GameEvent[], combo: number): void {
  for (const e of events) {
    switch (e.type) {
      case 'hit':
        sfx.plink(Math.min(7, combo));
        break;
      case 'defeat':
        sfx.plink(Math.min(7, combo));
        sfx.pop();
        break;
      case 'miss':
        sfx.bonk();
        break;
      case 'combo':
        if (e.combo > 0 && e.combo % RULES.comboPerLevel === 0 && e.multiplier > 1 && e.combo <= RULES.comboPerLevel * (RULES.maxMultiplier - 1)) sfx.purr();
        break;
      case 'escape':
        sfx.eep();
        break;
      case 'waveStart':
        if (e.wave === 1) sfx.meow('happy');
        else sfx.chime(e.boss);
        break;
      case 'waveClear':
        sfx.meow('happy');
        break;
      case 'gameOver':
        sfx.meow('sad');
        break;
      case 'multiHit':
        sfx.plink(7);
        break;
      case 'powerCollect':
        sfx.chime(false);
        break;
      case 'powerFull':
        sfx.plink(5);
        break;
      case 'powerUse':
        if (e.kind === 'erase') sfx.pop();
        sfx.purr();
        break;
      case 'powerEmpty':
        sfx.bonk();
        break;
    }
  }
}
