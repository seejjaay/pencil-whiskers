/** Shared palette and path helpers for the flat, thick-outlined pastel style. */
export const INK = '#5b3b4a';
export const CREAM = '#fff6ee';
export const PINK = '#f39bbb';
export const PINK_DARK = '#d36f98';
export const BLUSH = 'rgba(243, 155, 187, 0.55)';
export const FONT = 'ui-rounded, "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';

export function outlined(ctx: CanvasRenderingContext2D, fill: string, width = 4): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export function line(ctx: CanvasRenderingContext2D, width: number, color = INK): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export function roundRect(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, r);
}

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

export function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

export function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  ctx.closePath();
}

export function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0, points = 5, inner = 0.48): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 ? r * inner : r;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** Deterministic per-id phase so each threat blinks and bobs on its own rhythm. */
export function phase(id: number): number {
  return ((id * 2654435761) % 1000) / 1000;
}
