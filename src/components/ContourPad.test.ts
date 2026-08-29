import { describe, expect, it } from 'vitest';
import { gestureContour } from './ContourPad';

describe('relative contour gesture', () => {
  it('keeps direction primary and marks only a clearly larger movement as a leap', () => {
    const contour = gestureContour([
      { x: 0, y: 80 },
      { x: 100, y: 72 },
      { x: 200, y: 30 },
      { x: 300, y: 38 },
    ]);
    expect(contour.map(x => x.pitchMidi)).toEqual([72, 74, 79, 77]);
    expect(contour[2].contourShapeConfidence).toBeGreaterThan(contour[1].contourShapeConfidence);
  });

  it('treats small drawing jitter as SAME', () => {
    expect(gestureContour([{ x: 0, y: 50 }, { x: 100, y: 53 }]).map(x => x.pitchMidi)).toEqual([72, 72]);
  });
});
