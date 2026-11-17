import type { PointerSample, StrokeEnd } from '../input/strokes';
import type { Recognition } from '../recognizer/recognizer';

/** What the player says they're drawing: a shape id, 'none' (should be rejected), or untagged. */
export type Intent = string | null;
export const INTENT_NONE = 'none';

/** One sample: [x, y, ms since stroke start, pen down 1/0, pinch ratio (-1 = n/a)]. */
export type LoggedSample = [number, number, number, number, number];

export interface LoggedStroke {
  /** ms since page load when the stroke began (gaps between strokes show split strokes). */
  start: number;
  mode: 'camera' | 'mouse';
  intent: Intent;
  end: StrokeEnd;
  /** Thrown away as a tap (too short). */
  discarded: boolean;
  result: { accepted: boolean; top: string | null; score: number; next: string | null; nextScore: number } | null;
  /** Raw samples exactly as the recorder saw them, before trimming and smoothing. */
  s: LoggedSample[];
}

export interface IntentStats {
  intent: string;
  /** Strokes that reached the recognizer. */
  n: number;
  /** Shapes: accepted as the intended shape. 'none': rejected. */
  ok: number;
  /** Fragments thrown away as taps while this intent was set (split strokes). */
  taps: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Ring buffer of recent strokes with their raw samples, outcome and the player's declared
 * intent. Saved as a file it is ground truth for real-world accuracy and for replay tests.
 */
export class StrokeLog {
  readonly entries: LoggedStroke[] = [];
  private pending: LoggedSample[] = [];
  private pendingStart = NaN;
  /**
   * Intent changes with their timestamps. A stroke gets the intent in effect when it STARTED,
   * not when it was processed: camera strokes finish ~150 ms after the hand stops (release
   * hold + tracking latency), and a quick key press for the next shape must not re-tag them.
   */
  private intents: { t: number; intent: Intent }[] = [{ t: -Infinity, intent: null }];

  constructor(private readonly capacity = 80) {}

  get intent(): Intent {
    return this.intents[this.intents.length - 1].intent;
  }

  /** `t` in the same clock as samples (performance.now / event.timeStamp). */
  setIntent(intent: Intent, t: number): void {
    this.intents.push({ t, intent });
    if (this.intents.length > 64) this.intents.splice(1, this.intents.length - 64);
  }

  intentAt(t: number): Intent {
    for (let i = this.intents.length - 1; i >= 0; i--) if (this.intents[i].t <= t) return this.intents[i].intent;
    return null;
  }

  /** Feed every sample the recorder sees, before `recorder.push`. Hover samples are ignored. */
  sample(s: PointerSample): void {
    if (!s.down && this.pending.length === 0) return;
    if (this.pending.length === 0) this.pendingStart = s.t;
    const ratio = s.ratio !== undefined && Number.isFinite(s.ratio) ? Math.round(s.ratio * 100) / 100 : -1;
    this.pending.push([r1(s.x), r1(s.y), r1(s.t - this.pendingStart), s.down ? 1 : 0, ratio]);
  }

  /** Closes the pending stroke with its outcome. */
  commit(mode: 'camera' | 'mouse', end: StrokeEnd, discarded: boolean, res: Recognition | null): LoggedStroke | null {
    if (this.pending.length === 0) return null;
    const entry: LoggedStroke = {
      start: Math.round(this.pendingStart),
      mode,
      intent: this.intentAt(this.pendingStart),
      end,
      discarded,
      result: res && {
        accepted: res.accepted,
        top: res.top?.id ?? null,
        score: r3(res.top?.score ?? 0),
        next: res.runnerUp?.id ?? null,
        nextScore: r3(res.runnerUp?.score ?? 0),
      },
      s: this.pending,
    };
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.shift();
    this.pending = [];
    this.pendingStart = NaN;
    return entry;
  }

  /** Abandons the stroke in progress (mode switch). */
  dropPending(): void {
    this.pending = [];
    this.pendingStart = NaN;
  }

  stats(): IntentStats[] {
    const byIntent = new Map<string, IntentStats>();
    for (const e of this.entries) {
      if (!e.intent) continue;
      const st = byIntent.get(e.intent) ?? { intent: e.intent, n: 0, ok: 0, taps: 0 };
      byIntent.set(e.intent, st);
      if (e.discarded) {
        st.taps++;
        continue;
      }
      st.n++;
      const accepted = !!e.result?.accepted;
      if (e.intent === INTENT_NONE ? !accepted : accepted && e.result?.top === e.intent) st.ok++;
    }
    return [...byIntent.values()];
  }

  toJSON(meta: Record<string, unknown>): string {
    return JSON.stringify({ format: 'pencil-whiskers-strokes', version: 1, ...meta, strokes: this.entries });
  }
}

/** Saves text as a file through the browser's normal download. */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
