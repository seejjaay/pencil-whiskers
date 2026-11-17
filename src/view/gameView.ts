/**
 * Draws the game: Mochi, threats with symbol bubbles, nap hearts, score, purr meter, wave
 * banners and short reactions. Milestone 3 art is deliberately simple placeholder shapes;
 * the full procedural art, particles and sound arrive in Milestone 4. Pure presentation:
 * it reads the Game and reacts to its events, it never changes the rules.
 */
import { RULES, type Game, type GameEvent, type Threat } from '../game/game';
import type { ThreatKind } from '../game/waves';
import { SHAPES } from '../recognizer/shapes';

const INK = '#5b3b4a';
const CREAM = '#fff6ee';
const PINK = '#f39bbb';
const PINK_DARK = '#d36f98';
const FONT = 'ui-rounded, "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';

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
  const mochiY = h - 62;
  // top: low enough that a fresh threat's bubble clears the score and wave label above it
  return { w, h, left: margin, right: w - margin, top: 205, bottom: mochiY - 70, mochiX: w / 2, mochiY };
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
    // normalised to a unit box around (0, 0), aspect kept
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
  if (!pts) {
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  } else {
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * size, cy + y * size) : ctx.moveTo(cx + x * size, cy + y * size)));
  }
  ctx.stroke();
  ctx.restore();
}

// ---------- small drawing helpers

function outlined(ctx: CanvasRenderingContext2D, fill: string, width = 4): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, r);
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  ctx.closePath();
}

/** A grumpy little face: two dots, slanted brows, a frown. */
function face(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.fillStyle = INK;
  circle(ctx, x - 9, y, 3.2);
  ctx.fill();
  circle(ctx, x + 9, y, 3.2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 14, y - 9);
  ctx.lineTo(x - 5, y - 6);
  ctx.moveTo(x + 14, y - 9);
  ctx.lineTo(x + 5, y - 6);
  ctx.moveTo(x - 6, y + 11);
  ctx.quadraticCurveTo(x, y + 6, x + 6, y + 11);
  ctx.stroke();
  ctx.restore();
}

/** Placeholder bodies, one per threat kind. Returns where the face goes. */
function threatBody(ctx: CanvasRenderingContext2D, kind: ThreatKind, x: number, y: number, now: number): { fx: number; fy: number } {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (kind) {
    case 'vacuum': {
      ctx.beginPath();
      ctx.moveTo(x + 22, y - 12);
      ctx.quadraticCurveTo(x + 48, y - 40, x + 30, y - 52);
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.stroke();
      roundRect(ctx, x, y, 64, 46, 16);
      outlined(ctx, '#b9c3d6');
      for (const dx of [-18, 18]) {
        circle(ctx, x + dx, y + 25, 7);
        outlined(ctx, '#7d869b', 3);
      }
      return { fx: x, fy: y - 2 };
    }
    case 'sprayBottle': {
      roundRect(ctx, x - 4, y - 32, 30, 14, 5);
      outlined(ctx, '#e9eef6', 3);
      ctx.beginPath();
      ctx.moveTo(x + 10, y - 26);
      ctx.lineTo(x + 18, y - 12);
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.stroke();
      roundRect(ctx, x, y + 6, 44, 58, 14);
      outlined(ctx, '#9fd3f0');
      return { fx: x, fy: y + 6 };
    }
    case 'cucumber': {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.22);
      roundRect(ctx, 0, 0, 84, 36, 18);
      outlined(ctx, '#8fd18a');
      ctx.fillStyle = '#5c9e58';
      for (const [dx, dy] of [[-28, -8], [-10, 9], [22, -9], [34, 6]]) {
        circle(ctx, dx, dy, 2.5);
        ctx.fill();
      }
      ctx.restore();
      return { fx: x, fy: y };
    }
    case 'bathTub': {
      for (let i = 0; i < 3; i++) {
        const bob = Math.sin(now / 400 + i * 2) * 3;
        circle(ctx, x - 22 + i * 20, y - 30 + bob - (i % 2) * 6, 8 + (i % 2) * 3);
        outlined(ctx, '#e3f4ff', 3);
      }
      roundRect(ctx, x, y + 4, 92, 42, 16);
      outlined(ctx, '#f7f9fc');
      for (const dx of [-30, 30]) {
        roundRect(ctx, x + dx, y + 30, 10, 12, 4);
        outlined(ctx, '#d5dbe6', 3);
      }
      return { fx: x, fy: y + 4 };
    }
    case 'thunderCloud': {
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 18);
      ctx.lineTo(x - 8, y + 36);
      ctx.lineTo(x + 4, y + 34);
      ctx.lineTo(x - 4, y + 52);
      ctx.lineTo(x + 16, y + 28);
      ctx.lineTo(x + 4, y + 30);
      ctx.closePath();
      outlined(ctx, '#ffd65c', 3);
      ctx.beginPath();
      ctx.arc(x - 24, y + 4, 18, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(x - 4, y - 12, 24, Math.PI, Math.PI * 2);
      ctx.arc(x + 24, y + 2, 20, Math.PI * 1.5, Math.PI * 0.5);
      ctx.closePath();
      outlined(ctx, '#a3a8bb');
      return { fx: x, fy: y };
    }
    case 'doorbell': {
      const ring = (Math.sin(now / 90) + 1) / 2;
      ctx.save();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.4 + 0.6 * ring;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(x, y, 38, s > 0 ? -0.5 : Math.PI - 0.5, s > 0 ? 0.5 : Math.PI + 0.5);
        ctx.stroke();
      }
      ctx.restore();
      circle(ctx, x, y, 28);
      outlined(ctx, '#ffd77a');
      return { fx: x, fy: y };
    }
  }
}

