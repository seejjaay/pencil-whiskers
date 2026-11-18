/** Player-facing settings (the tuning panel is for input internals; this is for everyone). */
export interface Prefs {
  sound: boolean;
  shake: boolean;
  /** Pastel tint over the camera image, 0 (none) .. 0.6 (strong). */
  tint: number;
  /** Lives (nap hearts) per run, a whole number from MIN_HEARTS to MAX_HEARTS. */
  hearts: number;
}

export const MIN_HEARTS = 1;
export const MAX_HEARTS = 5;

export const DEFAULT_PREFS: Readonly<Prefs> = { sound: true, shake: true, tint: 0.28, hearts: 1 };

const KEY = 'pencil-whiskers.prefs.v1';

/** Only the values that differ from the defaults, so improved defaults still reach players. */
export function changedPrefs(p: Prefs): Partial<Prefs> {
  const out: Partial<Prefs> = {};
  if (p.sound !== DEFAULT_PREFS.sound) out.sound = p.sound;
  if (p.shake !== DEFAULT_PREFS.shake) out.shake = p.shake;
  if (p.tint !== DEFAULT_PREFS.tint) out.tint = p.tint;
  if (p.hearts !== DEFAULT_PREFS.hearts) out.hearts = p.hearts;
  return out;
}

/** Merges saved values, ignoring junk; tint is clamped to its range. */
export function applyPrefs(p: Prefs, saved: unknown): void {
  if (!saved || typeof saved !== 'object') return;
  const s = saved as Record<string, unknown>;
  if (typeof s.sound === 'boolean') p.sound = s.sound;
  if (typeof s.shake === 'boolean') p.shake = s.shake;
  if (typeof s.tint === 'number' && Number.isFinite(s.tint)) p.tint = Math.min(0.6, Math.max(0, s.tint));
  if (typeof s.hearts === 'number' && Number.isFinite(s.hearts)) {
    p.hearts = Math.min(MAX_HEARTS, Math.max(MIN_HEARTS, Math.round(s.hearts)));
  }
}

export function loadPrefs(): Prefs {
  const p: Prefs = { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) applyPrefs(p, JSON.parse(raw));
  } catch {
    // storage blocked or corrupt: defaults
  }
  return p;
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(changedPrefs(p)));
  } catch {
    // not persisted; still applies for this visit
  }
}
