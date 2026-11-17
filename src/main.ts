import { CameraError, openCamera, openFakeCamera } from './camera/camera';
import { RenderStats, renderHud, snapshot } from './debug/hud';
import { mountTuningPanel } from './debug/tuning';
import { CameraPointerSource, MousePointerSource, type CursorState, type PointerSource } from './input/pointerSource';
import { INTENT_NONE, StrokeLog, downloadText } from './debug/strokeLog';
import { StrokeRecorder, pathLength, smoothStroke, type Stroke } from './input/strokes';
import { readStroke } from './recognizer/pipeline';
import { Recognizer, type Recognition } from './recognizer/recognizer';
import { SHAPES } from './recognizer/shapes';
import { loadTuning } from './settings';
import { drawRecognitionLabel } from './view/labels';
import type { Delegate } from './tracking/protocol';
import { TrackerClient, emptyTrackerStats } from './tracking/trackerClient';
import { makeCoverMap, type CoverMap } from './view/coverMap';
import { drawYarnBall } from './view/render';
import { YARN_DUD, YARN_PINK, drawYarn } from './view/yarnTrail';

// ---- tunables via URL: ?bench  ?delegate=cpu  ?trackw=640  ?hud=0  ?fake (synthetic camera)  ?mouse (skip camera)
const params = new URLSearchParams(location.search);
const BENCH = params.has('bench');
const DELEGATE: Delegate = params.get('delegate')?.toLowerCase() === 'cpu' ? 'CPU' : 'GPU';
const TRACK_W = Number(params.get('trackw') ?? 640) || 0;
const FAKE_CAMERA = params.has('fake');
const MOUSE_ONLY = params.has('mouse');

const video = document.querySelector<HTMLVideoElement>('#video')!;
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const hud = document.querySelector<HTMLPreElement>('#hud')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const statusBtn = statusEl.querySelector<HTMLButtonElement>('button')!;
const modeBtn = document.querySelector<HTMLButtonElement>('#mode')!;
const tuningEl = document.querySelector<HTMLDivElement>('#tuning')!;
const toastEl = document.querySelector<HTMLDivElement>('#toast')!;
const ctx = canvas.getContext('2d', { alpha: true })!;

hud.hidden = params.get('hud') === '0';
const tuning = loadTuning();
const tuningPanel = mountTuningPanel(tuningEl, tuning);

// ---- status card: non-blocking while loading, with a dismiss button for errors
// ---- toast: short confirmations that never block drawing
let toastTimer = 0;
function toast(text: string): void {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), 1800);
}

// ---- stroke log: number keys declare what you're about to draw, L saves the log as a file
const INTENT_KEYS = [...SHAPES.map((s) => s.id), INTENT_NONE];
function intentLabel(intent: string): string {
  return intent === INTENT_NONE ? 'not-a-shape' : (SHAPES.find((s) => s.id === intent)?.label ?? intent);
}
function saveStrokeLog(): void {
  if (strokeLog.entries.length === 0) {
    toast('Nothing to save yet: draw some strokes first');
    return;
  }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  downloadText(
    `pencil-whiskers-strokes-${stamp}.json`,
    strokeLog.toJSON({ savedAt: new Date().toISOString(), view: [viewW, viewH], tuning, stats: strokeLog.stats() }),
  );
  toast(`Saved ${strokeLog.entries.length} strokes to your Downloads folder`);
}

function showStatus(title: string, body: string, isError = false): void {
  statusEl.hidden = false;
  statusEl.classList.toggle('error', isError);
  statusEl.querySelector('h1')!.textContent = title;
  statusEl.querySelector('p')!.textContent = body;
  statusBtn.hidden = !isError;
}
const hideStatus = () => (statusEl.hidden = true);
statusBtn.addEventListener('click', hideStatus);

