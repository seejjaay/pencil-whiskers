/**
 * Draws the game: Mochi, threats with symbol bubbles, nap hearts, score, purr meter, wave
 * banners, reactions, particles and shake. Pure presentation: it reads the Game and reacts to
 * its events; it never changes the rules.
 */
import { RULES, type Game, type GameEvent, type Threat } from '../game/game';
import type { Prefs } from '../prefs';
import { SHAPES } from '../recognizer/shapes';
import { CREAM, FONT, INK, PINK, PINK_DARK, circle, heartPath, outlined, phase, roundRect } from './art/draw';
import { drawMochi, type Mood } from './art/mochi';
import { drawThreat } from './art/threats';
import { Particles, Shake } from './particles';

export interface FieldGeom {
  w: number;
  h: number;
  left: number;
  right: number;
  /** Screen y of a threat at y = 0 (just arrived). */
  top: number;
  /** Screen y of a threat at y = 1 (touching Mochi). */
  bottom: number;
  mochiX: number;
  mochiY: number;
}

export function fieldGeom(w: number, h: number): FieldGeom {
  const margin = Math.min(110, w * 0.09);
  const mochiY = h - 78;
  // top: low enough that a fresh threat's bubble clears the score and wave label above it
  return { w, h, left: margin, right: w - margin, top: Math.round(Math.min(205, Math.max(150, h * 0.3))), bottom: mochiY - 76, mochiX: w / 2, mochiY };
}

export function toScreen(g: FieldGeom, x: number, y: number): { x: number; y: number } {
  return { x: g.left + x * (g.right - g.left), y: g.top + y * (g.bottom - g.top) };
}

// ---------- shape glyphs, drawn from the recognizer's own shape data

const GLYPHS = new Map(
  SHAPES.map((def) => {
    const xs = def.points.map((p) => p[0]);
    const ys = def.points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
    const cx = (Math.max(...xs) + minX) / 2;
    const cy = (Math.max(...ys) + minY) / 2;
    return [def.id, def.points.map(([x, y]) => [(x - cx) / span, (y - cy) / span] as const)] as const;
  }),
);

/** Draws a shape id as a symbol. New shapes in shapes.ts get a glyph automatically. */
export function drawGlyph(ctx: CanvasRenderingContext2D, id: string, cx: number, cy: number, size: number, color: string, width = 4): void {
  const pts = GLYPHS.get(id);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (!pts) ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  else pts.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * size, cy + y * size) : ctx.moveTo(cx + x * size, cy + y * size)));
  ctx.stroke();
  ctx.restore();
}

/** Thought bubble with the threat's symbols; drawn ones fade, the next one is underlined. */
function bubble(ctx: CanvasRenderingContext2D, t: Threat, x: number, y: number, now: number, flash: number): void {
  const n = t.symbols.length;
  const cell = 46;
  const w = 26 + n * cell;
  const h = 56;
  const by = y;
  circle(ctx, x - 6, by + 46, 5);
  outlined(ctx, '#fff', 3);
  circle(ctx, x - 1, by + 35, 7);
  outlined(ctx, '#fff', 3);
  roundRect(ctx, x, by, w, h, 26);
  outlined(ctx, flash > 0 ? '#ffe3ee' : '#fff');
  for (let i = 0; i < n; i++) {
    const gx = x - w / 2 + 13 + cell * i + cell / 2;
    const done = i < t.cleared;
    const next = i === t.cleared;
    const wobble = next ? Math.sin(now / 260 + i) * 1.5 : 0;
    ctx.save();
    ctx.globalAlpha = done ? 0.2 : next ? 1 : 0.5;
    drawGlyph(ctx, t.symbols[i], gx, by + wobble, 30, INK, next ? 5 : 4);
    ctx.restore();
    if (next && n > 1) {
      ctx.beginPath();
      ctx.moveTo(gx - 12, by + 22);
      ctx.lineTo(gx + 12, by + 22);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.strokeStyle = PINK_DARK;
      ctx.stroke();
    }
  }
}

// ---------- the view

/** The boss is drawn this much lower than its logical position (its arch is tall). */
const BOSS_DROP = 95;
/** Screen y the boss's thought bubble may rise to (just under the score and wave label). */
const BOSS_BUBBLE_MIN_Y = 116;

interface Pop {
  text: string;
  x: number;
  y: number;
  born: number;
  life: number;
  color: string;
  size: number;
}

interface Ghost {
  threat: Threat;
  born: number;
}

