// Placeholder yarn-ball cursor. Full art arrives in Milestone 4.

const YARN = '#f6a5c0';
const YARN_DARK = '#c9628a';
const OUTLINE = '#5b3b4a';

export function drawYarnBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.0015);

  // loose tail
  ctx.beginPath();
  ctx.moveTo(r * 0.7, r * 0.7);
  ctx.bezierCurveTo(r * 1.6, r * 1.2, r * 1.2, r * 2.0, r * 2.0, r * 2.3);
  ctx.strokeStyle = YARN_DARK;
  ctx.lineWidth = r * 0.22;
  ctx.lineCap = 'round';
  ctx.stroke();

  // ball
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = YARN;
  ctx.fill();

  // wrap lines, clipped to the ball
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = YARN_DARK;
  ctx.lineWidth = r * 0.12;
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.ellipse(k * r * 0.35, 0, r * 0.35, r * 1.1, 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(2, r * 0.18);
  ctx.stroke();
  ctx.restore();
}