/** Thought bubble with the threat's symbols; drawn ones fade, the next one is underlined. */
function bubble(ctx: CanvasRenderingContext2D, t: Threat, x: number, y: number): void {
  const n = t.symbols.length;
  const cell = 46;
  const w = 26 + n * cell;
  const h = 56;
  const by = y - 82;
  circle(ctx, x - 8, y - 40, 5);
  outlined(ctx, '#fff', 3);
  circle(ctx, x - 2, y - 50, 7);
  outlined(ctx, '#fff', 3);
  roundRect(ctx, x, by, w, h, 26);
  outlined(ctx, '#fff');
  for (let i = 0; i < n; i++) {
    const gx = x - w / 2 + 13 + cell * i + cell / 2;
    const done = i < t.cleared;
    const next = i === t.cleared;
    ctx.save();
    ctx.globalAlpha = done ? 0.22 : next ? 1 : 0.55;
    drawGlyph(ctx, t.symbols[i], gx, by, 30, INK, next ? 5 : 4);
    ctx.restore();
    if (next && n > 1) {
      ctx.save();
      ctx.strokeStyle = PINK_DARK;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(gx - 12, by + 22);
      ctx.lineTo(gx + 12, by + 22);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---------- the view

type Mood = 'sleep' | 'pounce' | 'startled' | 'happy';

interface Pop {
  text: string;
  x: number;
  y: number;
  born: number;
  life: number;
  color: string;
  size: number;
}

interface Burst {
  x: number;
  y: number;
  born: number;
}

interface Ghost {
  threat: Threat;
  born: number;
}

export class GameView {
  private pops: Pop[] = [];
  private bursts: Burst[] = [];
  private ghosts: Ghost[] = [];
  private mood: Mood = 'sleep';
  private moodUntil = 0;
  private pounceToX = 0;
  private banner: { title: string; shapes: readonly string[]; until: number } | null = null;
  private heartFlashUntil = 0;
  private purrFlashUntil = 0;
  private spawnTimes = new Map<number, number>();

  reset(): void {
    this.pops = [];
    this.bursts = [];
    this.ghosts = [];
    this.mood = 'sleep';
    this.banner = null;
    this.spawnTimes.clear();
  }

  /** Turns game events into short-lived animations. */
  handle(events: readonly GameEvent[], now: number, geom: FieldGeom): void {
    for (const e of events) {
      switch (e.type) {
        case 'waveStart':
          this.banner = { title: `Wave ${e.wave}`, shapes: e.newShapes, until: now + RULES.introMs };
          break;
        case 'spawn':
          this.spawnTimes.set(e.threat.id, now);
          break;
        case 'hit': {
          const p = toScreen(geom, e.threat.x, e.threat.y);
          this.pop('nya!', p.x, p.y - 30, now, PINK_DARK, 22);
          this.pop(`+${e.points}`, p.x + 34, p.y - 4, now, INK, 16);
          break;
        }
        case 'defeat': {
          const p = toScreen(geom, e.threat.x, e.threat.y);
          this.ghosts.push({ threat: { ...e.threat }, born: now });
          this.bursts.push({ x: p.x, y: p.y, born: now });
          this.pop('pounce!', p.x, p.y - 40, now, PINK_DARK, 26);
          this.pop(`+${e.points}`, p.x + 40, p.y, now, INK, 18);
          this.setMood('pounce', now, 450);
          this.pounceToX = p.x;
          this.spawnTimes.delete(e.threat.id);
          break;
        }
        case 'miss':
          this.pop('nyeh?', geom.mochiX + 90, geom.mochiY - 70, now, '#7d6f75', 22);
          break;
        case 'escape':
          this.setMood('startled', now, 900);
          this.pop('eep!', geom.mochiX - 90, geom.mochiY - 70, now, '#c2455f', 26);
          this.spawnTimes.delete(e.threat.id);
          break;
        case 'heartLost':
          this.heartFlashUntil = now + 700;
          break;
        case 'combo':
          if (e.combo > 0 && e.combo % RULES.comboPerLevel === 0 && e.multiplier > 1 && e.combo <= RULES.comboPerLevel * (RULES.maxMultiplier - 1)) {
            this.purrFlashUntil = now + 900;
            this.pop(`purr x${e.multiplier}!`, geom.w - 150, geom.h - 90, now, PINK_DARK, 24);
            if (this.mood === 'sleep') this.setMood('happy', now, 600);
          }
          break;
        case 'waveClear':
          this.pop(`wave clear! +${e.bonus}`, geom.w / 2, geom.h * 0.42, now, INK, 28);
          break;
        case 'gameOver':
          this.setMood('startled', now, 60_000);
          break;
      }
    }
  }

  /** A stroke that wasn't recognised as any shape during play. */
  rejected(x: number, y: number, now: number): void {
    this.pop('hmm?', x, y - 24, now, '#7d6f75', 20);
  }

  draw(ctx: CanvasRenderingContext2D, game: Game, now: number, geom: FieldGeom): void {
    if (this.mood !== 'sleep' && now > this.moodUntil) this.mood = 'sleep';
    this.drawThreats(ctx, game, now, geom);
    this.drawGhosts(ctx, now, geom);
    this.drawMochi(ctx, now, geom, game.phase === 'gameover');
    if (game.phase !== 'title') this.drawHud(ctx, game, now, geom);
    this.drawBanner(ctx, now, geom);
    this.drawBursts(ctx, now);
    this.drawPops(ctx, now);
  }

  private pop(text: string, x: number, y: number, now: number, color: string, size: number): void {
    this.pops.push({ text, x, y, born: now, life: 900, color, size });
  }

  private setMood(mood: Mood, now: number, ms: number): void {
    this.mood = mood;
    this.moodUntil = now + ms;
  }

  private drawThreats(ctx: CanvasRenderingContext2D, game: Game, now: number, geom: FieldGeom): void {
    // Draw the most urgent last, so it is on top.
    const list = [...game.threats].sort((a, b) => a.y - b.y);
    for (const t of list) {
      const p = toScreen(geom, t.x, t.y);
      const born = this.spawnTimes.get(t.id) ?? now - 1000;
      const grow = Math.min(1, (now - born) / 250);
      const bob = Math.sin(now / 320 + t.id) * 3;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.scale(0.4 + 0.6 * easeOutBack(grow), 0.4 + 0.6 * easeOutBack(grow));
      ctx.globalAlpha = grow;
      const f = threatBody(ctx, t.kind, 0, 0, now);
      face(ctx, f.fx, f.fy);
      bubble(ctx, t, 0, -14);
      ctx.restore();
    }
  }

  private drawGhosts(ctx: CanvasRenderingContext2D, now: number, geom: FieldGeom): void {
    this.ghosts = this.ghosts.filter((g) => now - g.born < 320);
    for (const g of this.ghosts) {
      const k = (now - g.born) / 320;
      const p = toScreen(geom, g.threat.x, g.threat.y);
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.translate(p.x, p.y);
      ctx.scale(1 - 0.6 * k, 1 - 0.6 * k);
      ctx.rotate(k * 0.6);
      const f = threatBody(ctx, g.threat.kind, 0, 0, now);
      face(ctx, f.fx, f.fy);
      ctx.restore();
    }
  }

  private drawMochi(ctx: CanvasRenderingContext2D, now: number, geom: FieldGeom, gameOver: boolean): void {
    const mood = this.mood;
    let x = geom.mochiX;
    let y = geom.mochiY;
    let sx = 1;
    let sy = 1;
    if (mood === 'pounce') {
      const k = 1 - Math.max(0, this.moodUntil - now) / 450; // 0 -> 1
      const arc = Math.sin(k * Math.PI);
      x += (Math.max(geom.left, Math.min(geom.right, this.pounceToX)) - x) * 0.18 * arc;
      y -= 46 * arc;
      sy = 1 + 0.12 * arc;
      sx = 1 - 0.08 * arc;
    } else if (mood === 'startled') {
      const k = Math.max(0, this.moodUntil - now);
      y -= gameOver ? 6 : Math.min(18, k / 30);
      sx = 0.94;
      sy = 1.08;
    } else if (mood === 'happy') {
      const k = Math.sin(((this.moodUntil - now) / 600) * Math.PI);
      sx = 1 + 0.08 * k;
      sy = 1 - 0.08 * k;
    } else {
      const breath = Math.sin(now / 700) * 0.03;
      sx = 1 + breath;
      sy = 1 - breath * 0.6;
    }

    ctx.save();
    ctx.translate(x, y);
    // tail
    ctx.save();
    ctx.rotate(Math.sin(now / 900) * 0.25);
    ctx.beginPath();
    ctx.moveTo(58, 8);
    ctx.quadraticCurveTo(110, 0, 92, -40);
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 9;
    ctx.strokeStyle = CREAM;
    ctx.stroke();
    ctx.restore();
    ctx.scale(sx, sy);
    // ears
    const twitch = Math.sin(now / 160) > 0.97 ? 0.15 : 0;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 34, -34);
      ctx.rotate(s * (0.25 + (s > 0 ? twitch : 0)));
      ctx.beginPath();
      ctx.moveTo(-15, 8);
      ctx.lineTo(0, -24);
      ctx.lineTo(15, 8);
      ctx.closePath();
      outlined(ctx, CREAM, 5);
      ctx.restore();
    }
    // body
    ctx.beginPath();
    ctx.ellipse(0, 0, 72, 46, 0, 0, Math.PI * 2);
    outlined(ctx, CREAM, 5);
    // cheeks
    ctx.fillStyle = 'rgba(243, 155, 187, 0.55)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * 30, 8, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // eyes
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    if (mood === 'startled') {
      for (const s of [-1, 1]) {
        circle(ctx, s * 18, -6, 8);
        outlined(ctx, '#fff', 3);
        circle(ctx, s * 18, -6, 3.5);
        ctx.fill();
      }
    } else if (mood === 'happy' || mood === 'pounce') {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 18 - 8, -2);
        ctx.lineTo(s * 18, -10);
        ctx.lineTo(s * 18 + 8, -2);
        ctx.stroke();
      }
    } else {
      const blink = Math.sin(now / 2300) > 0.995;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        if (blink) {
          ctx.moveTo(s * 18 - 8, -6);
          ctx.lineTo(s * 18 + 8, -6);
        } else {
          ctx.arc(s * 18, -8, 8, 0.15 * Math.PI, 0.85 * Math.PI);
        }
        ctx.stroke();
      }
    }
    // nose and mouth
    ctx.beginPath();
    ctx.moveTo(-4, 6);
    ctx.lineTo(4, 6);
    ctx.lineTo(0, 10);
    ctx.closePath();
    ctx.fillStyle = PINK_DARK;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.quadraticCurveTo(-6, 17, -11, 13);
    ctx.moveTo(0, 10);
    ctx.quadraticCurveTo(6, 17, 11, 13);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();

    // zzz while napping, "!" when startled
    ctx.save();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    if (mood === 'sleep') {
      for (let i = 0; i < 3; i++) {
        const k = ((now / 1800 + i / 3) % 1 + 1) % 1;
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.8;
        ctx.font = `700 ${14 + i * 4}px ${FONT}`;
        ctx.fillText('z', x + 58 + k * 30 + i * 8, y - 52 - k * 50);
      }
    } else if (mood === 'startled') {
      ctx.font = `800 40px ${FONT}`;
      ctx.fillStyle = '#c2455f';
      ctx.fillText('!', x + 64, y - 58);
    }
    ctx.restore();
  }

  private drawHud(ctx: CanvasRenderingContext2D, game: Game, now: number, geom: FieldGeom): void {
    ctx.save();
    // score + wave, top centre
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = `800 40px ${FONT}`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255, 246, 238, 0.9)';
    ctx.lineJoin = 'round';
    const score = game.score.toLocaleString();
    ctx.strokeText(score, geom.w / 2, 52);
    ctx.fillText(score, geom.w / 2, 52);
    ctx.font = `700 16px ${FONT}`;
    ctx.strokeText(`wave ${game.wave}`, geom.w / 2, 76);
    ctx.fillText(`wave ${game.wave}`, geom.w / 2, 76);

    // nap hearts, top right
    const flash = now < this.heartFlashUntil && Math.floor(now / 120) % 2 === 0;
    for (let i = 0; i < RULES.hearts; i++) {
      const hx = geom.w - 40 - (RULES.hearts - 1 - i) * 40;
      heart(ctx, hx, 38, 13);
      const full = i < game.hearts;
      outlined(ctx, full ? (flash ? '#ff7f9f' : PINK) : 'rgba(255,255,255,0.6)', 4);
    }

    // purr meter, bottom right
    const mult = game.multiplier;
    const level = game.combo % RULES.comboPerLevel;
    const fill = mult >= RULES.maxMultiplier ? 1 : level / RULES.comboPerLevel;
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
    const k = 1 - (b.until - now) / RULES.introMs; // 0 -> 1
    const alpha = Math.min(1, k * 6, (1 - k) * 4);
    const cx = geom.w / 2;
    const cy = geom.h * 0.38;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.font = `800 52px ${FONT}`;
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = CREAM;
    ctx.strokeText(b.title, cx, cy);
    ctx.fillStyle = INK;
    ctx.fillText(b.title, cx, cy);
    if (b.shapes.length) {
      const w = 150 + 60 * b.shapes.length;
      roundRect(ctx, cx, cy + 56, w, 64, 32);
      outlined(ctx, '#fff');
      ctx.font = `700 20px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = INK;
      ctx.fillText('new shape', cx - w / 2 + 24, cy + 63);
      b.shapes.forEach((id, i) => drawGlyph(ctx, id, cx - w / 2 + 160 + i * 60, cy + 56, 34, PINK_DARK, 5));
    }
    ctx.restore();
  }

  private drawBursts(ctx: CanvasRenderingContext2D, now: number): void {
    this.bursts = this.bursts.filter((b) => now - b.born < 500);
    for (const b of this.bursts) {
      const k = (now - b.born) / 500;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = PINK;
      ctx.lineWidth = 6 * (1 - k) + 1;
      circle(ctx, b.x, b.y, 20 + 60 * k);
      ctx.stroke();
      ctx.fillStyle = '#ffd65c';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        circle(ctx, b.x + Math.cos(a) * (24 + 70 * k), b.y + Math.sin(a) * (24 + 70 * k), 5 * (1 - k) + 1);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawPops(ctx: CanvasRenderingContext2D, now: number): void {
    this.pops = this.pops.filter((p) => now - p.born < p.life);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const p of this.pops) {
      const k = (now - p.born) / p.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `800 ${p.size}px ${FONT}`;
      const y = p.y - 36 * k;
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
