// Copies MediaPipe's wasm runtime from node_modules into public/ so it is served
// locally (no CDN). Runs before dev and build. No dependencies.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dest = join(root, 'public', 'mediapipe', 'wasm');

if (!existsSync(src)) {
  console.error(`[assets] missing ${src} - run npm install first`);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
let copied = 0;
for (const name of readdirSync(src)) {
  const from = join(src, name);
  const to = join(dest, name);
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  cpSync(from, to);
  copied++;
}
const model = join(root, 'public', 'models', 'hand_landmarker.task');
if (!existsSync(model)) {
  console.warn(
    '[assets] public/models/hand_landmarker.task is missing. Download it from\n' +
      '  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  );
}
console.log(`[assets] mediapipe wasm ready (${copied} file(s) copied)`);
