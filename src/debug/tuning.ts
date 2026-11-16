import { resetTuning, saveTuning, type Tuning } from '../settings';

interface Slider {
  group: keyof Tuning;
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: Slider[] = [
  { group: 'filter', key: 'minCutoff', label: 'smooth: min cutoff (Hz)', min: 0.1, max: 6, step: 0.05 },
  { group: 'filter', key: 'beta', label: 'smooth: speed beta', min: 0, max: 0.05, step: 0.0005 },
  { group: 'filter', key: 'dCutoff', label: 'smooth: speed cutoff (Hz)', min: 0.1, max: 5, step: 0.05 },
  { group: 'pen', key: 'press', label: 'pinch: press below', min: 0.05, max: 1.0, step: 0.01 },
  { group: 'pen', key: 'release', label: 'pinch: release above', min: 0.1, max: 1.4, step: 0.01 },
  { group: 'pen', key: 'lostGraceMs', label: 'pinch: hand-lost grace (ms)', min: 0, max: 400, step: 10 },
  { group: 'recorder', key: 'tailTrimMs', label: 'stroke: trim release tail (ms)', min: 0, max: 150, step: 5 },
  { group: 'recorder', key: 'minPathPx', label: 'stroke: ignore taps under (px)', min: 0, max: 80, step: 2 },
  { group: 'recognizer', key: 'minScore', label: 'shapes: accept score above', min: 0.5, max: 0.98, step: 0.01 },
];

/** Dev panel (toggle with T). Edits the shared Tuning objects in place and persists them. */
export function mountTuningPanel(root: HTMLElement, tuning: Tuning): { toggle(): void } {
  root.innerHTML = '';
  const title = document.createElement('h2');
  title.textContent = 'Input tuning';
  root.append(title);

  const refreshers: (() => void)[] = [];
  for (const s of SLIDERS) {
    const obj = tuning[s.group] as unknown as Record<string, number>;
    const row = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = s.label;
    const value = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(s.min);
    input.max = String(s.max);
    input.step = String(s.step);
    const refresh = () => {
      input.value = String(obj[s.key]);
      value.textContent = String(obj[s.key]);
    };
    input.addEventListener('input', () => {
      obj[s.key] = Number(input.value);
      value.textContent = input.value;
      saveTuning(tuning);
    });
    refresh();
    refreshers.push(refresh);
    row.append(name, value, input);
    root.append(row);
  }

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reset to defaults';
  reset.addEventListener('click', () => {
    resetTuning(tuning);
    saveTuning(tuning);
    refreshers.forEach((r) => r());
  });
  const hint = document.createElement('p');
  hint.textContent = 'Saved in this browser. T to close.';
  root.append(reset, hint);

  return {
    toggle() {
      root.hidden = !root.hidden;
    },
  };
}
