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
import { Game } from './game/game';
import { GameView, fieldGeom } from './view/gameView';
import { mountPanel } from './ui/panel';
import { CAT_NAME } from './cat';
import { mountSettings } from './ui/settingsPanel';
import { mountCalibration } from './ui/calibration';
import { applyPersonal, countSamples, loadPersonal, savePersonal } from './recognizer/personal';
import { loadPrefs } from './prefs';
import { Sfx, playEventSounds } from './audio/sfx';
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
const panelEl = document.querySelector<HTMLDivElement>('#panel')!;
const settingsEl = document.querySelector<HTMLDivElement>('#settings')!;
const settingsBtn = document.querySelector<HTMLButtonElement>('#settings-btn')!;
const calibEl = document.querySelector<HTMLDivElement>('#calib')!;

// ---- player prefs (sound, shake, tint) and sound effects
const prefs = loadPrefs();
const sfx = new Sfx();
function applyPrefsNow(): void {
  sfx.enabled = prefs.sound;
  document.documentElement.style.setProperty('--tint', String(prefs.tint));
}
applyPrefsNow();
// Browsers keep audio locked until the first click or key press on the page.
window.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
window.addEventListener('keydown', () => sfx.unlock(), { capture: true });
const ctx = canvas.getContext('2d', { alpha: true })!;

// The debug HUD covers part of the playfield, so it starts hidden unless asked for (D toggles).
hud.hidden = !(params.has('debug') || BENCH || params.get('hud') === '1');
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
statusBtn.addEventListener('click', () => {
  hideStatus();
  if (game.phase === 'title') showTitle();
});

const MOUSE_NOTE = ' You can draw with the mouse meanwhile: hold the button and drag.';
function cameraErrorText(err: CameraError): [string, string] {
  switch (err.kind) {
    case 'denied':
      return ['Camera blocked', `${CAT_NAME} can’t see your hand because camera access was blocked. Allow the camera from the icon in the address bar, then reload.` + MOUSE_NOTE];
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
const savedPersonal = loadPersonal();
applyPersonal(recognizer, savedPersonal);
let personalCount = countSamples(savedPersonal);
/** Standard templates only: judges calibration samples without being biased by old ones. */
const standardRecognizer = new Recognizer(SHAPES, tuning.recognizer);
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
  /** Drawn pink: recognised, and in play it actually hit a threat. Otherwise grey. */
  good: boolean;
}
const shown: Shown[] = [];

// ---- the game
const FIXED_SEED = params.get('seed');
/** Debug / practice: ?wave=5 starts at wave 5 (the first boss). */
const FIRST_WAVE = Math.max(1, Number(params.get('wave')) || 1);
const newSeed = (): number => (FIXED_SEED !== null ? Number(FIXED_SEED) >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0]);
const game = new Game(newSeed());
const gameView = new GameView(prefs);

// ---- settings and calibration
const settings = mountSettings(settingsEl, prefs, {
  onChange: applyPrefsNow,
  onCalibrate: openCalibration,
  onClose: () => settingsBtn.focus({ preventScroll: true }),
});
const calibration = mountCalibration(calibEl, standardRecognizer, {
  onSave: (set) => {
    savePersonal(set);
    applyPersonal(recognizer, set);
    personalCount = countSamples(set);
  },
  onClose: restoreCardAfterOverlay,
  onSample: (ok) => (ok ? sfx.plink(4) : sfx.bonk()),
});

function openSettings(): void {
  if (game.phase === 'playing' || game.phase === 'intro') setPaused(true);
  settings.open();
}

function openCalibration(): void {
  settings.close();
  if (game.phase === 'playing' || game.phase === 'intro') setPaused(true);
  panel.hide();
  calibration.open(loadPersonal());
}

/** After calibration, bring back whichever card belongs on screen. */
function restoreCardAfterOverlay(): void {
  if (game.phase === 'title') showTitle();
  else if (game.phase === 'gameover') panel.showGameOver({ score: game.score, wave: game.wave, bestCombo: game.bestCombo });
  else if (paused) panel.showPaused();
}

settingsBtn.addEventListener('click', openSettings);
let paused = false;
let gameOverAt = 0;
let panelShownAt = 0;
const panel = mountPanel(panelEl, () => (paused ? setPaused(false) : startGame(performance.now())));

function startGame(now: number): void {
  paused = false;
  shown.length = 0;
  gameView.reset();
  game.maxHearts = prefs.hearts;
  gameView.handle(game.start(newSeed(), FIRST_WAVE), now, fieldGeom(viewW, viewH));
  panel.hide();
}

function showTitle(): void {
  panel.showTitle();
  panelShownAt = performance.now();
}

/** A circle drawn right as the card appears (e.g. the stroke that ended the game) shouldn't restart. */
function canStartByDrawing(now: number): boolean {
  return panel.visible && now - panelShownAt > 600;
}

