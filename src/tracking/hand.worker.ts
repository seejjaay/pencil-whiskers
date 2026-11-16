// Hand tracking worker. Receives camera frames as transferred ImageBitmaps, runs
// MediaPipe HandLandmarker, posts back landmarks. The main thread never waits on this.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { Delegate, FromWorker, ToWorker } from './protocol';
import { LANDMARK_COUNT } from './protocol';

interface WorkerScope {
  postMessage(msg: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
}
const scope = self as unknown as WorkerScope;

let landmarker: HandLandmarker | null = null;
let lastTimestamp = -1;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  scope.postMessage(msg, transfer);
}

async function create(wasmBase: string, modelUrl: string, delegate: Delegate): Promise<HandLandmarker> {
  // `true` = load the ES-module build of the wasm loader, required inside a module worker.
  const fileset = await FilesetResolver.forVisionTasks(wasmBase, true);
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelUrl, delegate },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

async function init(msg: Extract<ToWorker, { type: 'init' }>): Promise<void> {
  const t0 = performance.now();
  let delegate = msg.delegate;
  let fellBack = false;
  try {
    try {
      landmarker = await create(msg.wasmBase, msg.modelUrl, delegate);
    } catch (err) {
      if (delegate !== 'GPU') throw err;
      console.warn('[tracker] GPU delegate failed, falling back to CPU:', err);
      delegate = 'CPU';
      fellBack = true;
      landmarker = await create(msg.wasmBase, msg.modelUrl, delegate);
    }
    post({ type: 'ready', delegate, loadMs: performance.now() - t0, fellBack });
  } catch (err) {
    post({ type: 'error', stage: 'init', message: String(err instanceof Error ? err.message : err) });
  }
}

function onFrame(msg: Extract<ToWorker, { type: 'frame' }>): void {
  const { bitmap, frameId } = msg;
  if (!landmarker) {
    bitmap.close();
    return;
  }
  // MediaPipe requires strictly increasing timestamps in VIDEO mode.
  const ts = Math.max(lastTimestamp + 1, Math.round(msg.timestampMs));
  lastTimestamp = ts;
  const t0 = performance.now();
  try {
    const res = landmarker.detectForVideo(bitmap, ts);
    const inferMs = performance.now() - t0;
    const pts = res.landmarks[0];
    if (!pts || pts.length < LANDMARK_COUNT) {
      post({ type: 'result', frameId, inferMs, hand: null });
      return;
    }
    const flat = new Float32Array(LANDMARK_COUNT * 3);
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      flat[i * 3] = pts[i].x;
      flat[i * 3 + 1] = pts[i].y;
      flat[i * 3 + 2] = pts[i].z;
    }
    const score = res.handedness[0]?.[0]?.score ?? 0;
    post({ type: 'result', frameId, inferMs, hand: { landmarks: flat, score } }, [flat.buffer]);
  } catch (err) {
    post({ type: 'error', stage: 'frame', message: String(err instanceof Error ? err.message : err) });
    post({ type: 'result', frameId, inferMs: performance.now() - t0, hand: null });
  } finally {
    bitmap.close();
  }
}

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'init') void init(msg);
  else if (msg.type === 'frame') onFrame(msg);
};
