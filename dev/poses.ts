// Dev-only: every cat mood at several animation moments, to spot parts overlapping.
// Open http://localhost:5173/dev/poses.html while `npm run dev` runs. Not part of the build.
import { drawCat, type Mood } from '../src/view/art/cat';

const only = new URLSearchParams(location.search).get('mood') as Mood | null;
const moods: Mood[] = only ? [only] : ['sleep', 'pounce', 'happy', 'startled'];
const S = only ? 2 : 1;
const moments = [0, 0.25, 0.5, 0.75, 1];
const W = 300;
const H = 230;
const canvas = document.querySelector<HTMLCanvasElement>('#sheet')!;
canvas.width = W * moments.length * S;
canvas.height = H * moods.length * S;
const ctx = canvas.getContext('2d')!;
ctx.scale(S, S);
moods.forEach((mood, r) => {
  moments.forEach((t, c) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(91,59,74,0.15)';
    ctx.strokeRect(c * W, r * H, W, H);
    ctx.fillStyle = '#5b3b4a';
    ctx.fillText(`${mood} t=${t}`, c * W + 8, r * H + 16);
    // sleep: walk through the peek/twitch cycles instead of t
    const now = mood === 'sleep' ? 6020 + t * 1000 + 3300 * c : 1000;
    drawCat(ctx, { x: c * W + W / 2, y: r * H + H - 70, mood, t, now, lean: 0.6 });
    ctx.restore();
  });
});
