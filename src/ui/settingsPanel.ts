import { CAT_NAME } from '../cat';
import { MAX_HEARTS, MIN_HEARTS, savePrefs, type Prefs } from '../prefs';

export interface SettingsApi {
  open(): void;
  close(): void;
  readonly visible: boolean;
}

/**
 * Settings dialog: sound, screen shake, camera tint, and the way into shape calibration.
 * Real buttons and a real range input, so it works by keyboard; Escape closes it.
 */
export function mountSettings(
  root: HTMLElement,
  prefs: Prefs,
  hooks: { onChange: () => void; onCalibrate: () => void; onClose: () => void },
): SettingsApi {
  root.innerHTML = '';
  const title = document.createElement('h2');
  title.id = 'settings-title';
  title.textContent = 'Settings';

  const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toggle';
    const render = () => {
      b.textContent = `${label}: ${get() ? 'on' : 'off'}`;
      b.setAttribute('aria-pressed', String(get()));
    };
    b.addEventListener('click', () => {
      set(!get());
      render();
      savePrefs(prefs);
      hooks.onChange();
    });
    render();
    return b;
  };

  const sound = toggle('Sound', () => prefs.sound, (v) => (prefs.sound = v));
  const shake = toggle('Screen shake', () => prefs.shake, (v) => (prefs.shake = v));

  const tintLabel = document.createElement('label');
  tintLabel.className = 'tint';
  const tintText = document.createElement('span');
  tintText.textContent = 'Camera tint';
  const tint = document.createElement('input');
  tint.type = 'range';
  tint.min = '0';
  tint.max = '0.6';
  tint.step = '0.02';
  tint.value = String(prefs.tint);
  tint.addEventListener('input', () => {
    prefs.tint = Number(tint.value);
    savePrefs(prefs);
    hooks.onChange();
  });
  tintLabel.append(tintText, tint);

  const livesLabel = document.createElement('label');
  livesLabel.className = 'tint';
  const livesText = document.createElement('span');
  const renderLives = () => (livesText.textContent = `Lives: ${prefs.hearts} (next game)`);
  const lives = document.createElement('input');
  lives.type = 'range';
  lives.min = String(MIN_HEARTS);
  lives.max = String(MAX_HEARTS);
  lives.step = '1';
  lives.value = String(prefs.hearts);
  lives.addEventListener('input', () => {
    prefs.hearts = Number(lives.value);
    renderLives();
    savePrefs(prefs);
    hooks.onChange();
  });
  renderLives();
  livesLabel.append(livesText, lives);

  const calibrate = document.createElement('button');
  calibrate.type = 'button';
  calibrate.textContent = `Teach ${CAT_NAME} my shapes`;
  calibrate.addEventListener('click', hooks.onCalibrate);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'primary';
  close.textContent = 'Done';
  close.addEventListener('click', () => api.close());

  root.append(title, sound, shake, tintLabel, livesLabel, calibrate, close);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      api.close();
    }
  });

  let returnFocus: Element | null = null;
  const api: SettingsApi = {
    open() {
      returnFocus = document.activeElement;
      tint.value = String(prefs.tint);
      lives.value = String(prefs.hearts);
      renderLives();
      root.hidden = false;
      sound.focus({ preventScroll: true });
    },
    close() {
      if (root.hidden) return;
      root.hidden = true;
      if (returnFocus instanceof HTMLElement) returnFocus.focus({ preventScroll: true });
      hooks.onClose();
    },
    get visible() {
      return !root.hidden;
    },
  };
  return api;
}
