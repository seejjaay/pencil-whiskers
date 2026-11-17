// Copies MediaPipe's wasm runtime from node_modules into public/ so it is served locally
// (no CDN, works offline). Runs before dev and build. No dependencies.
//
// Only the ES-module build is shipped: the tracking worker is a module worker and loads it via
// FilesetResolver.forVisionTasks(base, /* useModule */ true). The classic build would add
// ~15 MB to every deploy for nothing.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dest = join(root, 'public', 'mediapipe', 'wasm');
const wanted = (name) => name.startsWith('vision_wasm_module_internal.');

if (!existsSync(src)) {
  console.error(`[assets] missing ${src} - run npm install first`);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });

// Remove anything we no longer ship (e.g. the classic build from older checkouts).
for (const name of readdirSync(dest)) {
  if (!wanted(name)) rmSync(join(dest, name), { force: true });
}

let copied = 0;
for (const name of readdirSync(src).filter(wanted)) {
  const from = join(src, name);
  const to = join(dest, name);
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  cpSync(from, to);
  copied++;
}
if (copied === 0 && readdirSync(dest).filter(wanted).length === 0) {
  console.error('[assets] no module wasm build found in @mediapipe/tasks-vision');
  process.exit(1);
}

const model = join(root, 'public', 'models', 'hand_landmarker.task');
if (!existsSync(model)) {
  console.warn(
    '[assets] public/models/hand_landmarker.task is missing. Download it from\n' +
      '  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  );
}
console.log(`[assets] mediapipe wasm ready (${copied} file(s) copied)`);