export class GameView {
  private pops: Pop[] = [];
  private ghosts: Ghost[] = [];
  private particles = new Particles();
  private shake = new Shake();
  private mood: Mood = 'sleep';
  private moodStart = 0;
  private moodMs = 0;
  private lean = 0;
  private banner: { title: string; sub: string; shapes: readonly string[]; until: number } | null = null;
  private heartFlashUntil = 0;
  private purrFlashUntil = 0;
  private spawnTimes = new Map<number, number>();
  private hitTimes = new Map<number, number>();
  private lastNow = 0;

  constructor(private readonly prefs: Prefs) {}

  reset(): void {
    this.pops = [];
    this.ghosts = [];
    this.particles.clear();
    this.mood = 'sleep';
    this.banner = null;
    this.spawnTimes.clear();
    this.hitTimes.clear();
  }

  /** Turns game events into short-lived animations. */
  handle(events: readonly GameEvent[], now: number, geom: FieldGeom): void {
    for (const e of events) {
      switch (e.type) {
        case 'waveStart':
          this.banner = e.boss
            ? { title: 'Bath Time!', sub: 'draw every shape on the tub', shapes: [], until: now + RULES.introMs }
            : { title: `Wave ${e.wave}`, sub: '', shapes: e.newShapes, until: now + RULES.introMs };
          if (e.boss) this.kick(6);
          break;
        case 'spawn':
          this.spawnTimes.set(e.threat.id, now);
          if (e.threat.boss) this.particles.burst('bubble', toScreen(geom, e.threat.x, 0).x, geom.top, 18, { gravity: -60, speed: [40, 160], size: [6, 14], life: [900, 1600], spreadX: 80 });
          break;
        case 'hit': {
          const p = this.threatPos(geom, e.threat);
          this.hitTimes.set(e.threat.id, now);
          this.particles.burst('star', p.x, p.y, 6, { speed: [90, 200], size: [5, 8] });
          this.pop('nya!', p.x, p.y - 34, now, PINK_DARK, 22);
          this.pop(`+${e.points}`, p.x + 40, p.y - 6, now, INK, 16);
          if (e.threat.boss) this.kick(4);
          this.setMood('pounce', now, 380, p.x, geom);
          break;
        }
        case 'defeat': {
          const p = this.threatPos(geom, e.threat);
          this.ghosts.push({ threat: { ...e.threat }, born: now });
          const bubbly = e.threat.kind === 'bathTub' || e.threat.kind === 'bathTime';
          const big = e.threat.boss ? 3 : 1;
          this.particles.burst('star', p.x, p.y, 10 * big, { speed: [120, 320 * big], size: [6, 11] });
          this.particles.burst('heart', p.x, p.y, 4 * big, { speed: [60, 160], size: [6, 9], colors: [PINK, '#ff8fb5'], up: 0.6 });
          if (bubbly) this.particles.burst('bubble', p.x, p.y, 12 * big, { gravity: -80, speed: [40, 180], size: [5, 12], life: [700, 1400] });
          this.pop(e.threat.boss ? 'BATH CANCELLED!' : 'pounce!', p.x, p.y - 44, now, PINK_DARK, e.threat.boss ? 34 : 26);
          this.pop(`+${e.points}`, p.x + 46, p.y, now, INK, 18);
          if (e.threat.boss) this.kick(10);
          this.setMood('pounce', now, 450, p.x, geom);
          this.spawnTimes.delete(e.threat.id);
          break;
        }
        case 'miss':
          this.pop('nyeh?', geom.mochiX + 100, geom.mochiY - 80, now, '#7d6f75', 22);
          break;
        case 'escape':
          this.setMood('startled', now, 900, geom.mochiX, geom);
          this.pop('eep!', geom.mochiX - 100, geom.mochiY - 80, now, '#c2455f', 26);
          this.particles.burst('dot', geom.mochiX, geom.mochiY - 40, 14, { colors: ['#d8d2cf', '#b9c3d6'], speed: [100, 260] });
          this.kick(e.threat.boss ? 12 : 7);
          this.spawnTimes.delete(e.threat.id);
          break;
        case 'heartLost':
          this.heartFlashUntil = now + 700;
          break;
        case 'combo':
          if (e.combo > 0 && e.combo % RULES.comboPerLevel === 0 && e.multiplier > 1 && e.combo <= RULES.comboPerLevel * (RULES.maxMultiplier - 1)) {
            this.purrFlashUntil = now + 900;
            this.pop(`purr x${e.multiplier}!`, geom.w - 150, geom.h - 100, now, PINK_DARK, 24);
            this.particles.burst('heart', geom.mochiX, geom.mochiY - 50, 8, { up: 0.8, speed: [120, 220], size: [6, 10], colors: [PINK, '#ff8fb5'], gravity: 120 });
            if (this.mood === 'sleep') this.setMood('happy', now, 700, geom.mochiX, geom);
          }
          break;
        case 'waveClear':
          this.pop(`wave clear! +${e.bonus}`, geom.w / 2, geom.h * 0.42, now, INK, 28);
          for (let i = 0; i < 5; i++) this.particles.burst('star', geom.w * (0.15 + i * 0.175), geom.top - 40, 5, { speed: [60, 160], gravity: 260, size: [6, 10] });
          break;
        case 'gameOver':
          this.setMood('startled', now, 60_000, geom.mochiX, geom);
          break;
      }
    }
  }

