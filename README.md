# Pencil Whiskers

Mochi the cat is napping. Household threats creep toward her, each thinking of a shape.
Pinch your thumb and index finger in front of the webcam and draw that shape in the air to
send them packing. Mouse works too: hold the button and drag.

Everything runs in your browser. The camera image never leaves your device: no backend,
no accounts, no analytics. After one visit with the camera on, it also works offline.

## Run it locally

Needs Node 24+ and a desktop Chrome or Edge with a webcam.

```bash
npm install
npm run dev
```

Open http://localhost:5173 and allow the camera. No camera? It falls back to the mouse.

## Play

| | |
|---|---|
| Draw | Pinch thumb + index finger and move (or hold the left mouse button) |
| Start / play again | Draw a circle, or press Start |
| Pause | P or Esc (switching tabs pauses too) |
| Settings | Sound, screen shake, camera tint, and "Teach Mochi my shapes" calibration |
| Camera / mouse | M |
| Debug | D: performance HUD · T: input tuning · [ and ] then L: tag and save strokes |
| Power-ups | Draw a falling gift's shape to save it; draw spiral (slow time), ∞ (erase all) or ∩ (barrier) to use it |

URL options: `?seed=123` replays the same game, `?wave=5` starts at the first boss,
`?mouse` skips the camera, `?debug` shows the HUD, `?bench` logs performance numbers.

## Test and build

```bash
npm test            # unit tests, incl. replaying real recorded camera strokes
npm run build       # type-check + production build into dist/
npm run preview     # serve dist/ at http://localhost:4173
```

The build uses a relative base (`base: './'`), so `dist/` works from any sub-path.

## Deploy to GitHub Pages

1. Create a GitHub repository and push this project to its `main` branch.
2. In the repository: Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Push to `main` (or run the workflow by hand from the Actions tab). The workflow in
   `.github/workflows/deploy.yml` installs, tests, builds and publishes `dist/`.
4. The game is live at `https://<user>.github.io/<repo>/`. Pages serves HTTPS, which the
   camera requires.

Manual alternative: run `npm run build` and publish the contents of `dist/` to any static host.

## How it works

- `src/tracking`: webcam frames go to a Web Worker running MediaPipe HandLandmarker;
  the 60+ fps render loop only reads the latest result and never waits for it.
- `src/input`: pinch detection with hysteresis and a release hold, One Euro smoothing,
  stroke recording, and the camera/mouse `PointerSource`s.
- `src/recognizer`: a $1-style template matcher with per-shape rotation and corner rules,
  tuned on real camera strokes (`tests/fixtures`), plus personal templates from calibration.
- `src/game`: pure, seeded game rules (waves, boss, scoring, hearts), tested with
  simulated players.
- `src/view`, `src/audio`, `src/ui`: canvas art, particles, Web Audio sounds, DOM dialogs.

## Credits

Hand tracking uses MediaPipe Tasks Vision and the MediaPipe Hand Landmarker model
(both Apache License 2.0), bundled locally in `public/`. All art and sound are generated
in code.
