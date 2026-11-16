import { DEFAULT_ONE_EURO, type OneEuroParams } from './input/oneEuro';
import { DEFAULT_PEN, type PenParams } from './input/pinch';
import { DEFAULT_RECORDER, type RecorderParams } from './input/strokes';
import { DEFAULT_RECOGNIZER, type RecognizerParams } from './recognizer/recognizer';

/**
 * Live-tunable input parameters. Objects are mutated in place by the tuning panel and are
 * held by reference by the filter / pen / recorder, so changes apply on the next sample.
 */
export interface Tuning {
  filter: OneEuroParams;
  pen: PenParams;
  recorder: RecorderParams;
  recognizer: RecognizerParams;
}

const GROUPS = ['filter', 'pen', 'recorder', 'recognizer'] as const;

const KEY = 'pencil-whiskers.tuning.v1';

export function defaultTuning(): Tuning {
  return {
    filter: { ...DEFAULT_ONE_EURO },
    pen: { ...DEFAULT_PEN },
    recorder: { ...DEFAULT_RECORDER },
    recognizer: { ...DEFAULT_RECOGNIZER },
  };
}

export function loadTuning(): Tuning {
  const t = defaultTuning();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return t;
    const saved = JSON.parse(raw) as Partial<Tuning>;
    for (const group of GROUPS) {
      const target = t[group] as unknown as Record<string, number>;
      const src = (saved[group] ?? {}) as Record<string, unknown>;
      for (const k of Object.keys(target)) {
        if (typeof src[k] === 'number' && Number.isFinite(src[k])) target[k] = src[k] as number;
      }
    }
  } catch {
    // storage blocked or corrupt: defaults are fine
  }
  return t;
}

export function saveTuning(t: Tuning): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // ignore: tuning just won't persist
  }
}

/** Restores defaults in place (keeps the object identities the filters hold). */
export function resetTuning(t: Tuning): void {
  const d = defaultTuning();
  for (const g of GROUPS) Object.assign(t[g], d[g]);
}
