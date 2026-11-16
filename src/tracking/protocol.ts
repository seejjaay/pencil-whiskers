export type Delegate = 'GPU' | 'CPU';

/** Messages main -> worker. */
export type ToWorker =
  | { type: 'init'; wasmBase: string; modelUrl: string; delegate: Delegate }
  | { type: 'frame'; frameId: number; timestampMs: number; bitmap: ImageBitmap };

/** 21 landmarks x (x, y, z), normalized to the (unmirrored) camera image. */
export const LANDMARK_COUNT = 21;
export const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
} as const;

export interface HandFrame {
  /** Flat [x0, y0, z0, x1, y1, z1, ...], length 63. */
  landmarks: Float32Array;
  /** Hand presence/handedness score from the model. */
  score: number;
}

/** Messages worker -> main. */
export type FromWorker =
  | { type: 'ready'; delegate: Delegate; loadMs: number; fellBack: boolean }
  | { type: 'result'; frameId: number; inferMs: number; hand: HandFrame | null }
  | { type: 'error'; stage: 'init' | 'frame'; message: string };
