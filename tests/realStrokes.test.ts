import { describe, expect, it } from 'vitest';
import type { LoggedStroke } from '../src/debug/strokeLog';
import { DEFAULT_RECORDER, StrokeRecorder, type PointerSample, type RecorderEvent } from '../src/input/strokes';
import { readStroke } from '../src/recognizer/pipeline';
import { DEFAULT_RECOGNIZER, Recognizer } from '../src/recognizer/recognizer';
import { SHAPES } from '../src/recognizer/shapes';
import fixture from './fixtures/real-strokes-2026-11-17.json';

/**
 * Real camera strokes from a tagged playtest (2026-11-17, laptop webcam, ~20 samples/s while
 * drawing). Before each batch the intended shape was declared with a number key; 'none' =
 * deliberately not a shape (diagonals, squares, scribbles). Every stroke is replayed through
 * the exact game pipeline (recorder -> readStroke -> recognizer) with the CURRENT defaults,
 * so a change that helps synthetic strokes but hurts real hands fails here.
 *
 * Hard cases are kept on purpose because they are what real play looks like: #17 is
 * hand-leaving jitter tagged as a vertical line, #25 a circle whose tracking dropout was
 * bridged by a straight chord, #36 a very skewed triangle.
 */
interface Outcome {
  index: number;
  intent: string;
  accepted: boolean;
  top: string | null;
  score: number;
}

function replayAll(): Outcome[] {
  const log = fixture as unknown as { strokes: LoggedStroke[] };
  const rec = new Recognizer(SHAPES, { ...DEFAULT_RECOGNIZER });
  const out: Outcome[] = [];
  log.strokes.forEach((e, index) => {
    if (!e.intent) return;
    const recorder = new StrokeRecorder({ ...DEFAULT_RECORDER });
    let ev: RecorderEvent | null = null;
    for (const [x, y, dt, d, r] of e.s) {
      const s: PointerSample = { x, y, t: e.start + dt, down: d === 1, ratio: r < 0 ? undefined : r };
      if (!s.down) s.end = e.end;
      ev = recorder.push(s) ?? ev;
    }
    if (!ev || ev.type !== 'stroke') return; // taps and false pinches never reach the recognizer
    const { result } = readStroke(rec, ev.stroke, DEFAULT_RECORDER.smoothPasses);
    out.push({ index, intent: e.intent, accepted: result.accepted, top: result.top?.id ?? null, score: result.top?.score ?? 0 });
  });
  return out;
}

describe('real camera strokes (2026-11-17 tagged playtest)', () => {
  const outcomes = replayAll();
  const ok = (o: Outcome) => (o.intent === 'none' ? !o.accepted : o.accepted && o.top === o.intent);
  const tally = (intent: string) => {
    const xs = outcomes.filter((o) => o.intent === intent);
    return { ok: xs.filter(ok).length, n: xs.length };
  };
  const summary = () =>
    ['hline', 'vline', 'circle', 'triangle', 'v', 'none']
      .map((k) => {
        const t = tally(k);
        return `${k} ${t.ok}/${t.n}`;
      })
      .join(', ');

  it('the fixture covers every shape plus deliberate non-shapes', () => {
    for (const k of ['hline', 'vline', 'circle', 'triangle', 'v', 'none']) expect(tally(k).n, k).toBeGreaterThanOrEqual(8);
  });

  it('recognises >= 90% of real shapes overall', () => {
    const shapes = outcomes.filter((o) => o.intent !== 'none');
    expect(shapes.filter(ok).length / shapes.length, summary()).toBeGreaterThanOrEqual(0.9);
  });

  it.each([
    ['hline', 7],
    ['vline', 7],
    ['circle', 12],
    ['triangle', 12],
    ['v', 10],
  ] as [string, number][])('%s: at least %i recognised', (intent, min) => {
    expect(tally(intent).ok, summary()).toBeGreaterThanOrEqual(min);
  });

  it('rejects at least 10 of the 12 deliberate non-shapes', () => {
    expect(tally('none').ok, summary()).toBeGreaterThanOrEqual(10);
  });

  it('rarely mistakes one vocabulary shape for another (<= 2 strokes)', () => {
    const swaps = outcomes.filter((o) => o.intent !== 'none' && o.accepted && o.top !== o.intent);
    expect(swaps.length, JSON.stringify(swaps)).toBeLessThanOrEqual(2);
  });
});