function setPaused(p: boolean): void {
  if (game.phase !== 'playing' && game.phase !== 'intro') return;
  paused = p;
  if (p) panel.showPaused();
  else panel.hide();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
});
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

  // 1. game time (never while paused or on the title / game-over screens)
  const gameEvents = paused ? [] : game.step(dt);

  // 2. input
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
    let good = kept && !!res?.accepted;
    if (calibration.active) {
      // Calibrating: every finished stroke is a calibration sample, never a game move.
      if (kept) calibration.offer(ev.stroke.points);
      good = kept;
    } else if (res?.accepted && res.top) {
      if ((game.phase === 'title' || game.phase === 'gameover') && res.top.id === 'circle' && canStartByDrawing(now)) {
        startGame(now);
      } else if (game.phase === 'playing' && !paused) {
        const evs = game.submit(res.top.id);
        good = evs.some((e) => e.type === 'hit' || e.type === 'defeat' || e.type.startsWith('powerC') || e.type === 'powerFull' || e.type === 'powerUse');
        gameEvents.push(...evs);
      }
    } else if (kept && game.phase === 'playing' && !paused) {
      const end = stroke.points[stroke.points.length - 1];
      gameView.rejected(end.x, end.y, now);
    }
    shown.push({ stroke, kept, at: now, res, good });
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
  const geom = fieldGeom(viewW, viewH);
  gameView.handle(gameEvents, now, geom);
  playEventSounds(sfx, gameEvents, game.combo);
  const over = gameEvents.find((e) => e.type === 'gameOver');
  if (over) gameOverAt = now;
  if (game.phase === 'gameover' && !panel.visible && now - gameOverAt > 1100) {
    panel.showGameOver({ score: game.score, wave: game.wave, bestCombo: game.bestCombo });
    panelShownAt = now;
  }

  // 3. draw: game underneath, then strokes and the cursor on top
  ctx.clearRect(0, 0, viewW, viewH);
  gameView.draw(ctx, game, now, geom);
  for (let i = shown.length - 1; i >= 0; i--) {
    const s = shown[i];
    const life = s.kept ? KEEP_MS : DUD_MS;
    const age = now - s.at;
    if (age > life) {
      shown.splice(i, 1);
      continue;
    }
    const f = age / life;
    drawYarn(ctx, s.stroke.points, s.good ? YARN_PINK : YARN_DUD, { alpha: 1 - f * f, widthScale: 1 - 0.3 * f });
    // Recognition labels are a debugging aid; in play the game's own reactions say what happened.
    if (s.res && !hud.hidden) drawRecognitionLabel(ctx, s.stroke.points, s.res, 1 - f * f * f);
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
  lines.push(
    `game     ${game.phase} wave ${game.wave}  spawned ${game.spawned}/${game.spec.threatCount}  on screen ${game.threats.length}  hearts ${game.hearts}  combo ${game.combo} x${game.multiplier}  seed ${game.seed}`,
  );
  lines.push(`[D] hud  [M] camera/mouse  [T] tuning  [P] pause  [ ] tag shape  [0] untag  [L] save log  · personal templates ${personalCount}`);
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
    /** Read-only peek at the game for automated checks. */
    game: () => ({ phase: game.phase, wave: game.wave, hearts: game.hearts, score: game.score, combo: game.combo, threats: game.threats.map((t) => ({ ...t })) }),
  };
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (settings.visible || calibration.active) return; // dialogs handle their own keys
  const k = e.key.toLowerCase();
  if (k === 'd') hud.hidden = !hud.hidden;
  else if (k === 'm') setMode(active.kind === 'camera' ? 'mouse' : 'camera');
  else if (k === 't') tuningPanel.toggle();
  else if (k === 'l') saveStrokeLog();
  else if (k === 'p' || k === 'escape') setPaused(!paused);
  else if (k === '0') {
    strokeLog.setIntent(null, e.timeStamp);
    toast('Tagging off');
  } else if (k === ']' || k === '[') {
    // 12 shapes + "not a shape" no longer fit on the number keys: cycle through them.
    const i = strokeLog.intent ? INTENT_KEYS.indexOf(strokeLog.intent) : -1;
    const next = INTENT_KEYS[(i + (k === ']' ? 1 : INTENT_KEYS.length - 1) + INTENT_KEYS.length) % INTENT_KEYS.length];
    strokeLog.setIntent(next, e.timeStamp);
    toast(`Tagging next strokes as: ${intentLabel(next)}`);
  }
});

// ---- boot
async function boot(): Promise<void> {
  if (MOUSE_ONLY) {
    hideStatus();
    showTitle();
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
  showTitle();
  if (BENCH) console.log('[bench] tracker ready', JSON.stringify({ delegate: tracker.stats.delegate, loadMs: Math.round(tracker.stats.loadMs) }));
}

void boot();

// Offline play after the first visit (production builds only; dev never caches).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('[offline] service worker not registered:', err));
  });
}