const MOUSE_NOTE = ' You can draw with the mouse meanwhile: hold the button and drag.';
function cameraErrorText(err: CameraError): [string, string] {
  switch (err.kind) {
    case 'denied':
      return ['Camera blocked', 'Mochi can’t see your hand because camera access was blocked. Allow the camera from the icon in the address bar, then reload.' + MOUSE_NOTE];
    case 'not-found':
      return ['No camera found', 'No webcam was detected. Plug one in (or enable the built-in one), then reload.' + MOUSE_NOTE];
    case 'in-use':
      return ['Camera busy', 'Another app seems to be using the webcam. Close it (video calls, camera app) and reload.' + MOUSE_NOTE];
    case 'unsupported':
      return ['Camera unavailable', 'This browser can’t open the camera here. Use Chrome or Edge on http://localhost or an https address.' + MOUSE_NOTE];
    default:
      return ['Camera problem', `The camera didn’t start: ${err.message}` + MOUSE_NOTE];
  }
}

// ---- canvas sizing (DPR aware) and the camera -> screen mapping
let viewW = 0;
let viewH = 0;
let coverMap: CoverMap = makeCoverMap({ width: 0, height: 0 }, { width: 0, height: 0 });

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  coverMap = makeCoverMap({ width: video.videoWidth, height: video.videoHeight }, { width: viewW, height: viewH });
}
window.addEventListener('resize', resize);
video.addEventListener('resize', resize); // fires when the stream's dimensions change
resize();

// ---- input: mouse is always available; camera joins once tracking is ready
const mouse = new MousePointerSource(canvas);
let camera: CameraPointerSource | null = null;
let active: PointerSource = mouse;
const recorder = new StrokeRecorder(tuning.recorder);
const recognizer = new Recognizer(SHAPES, tuning.recognizer);
let lastRecognition: Recognition | null = null;
const strokeLog = new StrokeLog();
// Warm up: the first recognition pays for JIT compilation (~15 ms measured). Pay it at boot,
// not on the player's first stroke.
recognizer.recognize(Array.from({ length: 24 }, (_, i) => ({ x: Math.cos(i / 4) * 100, y: Math.sin(i / 4) * 100 })));

function setMode(kind: 'camera' | 'mouse'): void {
  if (kind === 'camera' && !camera) return;
  const next = kind === 'camera' ? camera! : mouse;
  if (next === active) return;
  recorder.finish(performance.now(), 'switch'); // abandon a half-drawn stroke
  strokeLog.dropPending();
  active.reset();
  next.reset();
  active = next;
  displayCursor = null;
  document.body.dataset.mode = kind;
  modeBtn.textContent = kind === 'camera' ? 'Drawing with: hand (M)' : 'Drawing with: mouse (M)';
}
modeBtn.addEventListener('click', () => setMode(active.kind === 'camera' ? 'mouse' : 'camera'));
setMode('mouse');
document.body.dataset.mode = 'mouse';

// ---- strokes on screen
interface Shown {
  stroke: Stroke;
  kept: boolean;
  at: number;
  /** null for discarded taps. */
  res: Recognition | null;
}
const shown: Shown[] = [];
const KEEP_MS = 1100;
const DUD_MS = 350;
let strokesKept = 0;
let strokesDiscarded = 0;
let lastStrokeInfo = '-';

// Camera samples arrive at ~26 Hz; the screen refreshes at up to 144 Hz. The cursor eases
// toward the newest filtered sample so it glides instead of stepping. Strokes use the
// samples themselves, not this display-only easing.
let displayCursor: CursorState | null = null;
const EASE_MS = 22;

function updateDisplayCursor(target: CursorState | null, dt: number): void {
  if (!target) {
    displayCursor = null;
    return;
  }
  if (active.kind === 'mouse' || !displayCursor || Math.hypot(target.x - displayCursor.x, target.y - displayCursor.y) > 400) {
    displayCursor = { ...target };
    return;
  }
  const k = 1 - Math.exp(-dt / EASE_MS);
  displayCursor = {
    x: displayCursor.x + (target.x - displayCursor.x) * k,
    y: displayCursor.y + (target.y - displayCursor.y) * k,
    down: target.down,
    t: target.t,
  };
}