  /** A stroke that wasn't recognised as any shape during play. */
  rejected(x: number, y: number, now: number): void {
    this.pop('hmm?', x, y - 24, now, '#7d6f75', 20);
  }

  draw(ctx: CanvasRenderingContext2D, game: Game, now: number, geom: FieldGeom): void {
    const dt = this.lastNow ? Math.min(100, now - this.lastNow) : 16;
    this.lastNow = now;
    this.particles.update(dt);
    if (this.mood !== 'sleep' && now - this.moodStart > this.moodMs) this.mood = 'sleep';

    const off = this.shake.offset(now);
    ctx.save();
    if (this.prefs.shake) ctx.translate(off.x, off.y);
    this.drawThreats(ctx, game, now, geom);
    this.drawGhosts(ctx, now, geom);
    drawMochi(ctx, {
      x: geom.mochiX,
      y: geom.mochiY,
      mood: this.mood,
      t: this.moodMs ? Math.min(1, (now - this.moodStart) / this.moodMs) : 0,
      now,
      lean: this.lean,
    });
    this.particles.draw(ctx);
    ctx.restore();

    if (game.phase !== 'title') this.drawHud(ctx, game, now, geom);
    this.drawBanner(ctx, now, geom);
    this.drawPops(ctx, now);
  }

  private kick(px: number): void {
    if (this.prefs.shake) this.shake.kick(px);
  }

  /** Where a threat is drawn. The boss is drawn lower so its shower arch clears the score. */
  private threatPos(geom: FieldGeom, t: Threat): { x: number; y: number } {
    const p = toScreen(geom, t.x, t.y);
    if (t.boss) p.y += Math.min(BOSS_DROP, (geom.bottom - geom.top) * 0.3);
    return p;
  }

  private pop(text: string, x: number, y: number, now: number, color: string, size: number): void {
    this.pops.push({ text, x, y, born: now, life: 950, color, size });
  }

  private setMood(mood: Mood, now: number, ms: number, targetX: number, geom: FieldGeom): void {
    this.mood = mood;
    this.moodStart = now;
    this.moodMs = ms;
    this.lean = Math.max(-1, Math.min(1, (targetX - geom.mochiX) / (geom.w / 2)));
  }

  private drawThreats(ctx: CanvasRenderingContext2D, game: Game, now: number, geom: FieldGeom): void {
    const list = [...game.threats].sort((a, b) => a.y - b.y); // most urgent drawn on top
    for (const t of list) {
      const p = this.threatPos(geom, t);
      const born = this.spawnTimes.get(t.id) ?? now - 1000;
      const grow = Math.min(1, (now - born) / 280);
      const hitAt = this.hitTimes.get(t.id);
      const flash = hitAt !== undefined ? Math.max(0, 1 - (now - hitAt) / 220) : 0;
      const scale = (t.boss ? bossScale(geom) : 1) * (0.4 + 0.6 * easeOutBack(grow)) * (1 + 0.12 * flash);
      const bob = Math.sin(now / 320 + phase(t.id) * 6) * 3;
      ctx.save();
      ctx.globalAlpha = grow;
      ctx.translate(p.x, p.y + bob);
      ctx.save();
      ctx.scale(scale, scale);
      drawThreat(ctx, t.kind, now, t.id);
      ctx.restore();
      // The boss's long sequence must stay readable: its bubble rides above the shower arch
      // but never higher than just under the score.
      const by = t.boss ? Math.max(BOSS_BUBBLE_MIN_Y - (p.y + bob), -84 * scale - 44) : -64 * scale - 40;
      bubble(ctx, t, 0, by, now, flash);
      ctx.restore();
    }
  }

