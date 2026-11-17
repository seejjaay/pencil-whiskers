/**
 * "Teach <cat> my shapes": walks through every shape, asks for a few drawings of each, and
 * stores them as personal templates. Strokes are routed here instead of the game while open.
 */
import type { Pt, Recognizer } from '../recognizer/recognizer';
import { SAMPLES_PER_SHAPE, checkSample, compactSample, countSamples, labelOf, type PersonalSet } from '../recognizer/personal';
import { SHAPES } from '../recognizer/shapes';
import { drawGlyph } from '../view/gameView';
import { CAT_NAME } from '../cat';

export interface CalibrationApi {
  open(current: PersonalSet): void;
  close(): void;
  /** Feed a finished stroke. */
  offer(points: readonly Pt[]): void;
  readonly active: boolean;
}

export function mountCalibration(
  root: HTMLElement,
  standard: Recognizer,
  hooks: { onSave: (set: PersonalSet) => void; onClose: () => void; onSample: (ok: boolean) => void },
): CalibrationApi {
  root.innerHTML = '';
  const title = document.createElement('h2');
  title.id = 'calib-title';
  title.textContent = `Teach ${CAT_NAME} your shapes`;
  const glyph = document.createElement('canvas');
  glyph.width = 120;
  glyph.height = 120;
  glyph.setAttribute('aria-hidden', 'true');
  const prompt = document.createElement('p');
  prompt.className = 'prompt';
  const dots = document.createElement('p');
  dots.className = 'dots';
  const feedback = document.createElement('p');
  feedback.className = 'feedback';
  feedback.setAttribute('aria-live', 'polite');
  const row = document.createElement('div');
  row.className = 'row';
  const mk = (text: string, fn: () => void, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (cls) b.className = cls;
    b.addEventListener('click', fn);
    row.append(b);
    return b;
  };
  root.append(title, glyph, prompt, dots, feedback, row);

  let set: PersonalSet = {};
  let index = 0;
  let samples: Pt[][] = [];
  let finished = false;

  const shape = () => SHAPES[index];

  const render = () => {
    const g = glyph.getContext('2d')!;
    g.clearRect(0, 0, glyph.width, glyph.height);
    if (!finished) drawGlyph(g, shape().id, 60, 60, 70, '#d36f98', 7);
    prompt.textContent = finished
      ? `Saved ${countSamples(set)} drawings. ${CAT_NAME} will know your style now.`
      : `Draw a ${labelOf(shape().id)}, your way (${samples.length + 1} of ${SAMPLES_PER_SHAPE}).`;
    dots.textContent = finished ? '' : `${'●'.repeat(samples.length)}${'○'.repeat(SAMPLES_PER_SHAPE - samples.length)}   shape ${index + 1} of ${SHAPES.length}`;
  };

  const next = () => {
    if (samples.length) set[shape().id] = samples;
    samples = [];
    index++;
    if (index >= SHAPES.length) {
      finished = true;
      hooks.onSave(set);
      feedback.textContent = 'All done!';
      setTimeout(() => api.close(), 1400);
    }
    render();
  };

  mk('Skip this shape', () => {
    if (!finished) {
      feedback.textContent = `Skipped the ${labelOf(shape().id)}.`;
      next();
    }
  });
  mk('Forget my shapes', () => {
    set = {};
    samples = [];
    hooks.onSave({});
    feedback.textContent = `Forgotten. ${CAT_NAME} uses the standard shapes again.`;
    index = 0;
    finished = false;
    render();
  });
  mk('Done', () => {
    if (!finished) {
      if (samples.length) set[shape().id] = samples;
      hooks.onSave(set);
    }
    api.close();
  }, 'primary');

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      api.close();
    }
  });

  const api: CalibrationApi = {
    open(current) {
      set = { ...current };
      index = 0;
      samples = [];
      finished = false;
      feedback.textContent = 'Pinch and draw (or hold the mouse button). Bigger is better.';
      render();
      root.hidden = false;
      (row.querySelector('button.primary') as HTMLButtonElement | null)?.focus({ preventScroll: true });
    },
    close() {
      if (root.hidden) return;
      root.hidden = true;
      hooks.onClose();
    },
    offer(points) {
      if (root.hidden || finished) return;
      const id = shape().id;
      const check = checkSample(standard, id, points);
      hooks.onSample(check.ok);
      if (!check.ok) {
        feedback.textContent = check.reason;
        return;
      }
      samples.push(compactSample(points));
      feedback.textContent = samples.length < SAMPLES_PER_SHAPE ? 'Got it!' : `${labelOf(id)} learned!`;
      if (samples.length >= SAMPLES_PER_SHAPE) next();
      else render();
    },
    get active() {
      return !root.hidden;
    },
  };
  return api;
}
