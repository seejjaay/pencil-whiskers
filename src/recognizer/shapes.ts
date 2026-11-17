/**
 * The shape vocabulary, as data. To add a shape, add one entry:
 *
 *   points        The ideal stroke as a polyline in any units, y pointing DOWN (screen space),
 *                 in the order a player would draw it.
 *   rotationDeg   How far a drawing may be rotated and still count. 0-90 = that tolerance
 *                 (horizontal vs vertical line needs this small). 180 = fully rotation
 *                 invariant (circle).
 *   bidirectional Also accept the stroke drawn backwards.
 *   closed        The polyline returns to its start (first point === last point); also accept
 *                 starting from another point: every vertex, or only the indices in `starts`.
 *   corners       [min, max] sharp interior turns a drawing should have (ends don't count).
 *                 Separates round from pointy shapes, which pure template distance can't
 *                 do reliably (a rounded triangle is "close" to a circle).
 *   role          'threat' shapes appear on threats; 'power' shapes are only ever drawn to use
 *                 a saved power-up, so threats never carry them.
 *
 * Nothing else needs to change: the recognizer expands variants and the game draws glyphs
 * straight from these points.
 */
export interface ShapeDef {
  id: string;
  label: string;
  points: readonly (readonly [number, number])[];
  rotationDeg: number;
  bidirectional?: boolean;
  closed?: boolean;
  /** For closed shapes: the only vertex indices a drawing may start from (default: all). */
  starts?: readonly number[];
  corners?: readonly [number, number];
  role?: 'threat' | 'power';
  /**
   * Keep the drawing's proportions when normalising. Wide shapes (∞ is ~3:1) are otherwise
   * stretched into a square box, which multiplies hand jitter across their short side.
   */
  uniformScale?: boolean;
  /**
   * The stroke's two ends must come back within this fraction of its size, or it's penalised.
   * ∞ ends where it started; an S-curve (which otherwise scores close to ∞) never does.
   */
  maxGap?: number;
}

function circle(n = 32): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.cos(a), Math.sin(a)]);
  }
  return pts;
}

/** Single-stroke heart, starting at the top dip, round the right lobe, the point, the left lobe. */
function heart(n = 32): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push([x, y]);
  }
  return pts;
}

/** Two-turn inward spiral, starting on the outside. */
function spiral(n = 48, turns = 2): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const a = k * turns * Math.PI * 2;
    const r = 1 - 0.82 * k;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** Sideways figure-eight (lemniscate), starting at the right tip. */
function infinity(n = 40): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const d = 1 + Math.sin(t) * Math.sin(t);
    pts.push([Math.cos(t) / d, (Math.sin(t) * Math.cos(t)) / d]);
  }
  return pts;
}

/**
 * An arch (upside-down U): up the left side, over the top, down the right side. The straight
 * legs are as long as the arch is wide, so an under-closed circle can't pass for one.
 */
function arch(n = 16): [number, number][] {
  const pts: [number, number][] = [[0, 1.5]];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    pts.push([0.5 + 0.5 * Math.cos(a), 0.5 - 0.5 * Math.sin(a)]);
  }
  pts.push([1, 1.5]);
  return pts;
}

const H = Math.sqrt(3) / 2;

// Ranges tuned on real camera strokes (tests/fixtures/real-strokes-2026-11-17.json), where
// hand-drawn shapes at ~20 samples/s are lumpier than any textbook shape:
//   circle   0-2 corners: real circles have flat sides and dents (7 of 13 read as 2 corners).
//   triangle any rotation (players draw ▽ too), exactly 2 interior corners: 14 of 15 real
//            triangles show 2, and squares (3) must not pass as triangles.
//   V        1-2 corners: real V's are lopsided like check marks and pick up a stray wiggle.
// Shapes added in the rules pass (square, W, lightning, heart, and the power shapes) are tuned
// on synthetic strokes until real tagged strokes exist for them.
export const SHAPES: readonly ShapeDef[] = [
  { id: 'hline', label: 'horizontal line', points: [[0, 0], [1, 0]], rotationDeg: 25, bidirectional: true, corners: [0, 1] },
  { id: 'vline', label: 'vertical line', points: [[0, 0], [0, 1]], rotationDeg: 25, bidirectional: true, corners: [0, 1] },
  { id: 'circle', label: 'circle', points: circle(), rotationDeg: 180, bidirectional: true, corners: [0, 2] },
  {
    id: 'triangle',
    label: 'triangle',
    points: [[0.5, 0], [1, H], [0, H], [0.5, 0]],
    rotationDeg: 180,
    bidirectional: true,
    closed: true,
    corners: [2, 2],
  },
  { id: 'v', label: 'V', points: [[0, 0], [0.5, 1], [1, 0]], rotationDeg: 20, bidirectional: true, corners: [1, 2] },
  {
    id: 'square',
    label: 'square',
    points: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
    rotationDeg: 20,
    bidirectional: true,
    closed: true,
    corners: [2, 4],
  },
  { id: 'w', label: 'W', points: [[0, 0], [0.25, 1], [0.5, 0.3], [0.75, 1], [1, 0]], rotationDeg: 20, bidirectional: true, corners: [3, 3] },
  { id: 'lightning', label: 'lightning bolt', points: [[0.65, 0], [0.2, 0.55], [0.75, 0.45], [0.3, 1]], rotationDeg: 20, bidirectional: true, corners: [2, 2] },
  { id: 'heart', label: 'heart', points: heart(), rotationDeg: 20, bidirectional: true, closed: true, starts: [0, 16], corners: [2, 3] },
  { id: 'spiral', label: 'spiral', role: 'power', points: spiral(), rotationDeg: 180, bidirectional: true, corners: [1, 4] },
  { id: 'infinity', label: 'infinity', role: 'power', points: infinity(), rotationDeg: 25, bidirectional: true, closed: true, starts: [0, 10, 20, 30], corners: [1, 4], uniformScale: true, maxGap: 0.5 },
  { id: 'arch', label: 'arch', role: 'power', points: arch(), rotationDeg: 20, bidirectional: true, corners: [0, 1] },
];

export const roleOf = (id: string): 'threat' | 'power' => SHAPES.find((s) => s.id === id)?.role ?? 'threat';
