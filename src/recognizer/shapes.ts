/**
 * The shape vocabulary, as data. To add a shape (zigzag, heart, star...), add one entry:
 *
 *   points        The ideal stroke as a polyline in any units, y pointing DOWN (screen space),
 *                 in the order a player would draw it.
 *   rotationDeg   How far a drawing may be rotated and still count. 0-90 = that tolerance
 *                 (horizontal vs vertical line needs this small). 180 = fully rotation
 *                 invariant (circle).
 *   bidirectional Also accept the stroke drawn backwards.
 *   closed        The polyline returns to its start (first point === last point); also accept
 *                 starting from any vertex.
 *   corners       [min, max] sharp interior turns a drawing should have (ends don't count).
 *                 Separates round from pointy shapes, which pure template distance can't
 *                 do reliably (a rounded triangle is "close" to a circle).
 *
 * Nothing else needs to change: the recognizer expands variants itself.
 */
export interface ShapeDef {
  id: string;
  label: string;
  points: readonly (readonly [number, number])[];
  rotationDeg: number;
  bidirectional?: boolean;
  closed?: boolean;
  corners?: readonly [number, number];
}

function circle(n = 32): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.cos(a), Math.sin(a)]);
  }
  return pts;
}

const H = Math.sqrt(3) / 2;

// Ranges tuned on real camera strokes (tests/fixtures/real-strokes-2026-11-17.json), where
// hand-drawn shapes at ~20 samples/s are lumpier than any textbook shape:
//   circle   0-2 corners: real circles have flat sides and dents (7 of 13 read as 2 corners).
//   triangle any rotation (players draw ▽ too), exactly 2 interior corners: 14 of 15 real
//            triangles show 2, and squares (3) must not pass as triangles.
//   V        1-2 corners: real V's are lopsided like check marks and pick up a stray wiggle.
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
];
