import { DEFAULT_ONE_EURO, type OneEuroParams } from './input/oneEuro';
import { DEFAULT_PEN, type PenParams } from './input/pinch';
import { DEFAULT_RECORDER, type RecorderParams } from './input/strokes';
import { DEFAULT_RECOGNIZER, type RecognizerParams } from './recognizer/recognizer';

/**
 * Live-tunable input parameters. Objects are mutated in place by the tuning panel and are
 * held by reference by the filter / pen / recorder / recognizer, so changes apply at once.
 */
export interface Tuning {
  filter: OneEuroParams;
  pen: PenParams;
  recorder: RecorderParams;
  recognizer: RecognizerParams;
}

const GROUPS = ['filter', 'pen', 'recorder', 'recognizer'] as const;

// v2 stores only values that differ from the defaults, so improved defaults still reach a
// browser that has touched a slider. (v1 stored everything, freezing old defaults forever.)
const KEY = 'pencil-whiskers.tuning.v2';
const OLD_KEYS = ['pencil-whiskers.tuning.v1'];

export type SavedTuning = Partial<Record<(typeof GROUPS)[number], Record<string, number>>>;

export function defaultTuning(): Tuning {
  return {
    filter: { ...DEFAULT_ONE_EURO },
    pen: { ...DEFAULT_PEN },
    recorder: { ...DEFAULT_RECORDER },
    recognizer: { ...DEFAULT_RECOGNIZER },
  };
}

/** Only the values the player changed. */
export function changedValues(t: Tuning): SavedTuning {
  const d = defaultTuning();
  const out: SavedTuning = {};
  for (const g of GROUPS) {
    const cur = t[g] as unknown as Record<string, number>;
    const def = d[g] as unknown as Record<string, number>;
    for (const k of Object.keys(def)) {
      if (cur[k] !== def[k]) (out[g] ??= {})[k] = cur[k];
    }
  }
  return out;
}

/** Merges saved values onto `t`, ignoring unknown keys and non-numbers. */
export function applySaved(t: Tuning, saved: unknown): void {
  if (!saved || typeof saved !== 'object') return;
  const src = saved as Record<string, unknown>;
  for (const g of GROUPS) {
    const target = t[g] as unknown as Record<string, number>;
    const group = src[g];
    if (!group || typeof group !== 'object') continue;
    for (const k of Object.keys(target)) {
      const v = (group as Record<string, unknown>)[k];
      if (typeof v === 'number' && Number.isFinite(v)) target[k] = v;
    }
  }
}

export function loadTuning(): Tuning {
  const t = defaultTuning();
  try {
    for (const k of OLD_KEYS) localStorage.removeItem(k);
    const raw = localStorage.getItem(KEY);
    if (raw) applySaved(t, JSON.parse(raw));
  } catch {
    // storage blocked or corrupt: defaults are fine
  }
  return t;
}

export function saveTuning(t: Tuning): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(changedValues(t)));
  } catch {
    // ignore: tuning just won't persist
  }
}

/** Restores defaults in place (keeps the object identities the filters hold). */
export function resetTuning(t: Tuning): void {
  const d = defaultTuning();
  for (const g of GROUPS) Object.assign(t[g], d[g]);
}