  private drawGhosts(ctx: CanvasRenderingContext2D, now: number, geom: FieldGeom): void {
    this.ghosts = this.ghosts.filter((g) => now - g.born < 340);
    for (const g of this.ghosts) {
      const k = (now - g.born) / 340;
      const p = this.threatPos(geom, g.threat);
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.translate(p.x, p.y - 30 * k);
      const s = (g.threat.boss ? bossScale(geom) : 1) * (1 - 0.7 * k);
      ctx.scale(s, s);
      ctx.rotate(k * 0.8);
      drawThreat(ctx, g.threat.kind, now, g.threat.id);
      ctx.restore();
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, game: Game, now: number, geom: FieldGeom): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.fillStyle = INK;
    ctx.strokeStyle = 'rgba(255, 246, 238, 0.9)';
    ctx.lineWidth = 8;
    ctx.font = `800 40px ${FONT}`;
    const score = game.score.toLocaleString();
    ctx.strokeText(score, geom.w / 2, 52);
    ctx.fillText(score, geom.w / 2, 52);
    ctx.font = `700 16px ${FONT}`;
    const label = game.spec.boss ? `wave ${game.wave} · boss` : `wave ${game.wave}`;
    ctx.strokeText(label, geom.w / 2, 76);
    ctx.fillText(label, geom.w / 2, 76);

    const flash = now < this.heartFlashUntil && Math.floor(now / 120) % 2 === 0;
    for (let i = 0; i < RULES.hearts; i++) {
      const hx = geom.w - 40 - (RULES.hearts - 1 - i) * 40;
      const full = i < game.hearts;
      const beat = full ? 1 + Math.max(0, Math.sin(now / 260 + i)) * 0.04 : 1;
      heartPath(ctx, hx, 38, 13 * beat);
      outlined(ctx, full ? (flash ? '#ff7f9f' : PINK) : 'rgba(255,255,255,0.6)', 4);
    }

    const mult = game.multiplier;
    const fill = mult >= RULES.maxMultiplier ? 1 : (game.combo % RULES.comboPerLevel) / RULES.comboPerLevel;
    const bw = 150;
    const bx = geom.w - bw - 24;
    const by = geom.h - 44;
    roundRect(ctx, bx + bw / 2, by, bw, 18, 9);
    outlined(ctx, 'rgba(255,255,255,0.75)', 3);
    if (fill > 0) {
      ctx.beginPath();
      ctx.roundRect(bx + 3, by - 6, (bw - 6) * fill, 12, 6);
      ctx.fillStyle = now < this.purrFlashUntil ? '#ff8fb5' : PINK;
      ctx.fill();
    }
    ctx.textAlign = 'right';
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(mult > 1 ? `purr x${mult}` : 'purr', bx + bw, by - 16);
    ctx.restore();
  }

  private drawBanner(ctx: CanvasRenderingContext2D, now: number, geom: FieldGeom): void {
    const b = this.banner;
    if (!b || now > b.until) return;
    const k = 1 - (b.until - now) / RULES.introMs;
    const cx = geom.w / 2;
    const cy = geom.h * 0.36;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 6, (1 - k) * 4);
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    const pulse = 1 + Math.sin(k * Math.PI) * 0.06;
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);
    ctx.font = `800 54px ${FONT}`;
    ctx.lineWidth = 10;
    ctx.strokeStyle = CREAM;
    ctx.strokeText(b.title, 0, 0);
    ctx.fillStyle = b.sub ? PINK_DARK : INK;
    ctx.fillText(b.title, 0, 0);
    if (b.sub) {
      ctx.font = `700 20px ${FONT}`;
      ctx.lineWidth = 6;
      ctx.strokeText(b.sub, 0, 34);
      ctx.fillStyle = INK;
      ctx.fillText(b.sub, 0, 34);
    }
    if (b.shapes.length) {
      const w = 150 + 60 * b.shapes.length;
      roundRect(ctx, 0, 56, w, 64, 32);
      outlined(ctx, '#fff');
      ctx.font = `700 20px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = INK;
      ctx.fillText('new shape', -w / 2 + 24, 63);
      b.shapes.forEach((id, i) => drawGlyph(ctx, id, -w / 2 + 160 + i * 60, 56, 34, PINK_DARK, 5));
    }
    ctx.restore();
  }

  private drawPops(ctx: CanvasRenderingContext2D, now: number): void {
    this.pops = this.pops.filter((p) => now - p.born < p.life);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const p of this.pops) {
      const k = (now - p.born) / p.life;
      ctx.globalAlpha = 1 - k * k;
      const s = k < 0.12 ? 0.6 + (k / 0.12) * 0.4 : 1;
      ctx.font = `800 ${Math.round(p.size * s)}px ${FONT}`;
      const y = p.y - 38 * k;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255, 246, 238, 0.95)';
      ctx.strokeText(p.text, p.x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, y);
    }
    ctx.restore();
  }
}

function easeOutBack(k: number): number {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
}

/** The boss shrinks a little in short windows so it doesn't swallow the playfield. */
function bossScale(geom: FieldGeom): number {
  return Math.max(1.3, Math.min(1.9, 1.3 + (geom.h - 520) / 300));
}
