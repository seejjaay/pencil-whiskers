import { CameraError, openCamera, openFakeCamera } from './camera/camera';
import { RenderStats, renderHud, snapshot } from './debug/hud';
import { CameraPointerSource, type PointerSource } from './input/pointerSource';
import type { Delegate } from './tracking/protocol';
import { TrackerClient, emptyTrackerStats } from './tracking/trackerClient';
import { makeCoverMap, type CoverMap } from './view/coverMap';
import { drawYarnBall } from './view/render';

// ---- tunables via URL: ?bench  ?delegate=cpu  ?trackw=640  ?hud=0  ?fake (synthetic camera)
const params = new URLSearchParams(location.search);
const BENCH = params.has('bench');
const DELEGATE: Delegate = params.get('delegate')?.toLowerCase() === 'cpu' ? 'CPU' : 'GPU';
const TRACK_W = Number(params.get('trackw') ?? 640) || 0;
const FAKE_CAMERA = params.has('fake');

const video = document.querySelector<HTMLVideoElement>('#video')!;
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const hud = document.querySelector<HTMLPreElement>('#hud')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const ctx = canvas.getContext('2d', { alpha: true })!;

hud.hidden = params.get('hud') === '0';

function showStatus(title: string, body: string, isError = false): void {
  statusEl.hidden = false;
  statusEl.classList.toggle('error', isError);
  statusEl.querySelector('h1')!.textContent = title;
  statusEl.querySelector('p')!.textContent = body;
}
const hideStatus = () => (statusEl.hidden = true);

const MOUSE_NOTE = ' Mouse mode is coming in the next milestone.';
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

// ---- render loop: runs from the start, never waits on tracking
const renderStats = new RenderStats();
let pointer: PointerSource | null = null;
let tracker: TrackerClient | null = null;
let lastHud = 0;
let lastBench = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const t0 = performance.now();

  ctx.clearRect(0, 0, viewW, viewH);
  const p = pointer?.latest() ?? null;
  if (p) drawYarnBall(ctx, p.x, p.y, 14, now);

  renderStats.frame(now, performance.now() - t0);

  if (now - lastHud > 250) {
    lastHud = now;
    tracker?.sampleRates(now);
    const snap = currentSnapshot(now);
    if (!hud.hidden) renderHud(hud, snap, p ? `${Math.round(p.x)}, ${Math.round(p.y)}` : 'no hand');
    if (BENCH && now - lastBench > 5000) {
      lastBench = now;
      console.log('[bench]', JSON.stringify(snap));
    }
  }
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
  if (e.key === 'd' || e.key === 'D') hud.hidden = !hud.hidden;
});

// ---- boot
async function boot(): Promise<void> {
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
    showStatus('Hand tracker didn’t load', `${err instanceof Error ? err.message : String(err)} Check your connection for the first load, then reload.` + MOUSE_NOTE, true);
    return;
  }
  pointer = new CameraPointerSource(tracker, () => coverMap);
  hideStatus();
  if (BENCH) console.log('[bench] tracker ready', JSON.stringify({ delegate: tracker.stats.delegate, loadMs: Math.round(tracker.stats.loadMs) }));
}

void boot();
