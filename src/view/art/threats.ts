/**
 * The household threats, each an original character built from simple shapes, with a face.
 * Drawn centred on (0, 0) at unit scale; the caller translates and scales.
 */
import type { ThreatKind } from '../../game/waves';
import { CREAM, FONT, INK, circle, ellipse, line, outlined, phase, roundRect } from './draw';

type Eyes = 'dots' | 'ovals' | 'wide' | 'squint';
type Mouth = 'frown' | 'grit' | 'o' | 'smirk' | 'zigzag' | 'shout';

function face(ctx: CanvasRenderingContext2D, x: number, y: number, eyes: Eyes, mouth: Mouth, brows: boolean, blink: boolean, gap = 10): void {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  for (const s of [-1, 1]) {
    const ex = x + s * gap;
    if (blink || eyes === 'squint') {
      ctx.beginPath();
      ctx.moveTo(ex - 5, y);
      ctx.lineTo(ex + 5, y + (eyes === 'squint' && !blink ? -s * 1.5 : 0));
      line(ctx, 3);
    } else if (eyes === 'wide') {
      circle(ctx, ex, y, 6.5);
      outlined(ctx, '#fff', 2.5);
      circle(ctx, ex + s * 0.5, y + 1, 3);
      ctx.fillStyle = INK;
      ctx.fill();
    } else if (eyes === 'ovals') {
      ellipse(ctx, ex, y, 3.2, 4.6);
      ctx.fill();
    } else {
      circle(ctx, ex, y, 3.3);
      ctx.fill();
    }
    if (brows) {
      ctx.beginPath();
      ctx.moveTo(ex - s * 6, y - 10);
      ctx.lineTo(ex + s * 4, y - 6);
      line(ctx, 3);
    }
  }
  const my = y + 12;
  ctx.beginPath();
  switch (mouth) {
    case 'frown':
      ctx.moveTo(x - 6, my + 2);
      ctx.quadraticCurveTo(x, my - 4, x + 6, my + 2);
      line(ctx, 3);
      break;
    case 'grit':
      roundRect(ctx, x, my, 18, 8, 3);
      outlined(ctx, '#fff', 2.5);
      ctx.beginPath();
      for (const dx of [-3, 3]) {
        ctx.moveTo(x + dx, my - 4);
        ctx.lineTo(x + dx, my + 4);
      }
      line(ctx, 2);
      break;
    case 'o':
      circle(ctx, x, my, 3.5);
      line(ctx, 2.5);
      break;
    case 'smirk':
      ctx.moveTo(x - 6, my);
      ctx.quadraticCurveTo(x + 2, my + 3, x + 7, my - 3);
      line(ctx, 3);
      break;
    case 'zigzag':
      ctx.moveTo(x - 9, my);
      for (let i = 1; i <= 6; i++) ctx.lineTo(x - 9 + i * 3, my + (i % 2 ? -3 : 0));
      line(ctx, 2.5);
      break;
    case 'shout':
      ellipse(ctx, x, my + 1, 6, 5);
      outlined(ctx, '#c2455f', 2.5);
      break;
  }
  ctx.restore();
}

