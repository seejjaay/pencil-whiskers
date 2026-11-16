import type { StrokePoint } from '../input/strokes';
import type { Recognition } from '../recognizer/recognizer';

/** Floating pill above a finished stroke saying what it was read as. Debug-grade for M2. */
export function drawRecognitionLabel(
  ctx: CanvasRenderingContext2D,
  pts: readonly StrokePoint[],
  res: Recognition,
  alpha: number,
): void {
  if (pts.length === 0) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
  }
  const text = res.accepted && res.top
    ? `${res.top.label}  ${Math.round(res.top.score * 100)}%`
    : res.top
      ? `hmm? ${res.top.label} ${Math.round(res.top.score * 100)}%`
      : 'hmm?';

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '600 15px ui-rounded, "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
  const w = ctx.measureText(text).width + 22;
  const h = 28;
  const x = Math.max(8, Math.min((minX + maxX) / 2 - w / 2, ctx.canvas.clientWidth - w - 8));
  const y = Math.max(8, minY - h - 14);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = res.accepted ? '#fff6ee' : '#ece4e8';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = res.accepted ? '#5b3b4a' : '#7d6f75';
  ctx.stroke();
  ctx.fillStyle = res.accepted ? '#5b3b4a' : '#6f6268';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 11, y + h / 2 + 1);
  ctx.restore();
}
