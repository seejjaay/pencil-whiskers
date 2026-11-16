export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export type CoverMap = (nx: number, ny: number) => Point;

/**
 * Maps normalized camera coordinates (0..1, as MediaPipe reports them, NOT mirrored)
 * to CSS pixels of an element showing that video with `object-fit: cover`, optionally
 * mirrored with `transform: scaleX(-1)`.
 *
 * This is the single place where "camera space" becomes "what the player sees".
 * Everything downstream (stroke recording, recognition) works in the returned space,
 * so direction-sensitive shapes match what is on screen.
 *
 * Mirroring the normalized x before the cover transform is equivalent to flipping the
 * element about its centre, because the cover crop is centred.
 */
export function makeCoverMap(video: Size, view: Size, mirror = true): CoverMap {
  if (video.width <= 0 || video.height <= 0 || view.width <= 0 || view.height <= 0) {
    return () => ({ x: NaN, y: NaN });
  }
  const scale = Math.max(view.width / video.width, view.height / video.height);
  const drawnW = video.width * scale;
  const drawnH = video.height * scale;
  const offsetX = (view.width - drawnW) / 2;
  const offsetY = (view.height - drawnH) / 2;
  return (nx, ny) => ({
    x: offsetX + (mirror ? 1 - nx : nx) * drawnW,
    y: offsetY + ny * drawnH,
  });
}
