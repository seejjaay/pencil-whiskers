import { smoothStroke, type Stroke } from '../input/strokes';
import type { Recognition, Recognizer } from './recognizer';

/**
 * The one path from a finished stroke to a verdict, shared by the game and the replay tests
 * over real recorded strokes, so what the tests measure is what the player gets.
 *
 * Recognition runs on the trimmed but UNSMOOTHED points: on real camera strokes (~20
 * samples/s) smoothing rounded shapes off and let more junk pass as circles, without
 * recognising any more real shapes. Smoothing is for display only.
 */
export function readStroke(
  rec: Recognizer,
  stroke: Stroke,
  displaySmoothPasses: number,
): { stroke: Stroke; result: Recognition } {
  return {
    stroke: { ...stroke, points: smoothStroke(stroke.points, displaySmoothPasses) },
    result: rec.recognize(stroke.points),
  };
}