// ---- render loop: never waits on tracking
const renderStats = new RenderStats();
let tracker: TrackerClient | null = null;
let lastHud = 0;
let lastBench = 0;
let lastFrame = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const t0 = performance.now();
  const dt = lastFrame ? Math.min(100, now - lastFrame) : 16;
  lastFrame = now;

  // 1. input
  const inactive = active === mouse ? camera : mouse;
  inactive?.drain();
  for (const s of active.drain()) {
    strokeLog.sample(s);
    const ev = recorder.push(s);
    if (!ev) continue;
    const kept = ev.type === 'stroke';
    const read = kept ? readStroke(recognizer, ev.stroke, tuning.recorder.smoothPasses) : null;
    const res = read?.result ?? null;
    const stroke = read?.stroke ?? ev.stroke;
    strokeLog.commit(active.kind, ev.end, !kept, res);
    shown.push({ stroke, kept, at: now, res });
    if (res) {
      lastRecognition = res;
      if (BENCH) console.log('[shape]', JSON.stringify({ mode: active.kind, end: ev.end, accepted: res.accepted, top: res.top, runnerUp: res.runnerUp, ms: res.ms, points: stroke.points.length }));
    }
    if (kept) {
      strokesKept++;
      lastStrokeInfo = `${stroke.points.length} pts, ${Math.round(stroke.endT - stroke.startT)} ms, ${Math.round(pathLength(stroke.points))} px, ended: ${ev.end}`;
    } else {
      strokesDiscarded++;
    }
  }
  updateDisplayCursor(active.cursor(), dt);

  // 2. draw
  ctx.clearRect(0, 0, viewW, viewH);
  for (let i = shown.length - 1; i >= 0; i--) {
    const s = shown[i];
    const life = s.kept ? KEEP_MS : DUD_MS;
    const age = now - s.at;
    if (age > life) {
      shown.splice(i, 1);
      continue;
    }
    const f = age / life;
    const good = s.kept && !!s.res?.accepted;
    drawYarn(ctx, s.stroke.points, good ? YARN_PINK : YARN_DUD, { alpha: 1 - f * f, widthScale: 1 - 0.3 * f });
    if (s.res) drawRecognitionLabel(ctx, s.stroke.points, s.res, 1 - f * f * f);
  }
  const cur = recorder.current;
  if (cur) drawYarn(ctx, smoothStroke(cur.points, tuning.recorder.smoothPasses), YARN_PINK, { head: displayCursor?.down ? displayCursor : null });
  if (displayCursor) drawCursor(ctx, displayCursor, now);

  renderStats.frame(now, performance.now() - t0);

  if (now - lastHud > 250) {
    lastHud = now;
    tracker?.sampleRates(now);
    const snap = currentSnapshot(now);
    if (!hud.hidden) renderHud(hud, snap, hudLines());
    if (BENCH && now - lastBench > 5000) {
      lastBench = now;
      console.log('[bench]', JSON.stringify(snap));
    }
  }
}

function drawCursor(c: CanvasRenderingContext2D, p: CursorState, now: number): void {
  if (!p.down) {
    // Pen up: a soft dashed ring says "hovering, not drawing".
    c.save();
    c.beginPath();
    c.arc(p.x, p.y, 22, 0, Math.PI * 2);
    c.setLineDash([5, 6]);
    c.lineDashOffset = -now * 0.02;
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(91, 59, 74, 0.55)';
    c.stroke();
    c.restore();
  }
  drawYarnBall(c, p.x, p.y, p.down ? 11 : 14, now);
}

