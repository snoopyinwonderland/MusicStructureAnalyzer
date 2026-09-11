import { describe, expect, it } from 'vitest';
import { hasInterleavedVoiceSequence, laneForwardGaps } from './musicXmlVoiceNormalizer';

describe('MusicXML voice normalization admission', () => {
  it('detects a voice that returns after another voice', () => {
    expect(hasInterleavedVoiceSequence(['1:1', '1:2', '1:2', '1:1', '1:2'])).toBe(true);
  });

  it('does not rewrite already contiguous voice blocks', () => {
    expect(hasInterleavedVoiceSequence(['1:1', '1:1', '1:2', '1:2', '2:5'])).toBe(false);
  });
});

describe('MusicXML voice lane timing', () => {
  it('preserves an initial and internal voice gap with forward durations', () => {
    expect(laneForwardGaps([
      { onset: 768, duration: 384, chord: false },
      { onset: 1536, duration: 384, chord: false },
      { onset: 1920, duration: 192, chord: false },
    ])).toEqual([768, 384, 0]);
  });

  it('keeps a chord at its root onset without advancing the lane twice', () => {
    expect(laneForwardGaps([
      { onset: 0, duration: 768, chord: false },
      { onset: 0, duration: 768, chord: true },
      { onset: 768, duration: 768, chord: false },
    ])).toEqual([0, 0, 0]);
  });

  it('rejects overlapping attacks in one voice unless they are encoded as a chord', () => {
    expect(laneForwardGaps([
      { onset: 0, duration: 768, chord: false },
      { onset: 384, duration: 384, chord: false },
    ])).toBeNull();
  });
});
