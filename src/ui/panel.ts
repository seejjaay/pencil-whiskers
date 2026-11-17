/**
 * The title / game-over / pause card. DOM rather than canvas so text is crisp and the button
 * is a real, focusable control (Enter / Space work). The card never blocks drawing: only its
 * button takes pointer events, so "draw a circle to start" works with mouse and camera.
 */
export interface PanelApi {
  showTitle(): void;
  showGameOver(result: { score: number; wave: number; bestCombo: number }): void;
  showPaused(): void;
  hide(): void;
  readonly visible: boolean;
}

export function mountPanel(root: HTMLElement, onPrimary: () => void): PanelApi {
  root.innerHTML = '';
  const title = document.createElement('h1');
  title.id = 'panel-title';
  const lead = document.createElement('p');
  lead.className = 'lead';
  const stats = document.createElement('p');
  stats.className = 'stats';
  const button = document.createElement('button');
  button.type = 'button';
  const hint = document.createElement('p');
  hint.className = 'hint';
  root.append(title, lead, stats, button, hint);
  button.addEventListener('click', onPrimary);

  const show = (t: string, l: string, s: string, b: string, h: string) => {
    title.textContent = t;
    lead.textContent = l;
    stats.textContent = s;
    stats.hidden = !s;
    button.textContent = b;
    hint.textContent = h;
    root.hidden = false;
    button.focus({ preventScroll: true });
  };

  return {
    showTitle: () =>
      show(
        'Pencil Whiskers',
        'Mochi is napping. Household threats are creeping in, each thinking of a shape. Draw that shape in the air to send them packing.',
        '',
        'Start',
        'Pinch thumb and finger to draw (or hold the mouse button). Draw a circle to start.',
      ),
    showGameOver: (r) =>
      show(
        'Mochi woke up!',
        'Too many threats got through. A nap is never truly over, though.',
        `Score ${r.score.toLocaleString()} · wave ${r.wave} · best purr streak ${r.bestCombo}`,
        'Play again',
        'Or draw a circle to play again.',
      ),
    showPaused: () => show('Paused', 'Mochi is still asleep.', '', 'Resume', 'P to pause or resume.'),
    hide: () => {
      root.hidden = true;
    },
    get visible() {
      return !root.hidden;
    },
  };
}