export function drawThreat(ctx: CanvasRenderingContext2D, kind: ThreatKind, now: number, id: number): void {
  const ph = phase(id);
  const blink = ((now / 3200 + ph) % 1) > 0.965;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (kind) {
    case 'vacuum': {
      // dust puffs
      for (let i = 0; i < 3; i++) {
        const k = ((now / 900 + ph + i / 3) % 1 + 1) % 1;
        ctx.globalAlpha = (1 - k) * 0.5;
        circle(ctx, -44 - k * 16, 18 - k * 10 - i * 4, 4 + k * 5);
        ctx.fillStyle = '#d8d2cf';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // hose and nozzle
      ctx.beginPath();
      ctx.moveTo(24, -14);
      ctx.bezierCurveTo(56, -40, 30, -64, 6, -58);
      line(ctx, 9);
      ctx.beginPath();
      ctx.moveTo(24, -14);
      ctx.bezierCurveTo(56, -40, 30, -64, 6, -58);
      line(ctx, 4, '#8e98ad');
      roundRect(ctx, -6, -60, 26, 12, 4);
      outlined(ctx, '#7d869b', 3);
      roundRect(ctx, 0, 0, 68, 50, 18);
      outlined(ctx, '#b9c3d6');
      roundRect(ctx, 0, 12, 68, 10, 2);
      ctx.fillStyle = '#9aa5bb';
      ctx.fill();
      circle(ctx, 24, -12, 4);
      outlined(ctx, '#ef8a8a', 2);
      for (const dx of [-20, 20]) {
        circle(ctx, dx, 27, 8);
        outlined(ctx, '#6f7890', 3);
      }
      face(ctx, -4, -4, 'ovals', 'grit', true, blink);
      return;
    }
    case 'sprayBottle': {
      // a squirt every ~2.6 s
      const k = ((now / 2600 + ph) % 1 + 1) % 1;
      if (k < 0.18) {
        for (let i = 0; i < 4; i++) {
          const d = (k / 0.18) * (18 + i * 9);
          circle(ctx, -34 - d, -34 + i * 2 - d * 0.15, 2.6);
          ctx.fillStyle = '#7cc3ea';
          ctx.fill();
        }
      }
      roundRect(ctx, 0, -26, 18, 12, 3);
      outlined(ctx, '#e9eef6', 3);
      ctx.beginPath();
      ctx.moveTo(-6, -38);
      ctx.lineTo(10, -38);
      ctx.lineTo(10, -30);
      ctx.lineTo(-24, -32);
      ctx.closePath();
      outlined(ctx, '#f7f9fc', 3);
      ctx.beginPath();
      ctx.moveTo(4, -28);
      ctx.quadraticCurveTo(14, -20, 8, -12);
      line(ctx, 4);
      roundRect(ctx, 0, 10, 48, 56, 16);
      outlined(ctx, '#9fd3f0');
      roundRect(ctx, 0, 22, 32, 18, 5);
      outlined(ctx, '#fff', 2.5);
      ctx.beginPath();
      ctx.moveTo(0, 15);
      ctx.quadraticCurveTo(5, 23, 0, 27);
      ctx.quadraticCurveTo(-5, 23, 0, 15);
      ctx.fillStyle = '#7cc3ea';
      ctx.fill();
      face(ctx, 0, -2, 'squint', 'o', true, blink, 9);
      return;
    }
    case 'cucumber': {
      ctx.save();
      ctx.rotate(-0.25 + Math.sin(now / 600 + ph * 6) * 0.06);
      roundRect(ctx, 0, 0, 92, 38, 19);
      outlined(ctx, '#8fd18a');
      ctx.save();
      roundRect(ctx, 0, 0, 92, 38, 19);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      for (const dy of [-10, 2]) {
        roundRect(ctx, 0, dy, 90, 4, 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = '#5c9e58';
      for (const [dx, dy] of [[-32, -9], [-14, 11], [26, -10], [36, 7], [6, 12]]) {
        circle(ctx, dx, dy, 2.4);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(44, -4);
      ctx.quadraticCurveTo(58, -18, 50, -24);
      line(ctx, 4, '#5c9e58');
      ellipse(ctx, 56, -22, 7, 4, -0.6);
      outlined(ctx, '#a8e09f', 2.5);
      face(ctx, -6, -3, 'wide', 'smirk', false, blink);
      ctx.restore();
      return;
    }
    case 'bathTub':
      drawTub(ctx, now, ph, blink, false);
      return;
    case 'bathTime':
      drawTub(ctx, now, ph, blink, true);
      return;
    case 'thunderCloud': {
      // rain
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const k = ((now / 500 + i / 5 + ph) % 1 + 1) % 1;
        const x = -28 + i * 14;
        ctx.moveTo(x, 20 + k * 30);
        ctx.lineTo(x - 2, 26 + k * 30);
      }
      line(ctx, 2.5, '#7cc3ea');
      ctx.restore();
      // bolt flickers
      const flash = ((now / 1700 + ph) % 1) < 0.12;
      ctx.beginPath();
      ctx.moveTo(4, 16);
      ctx.lineTo(-8, 36);
      ctx.lineTo(4, 34);
      ctx.lineTo(-4, 54);
      ctx.lineTo(18, 28);
      ctx.lineTo(6, 30);
      ctx.closePath();
      outlined(ctx, flash ? '#fff3a6' : '#ffd65c', 3);
      ctx.beginPath();
      ctx.arc(-28, 4, 18, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(-8, -14, 24, Math.PI, Math.PI * 1.85);
      ctx.arc(18, -8, 18, Math.PI * 1.3, Math.PI * 2);
      ctx.arc(28, 6, 16, Math.PI * 1.5, Math.PI * 0.5);
      ctx.closePath();
      outlined(ctx, flash ? '#c3c7d6' : '#a3a8bb');
      face(ctx, -2, 0, 'ovals', 'zigzag', true, blink);
      return;
    }
    case 'doorbell': {
      const ringing = ((now / 1400 + ph) % 1) < 0.35;
      const shake = ringing ? Math.sin(now / 25) * 0.12 : 0;
      if (ringing) {
        ctx.save();
        for (const s of [-1, 1]) {
          for (const r of [40, 50]) {
            ctx.beginPath();
            ctx.arc(0, 0, r, s > 0 ? -0.45 : Math.PI - 0.45, s > 0 ? 0.45 : Math.PI + 0.45);
            line(ctx, 3);
          }
        }
        ctx.font = `800 14px ${FONT}`;
        ctx.fillStyle = INK;
        ctx.textAlign = 'center';
        ctx.fillText('ding!', 34, -38);
        ctx.restore();
      }
      ctx.save();
      ctx.rotate(shake);
      roundRect(ctx, 0, 0, 62, 74, 14);
      outlined(ctx, '#e9d7b8');
      circle(ctx, 0, 6, 24);
      outlined(ctx, '#ffd77a');
      face(ctx, 0, 2, 'wide', ringing ? 'shout' : 'frown', true, blink && !ringing, 9);
      ctx.restore();
      return;
    }
  }
}

/** Clawfoot tub; the boss version is bigger, with a shower arch, a foam mountain and a label. */
function drawTub(ctx: CanvasRenderingContext2D, now: number, ph: number, blink: boolean, boss: boolean): void {
  if (boss) {
    // shower pipe arching over the back, with drips
    ctx.beginPath();
    ctx.moveTo(40, 0);
    ctx.lineTo(40, -62);
    ctx.quadraticCurveTo(40, -78, 22, -78);
    ctx.lineTo(4, -78);
    line(ctx, 8);
    ctx.beginPath();
    ctx.moveTo(40, 0);
    ctx.lineTo(40, -62);
    ctx.quadraticCurveTo(40, -78, 22, -78);
    ctx.lineTo(4, -78);
    line(ctx, 3.5, '#d5dbe6');
    ctx.beginPath();
    ctx.moveTo(-12, -84);
    ctx.lineTo(8, -84);
    ctx.lineTo(4, -72);
    ctx.lineTo(-8, -72);
    ctx.closePath();
    outlined(ctx, '#d5dbe6', 3);
    for (let i = 0; i < 4; i++) {
      const k = ((now / 450 + i / 4) % 1 + 1) % 1;
      ellipse(ctx, -6 + i * 4, -66 + k * 40, 1.8, 3.2);
      ctx.fillStyle = '#7cc3ea';
      ctx.fill();
    }
  }
  // foam
  const foam = boss ? 7 : 4;
  for (let i = 0; i < foam; i++) {
    const bob = Math.sin(now / 420 + i * 1.7 + ph * 6) * 2.5;
    const x = -36 + (i * 72) / (foam - 1);
    const r = 9 + ((i * 7) % 5);
    circle(ctx, x, -24 + bob - (i % 2) * 6, r);
    outlined(ctx, '#eef8ff', 3);
  }
  // feet
  for (const dx of [-32, 32]) {
    ctx.beginPath();
    ctx.moveTo(dx - 6, 22);
    ctx.quadraticCurveTo(dx, 38, dx + (dx > 0 ? 9 : -9), 36);
    line(ctx, 7);
    ctx.beginPath();
    ctx.moveTo(dx - 6, 22);
    ctx.quadraticCurveTo(dx, 38, dx + (dx > 0 ? 9 : -9), 36);
    line(ctx, 3.5, '#e2c48f');
  }
  // tub body
  ctx.beginPath();
  ctx.moveTo(-50, -14);
  ctx.lineTo(50, -14);
  ctx.bezierCurveTo(50, 22, 30, 30, 0, 30);
  ctx.bezierCurveTo(-30, 30, -50, 22, -50, -14);
  ctx.closePath();
  outlined(ctx, '#f7f9fc');
  roundRect(ctx, 0, -14, 108, 10, 5);
  outlined(ctx, CREAM, 3.5);
  if (boss) {
    ctx.save();
    ctx.font = `900 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d36f98';
    ctx.fillText('BATH TIME', 0, 22);
    ctx.restore();
  }
  face(ctx, 0, 0, boss ? 'ovals' : 'dots', boss ? 'grit' : 'frown', boss, blink, 12);
}

/** Stand-in look for an entity that has no art yet: a soft blob with a face and its name. */
export function drawPlaceholderEntity(ctx: CanvasRenderingContext2D, label: string, now: number, id: number): void {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) % 360;
  const blink = ((now / 3200 + phase(id)) % 1) > 0.965;
  roundRect(ctx, 0, 0, 72, 54, 22);
  outlined(ctx, `hsl(${h} 60% 82%)`);
  face(ctx, 0, -4, 'dots', 'frown', true, blink);
  ctx.save();
  ctx.font = `700 12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.fillText(label, 0, 44);
  ctx.restore();
}