function hudLines(): string[] {
  const lines: string[] = [];
  if (camera && active === camera) {
    const d = camera.debug;
    const ratio = Number.isFinite(d.ratio) ? d.ratio.toFixed(2) : '-';
    lines.push(
      `pen      ${d.down ? (d.releasing ? 'DOWN (lifting)' : 'DOWN') : 'up  '}   pinch ${ratio}  (down < ${tuning.pen.press.toFixed(2)}, up > ${tuning.pen.release.toFixed(2)})${d.hand ? '' : '  no hand'}`,
    );
  } else {
    lines.push(`pen      ${displayCursor?.down ? 'DOWN' : 'up  '}   mouse${camera ? '' : ' (camera off)'}`);
  }
  lines.push(`strokes  ${strokesKept} kept, ${strokesDiscarded} taps ignored   last: ${lastStrokeInfo}`);
  const r = lastRecognition;
  const pct = (n: number) => n.toFixed(2);
  lines.push(
    !r || !r.top
      ? 'shape    -'
      : r.accepted
        ? `shape    ${r.top.label} ${pct(r.top.score)}   next: ${r.runnerUp ? `${r.runnerUp.label} ${pct(r.runnerUp.score)}` : '-'}   ${r.ms.toFixed(2)} ms`
        : `shape    rejected: best ${r.top.label} ${pct(r.top.score)} < ${pct(tuning.recognizer.minScore)}   ${r.ms.toFixed(2)} ms`,
  );
  lines.push(`filter   minCutoff ${tuning.filter.minCutoff}  beta ${tuning.filter.beta}  dCutoff ${tuning.filter.dCutoff}`);
  const stats = strokeLog
    .stats()
    .map((s) => `${intentLabel(s.intent)} ${s.ok}/${s.n}${s.taps ? ` (+${s.taps} taps)` : ''}`)
    .join('   ');
  lines.push(`tagging  ${strokeLog.intent ? intentLabel(strokeLog.intent) : 'off'}   ${stats}`);
  lines.push(`[D] hud  [M] camera/mouse  [T] tuning  [1-${INTENT_KEYS.length}] tag  [0] untag  [L] save log`);
  return lines;
}

const EMPTY_TRACKER = emptyTrackerStats();
function currentSnapshot(now: number) {
  return snapshot(now, renderStats, tracker?.stats ?? EMPTY_TRACKER, video.videoWidth ? `${video.videoWidth}x${video.videoHeight}` : '-');
}

requestAnimationFrame(frame);

if (BENCH) {
  // Lets automated benches read numbers even when rAF is throttled (hidden tab).
  (window as unknown as { __pw: unknown }).__pw = {
    snapshot: () => {
      const now = performance.now();
      tracker?.sampleRates(now);
      return currentSnapshot(now);
    },
  };
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  if (k === 'd') hud.hidden = !hud.hidden;
  else if (k === 'm') setMode(active.kind === 'camera' ? 'mouse' : 'camera');
  else if (k === 't') tuningPanel.toggle();
  else if (k === 'l') saveStrokeLog();
  else if (/^[0-9]$/.test(k)) {
    const n = Number(k);
    if (n === 0) {
      strokeLog.setIntent(null, e.timeStamp);
      toast('Tagging off');
    } else if (n <= INTENT_KEYS.length) {
      strokeLog.setIntent(INTENT_KEYS[n - 1], e.timeStamp);
      toast(`Tagging next strokes as: ${intentLabel(INTENT_KEYS[n - 1])}`);
    }
  }
});

// ---- boot
async function boot(): Promise<void> {
  if (MOUSE_ONLY) {
    showStatus('Mouse mode', 'Hold the mouse button and drag to draw.', true);
    return;
  }
  showStatus('Pencil Whiskers', 'Asking for the camera… Your video stays on this computer.');
  try {
    await (FAKE_CAMERA ? openFakeCamera(video) : openCamera(video));
  } catch (err) {
    const e = err instanceof CameraError ? err : new CameraError('other', String(err));
    const [title, body] = cameraErrorText(e);
    showStatus(title, body, true);
    return;
  }
  resize();

  showStatus('Pencil Whiskers', 'Waking up the hand tracker…');
  tracker = new TrackerClient(video, {
    wasmBase: new URL('mediapipe/wasm', document.baseURI).href,
    modelUrl: new URL('models/hand_landmarker.task', document.baseURI).href,
    delegate: DELEGATE,
    inputWidth: TRACK_W,
    loadTimeoutMs: 15000,
  });
  try {
    await tracker.start();
  } catch (err) {
    tracker.stop();
    tracker = null;
    showStatus('Hand tracker didn’t load', `${err instanceof Error ? err.message : String(err)} Check your connection for the first load, then reload.` + MOUSE_NOTE, true);
    return;
  }
  camera = new CameraPointerSource(
    tracker,
    () => coverMap,
    () => ({ width: video.videoWidth, height: video.videoHeight }),
    tuning.filter,
    tuning.pen,
  );
  setMode('camera');
  hideStatus();
  if (BENCH) console.log('[bench] tracker ready', JSON.stringify({ delegate: tracker.stats.delegate, loadMs: Math.round(tracker.stats.loadMs) }));
}

void boot();
