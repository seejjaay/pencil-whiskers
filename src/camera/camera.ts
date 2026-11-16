export type CameraErrorKind = 'unsupported' | 'denied' | 'not-found' | 'in-use' | 'other';

export class CameraError extends Error {
  constructor(
    readonly kind: CameraErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'CameraError';
  }
}

export interface CameraInfo {
  stream: MediaStream;
  width: number;
  height: number;
  /** What the camera actually agreed to, for the HUD. */
  frameRate: number | undefined;
}

function classify(err: unknown): CameraError {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : String(err);
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraError('denied', msg);
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new CameraError('not-found', msg);
    case 'NotReadableError':
    case 'AbortError':
      return new CameraError('in-use', msg);
    default:
      return new CameraError('other', msg);
  }
}

/**
 * Bench-only stand-in for a webcam: a 1280x720 @30 fps canvas stream with moving pastel
 * blobs (no hand, so the tracker runs palm detection on every frame — its slowest path).
 * Used via `?fake` to measure the pipeline where no camera is available.
 */
export async function openFakeCamera(video: HTMLVideoElement): Promise<CameraInfo> {
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 720;
  const g = c.getContext('2d')!;
  const paint = () => {
    const t = performance.now() / 1000;
    g.fillStyle = '#c9b8a8';
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `hsl(${(i * 60 + t * 20) % 360} 60% 70%)`;
      g.beginPath();
      g.arc(640 + Math.cos(t + i) * 420, 360 + Math.sin(t * 1.3 + i) * 240, 80, 0, Math.PI * 2);
      g.fill();
    }
  };
  paint();
  setInterval(paint, 1000 / 30);
  const stream = c.captureStream(30);
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  return { stream, width: c.width, height: c.height, frameRate: 30 };
}

/** Opens the front camera into `video` and resolves once frames are flowing. */
export async function openCamera(video: HTMLVideoElement): Promise<CameraInfo> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', 'Camera API unavailable (needs https or localhost).');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    });
  } catch (err) {
    throw classify(err);
  }

  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise<void>((resolve) => video.addEventListener('loadedmetadata', () => resolve(), { once: true }));
  }
  try {
    await video.play();
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw classify(err);
  }
  const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
  return {
    stream,
    width: video.videoWidth,
    height: video.videoHeight,
    frameRate: settings.frameRate,
  };
}
