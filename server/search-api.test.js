import { describe, expect, it } from 'vitest';
import { alignLocal, alignRhythmDtw, displayMeasure, firstMeasureIsPickup, prepareQueryNotes, rhythmRankFactor, searchDatabase } from './search-api.mjs';

const notes = pitches => pitches.map((pitchMidi, i) => ({
  id: String(i), kind: 'note', pitchMidi, durationRatio: 1,
}));

describe('pickup measure inference', () => {
  it('recognizes an incomplete first measure without implicit=yes', () => {
    expect(firstMeasureIsPickup('<attributes><divisions>256</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><duration>128</duration></note><note><rest/><duration>128</duration></note>')).toBe(true);
  });

  it('keeps a complete first measure as measure 1', () => {
    expect(firstMeasureIsPickup('<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><duration>16</duration></note>')).toBe(false);
  });
});

describe('production local alignment', () => {
  it('finds a transposed motif inside a wider candidate window', () => {
    const result = alignLocal(notes([60, 62, 64, 67]), notes([50, 55, 72, 74, 76, 79, 48]), 'melody');
    expect(result.start).toBe(2);
    expect(result.end).toBe(5);
    expect(result.coverage).toBe(1);
    expect(result.similarity).toBe(100);
  });

  it('keeps a match when the candidate contains an ornament note', () => {
    const result = alignLocal(notes([60, 62, 64, 67, 69]), notes([72, 74, 74, 76, 79, 81]), 'melody');
    expect(result.coverage).toBe(1);
    expect(result.path.some(step => step.type === 'insertion')).toBe(true);
    expect(result.similarity).toBeGreaterThan(60);
  });

  it('records a missing query note instead of shifting the whole motif', () => {
    const result = alignLocal(notes([60, 62, 64, 65, 67]), notes([72, 74, 77, 79]), 'melody');
    expect(result.path.some(step => step.type === 'deletion')).toBe(true);
    expect(result.coverage).toBeGreaterThanOrEqual(.75);
  });

  it('returns alignment indexes that point into each production excerpt', () => {
    const events = notes([60, 62, 64, 67]);
    const result = searchDatabase({ version: 1, mode: 'melody', meter: '4/4', startsOnDownbeat: true, events }, 3);
    const matches = [...result.exact, ...result.similar];
    expect(matches.length).toBeGreaterThan(0);
    for (const match of matches) for (const step of match.alignment) {
      if (step.candidateIndex !== null) {
        expect(step.candidateIndex).toBeGreaterThanOrEqual(0);
        expect(step.candidateIndex).toBeLessThan(match.work.notes.length);
      }
    }
  });
});

describe('constrained rhythm DTW', () => {
  const rhythm = durations => durations.map((durationRatio, i) => ({ id: String(i), kind: 'note', pitchMidi: 60 + i, durationRatio }));

  it('is invariant under global tempo augmentation', () => {
    expect(alignRhythmDtw(rhythm([1, .5, .5, 1]), rhythm([2, 1, 1, 2])).similarity).toBe(100);
  });

  it('allows one duration to be divided into two notes', () => {
    expect(alignRhythmDtw(rhythm([1, 1, 2, 1]), rhythm([1, 1, 1, 1, 1])).similarity).toBeGreaterThan(75);
  });

  it('penalizes a substantially different rhythm', () => {
    const matching = alignRhythmDtw(rhythm([1, .5, .5, 2]), rhythm([2, 1, 1, 4])).similarity;
    const different = alignRhythmDtw(rhythm([1, .5, .5, 2]), rhythm([.25, 2, .25, 1])).similarity;
    expect(matching).toBeGreaterThan(different);
  });

  it('keeps small timing variations inside a gentle tolerance zone', () => {
    expect(alignRhythmDtw(rhythm([1, 1, 1, 1]), rhythm([1, 1.06, .94, 1])).similarity).toBeGreaterThan(97);
  });

  it('includes an internal rest in the next inter-onset interval', () => {
    const query = prepareQueryNotes([
      { id: 'a', kind: 'note', pitchMidi: 60, durationRatio: 1 },
      { id: 'r', kind: 'rest', pitchMidi: null, durationRatio: 1 },
      { id: 'b', kind: 'note', pitchMidi: 62, durationRatio: 1 },
      { id: 'c', kind: 'note', pitchMidi: 64, durationRatio: 1 },
    ]);
    expect(query.map(x => x.onset)).toEqual([0, 2, 3]);
    expect(alignRhythmDtw(query, [{ durationRatio: 1, onset: 0 }, { durationRatio: 1, onset: 2 }, { durationRatio: 1, onset: 3 }]).similarity).toBe(100);
    expect(alignRhythmDtw(query, [{ durationRatio: 1, onset: 0 }, { durationRatio: 1, onset: 1 }, { durationRatio: 1, onset: 2 }]).similarity).toBeLessThan(90);
  });

  it('strongly demotes low rhythm scores while leaving high scores alone', () => {
    expect(rhythmRankFactor(90)).toBe(1);
    expect(rhythmRankFactor(44)).toBeLessThan(.68);
  });
});

describe('MusicXML measure labels', () => {
  it('preserves pickup measure zero instead of falling back to ordinal one', () => {
    expect(displayMeasure('0')).toBe(0);
  });
});
