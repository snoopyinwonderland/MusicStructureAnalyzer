import { describe, expect, it } from 'vitest';
import { analyzePhraseBoundaries, comparePhraseBoundaries } from './phrase-boundaries.mjs';

const notes = (pitches, onsets, durations = []) => pitches.map((pitchMidi, i) => ({
  pitchMidi, durationRatio: durations[i] ?? 1, ...(onsets ? { onset: onsets[i] } : {}),
}));
const pairs = length => Array.from({ length }, (_, index) => ({ queryIndex: index, candidateIndex: index }));
const withRest = () => notes([60, 62, 64, 65, 67, 69], [0, 1, 2, 5, 6, 7]);
const comparable = (query, candidate, mapping = pairs(query.length)) => comparePhraseBoundaries(analyzePhraseBoundaries(query), analyzePhraseBoundaries(candidate), mapping);

describe('uncalibrated local boundary evidence', () => {
  it('leaves both cropped endpoints unknown, including empty and one-note input', () => {
    for (const input of [[], notes([60]), withRest()]) {
      const analysis = analyzePhraseBoundaries(input);
      expect(analysis.calibrated).toBe(false);
      expect(analysis.boundaries).toHaveLength(input.length + 1);
      for (const boundary of [analysis.boundaries[0], analysis.boundaries.at(-1)]) {
        expect(boundary).toMatchObject({ strength: 0, supported: false, reliable: false, state: 'unknown', cues: [] });
      }
    }
  });

  it('identifies a rest after a tied ending only before the next genuine attack', () => {
    const input = notes([60, 62, 62, 64, 65], [0, 1, 2, 5, 6]);
    Object.assign(input[1], { tieStart: true, tieEndMeasure: 2 });
    Object.assign(input[2], { tieStop: true, tieStart: true, measure: 2, beat: 1 });
    const result = analyzePhraseBoundaries(input).boundaries;
    expect(result[2]).toMatchObject({ strength: 0, supported: false, state: 'continuous', continuity: 1 });
    expect(result[2].cues.map(item => item.name)).toEqual(['tie-continuation']);
    expect(result[3].supported).toBe(true);
    expect(result[3].cues.some(item => item.name === 'observed-gap')).toBe(true);
  });

  it('treats explicit non-attacks as continuations and tied starts as attacks', () => {
    const input = withRest();
    input[3].isAttack = false;
    expect(analyzePhraseBoundaries(input).boundaries[3]).toMatchObject({ strength: 0, state: 'continuous' });
    input[3].isAttack = true;
    input[3].tieStart = true;
    input[3].tieEndMeasure = 5;
    expect(analyzePhraseBoundaries(input).boundaries[3].supported).toBe(true);
  });

  it('does not create positive boundary evidence from steady legato or inferred contact', () => {
    const input = notes([60, 62, 64, 66, 68, 70], [0, 1, 2, 3, 4, 5]);
    const observed = analyzePhraseBoundaries(input).boundaries;
    expect(observed.every(boundary => !boundary.supported && boundary.strength === 0)).toBe(true);
    expect(observed[2].state).toBe('continuous');
    const inferred = analyzePhraseBoundaries(notes(input.map(note => note.pitchMidi))).boundaries;
    expect(inferred.every(boundary => boundary.state === 'unknown')).toBe(true);
  });

  it('does not infer rests, attacks, or phrase starts from pickups, bars, or beats', () => {
    const input = notes([60, 62, 64, 66, 68]);
    input.forEach((note, i) => Object.assign(note, { measure: i ? 200 + i : 0, beat: i ? 1 : 3.5 }));
    expect(analyzePhraseBoundaries(input).boundaries.every(boundary => boundary.strength === 0 && !boundary.reliable)).toBe(true);
  });

  it.each(['3/4', '6/8'])('uses quarter-unit timelines without assuming a 4/4 bar in %s', meter => {
    const input = notes([60, 62, 64, 65, 67, 69], [0, .5, 1, 3, 3.5, 4], [.5, .5, .5, .5, .5, .5]);
    const reference = analyzePhraseBoundaries(input);
    input.forEach((note, i) => Object.assign(note, { meter, measure: i < 3 ? 9 : 10, beat: i < 3 ? i * .5 + 1 : (i - 3) * .5 + 1 }));
    expect(analyzePhraseBoundaries(input)).toEqual(reference);
    expect(reference.boundaries[3].supported).toBe(true);
  });

  it('is invariant under transposition, timeline translation, and uniform tempo scaling', () => {
    const input = withRest();
    const transformed = input.map(note => ({ ...note, pitchMidi: note.pitchMidi + 7, onset: note.onset * 3.7 + 21, durationRatio: note.durationRatio * 3.7 }));
    expect(analyzePhraseBoundaries(transformed)).toEqual(analyzePhraseBoundaries(input));
    const inferred = notes([60, 62, 67, 64, 65], null, [1, 1, 3, 1, 1]);
    expect(analyzePhraseBoundaries(inferred.map(note => ({ ...note, pitchMidi: note.pitchMidi - 12, durationRatio: note.durationRatio / 8 })))).toEqual(analyzePhraseBoundaries(inferred));
  });

  it('keeps an isolated leap or long note below the reliable positive threshold', () => {
    const leap = notes([60, 61, 62, 80, 81, 82], [0, 1, 2, 3, 4, 5]);
    const sustain = notes([60, 62, 64, 66, 68, 70], [0, 1, 2, 6, 7, 8], [1, 1, 4, 1, 1, 1]);
    for (const input of [leap, sustain]) {
      const result = analyzePhraseBoundaries(input).boundaries;
      expect(result.some(boundary => boundary.cues.some(item => item.name.endsWith('discontinuity')))).toBe(true);
      expect(result.every(boundary => !boundary.supported)).toBe(true);
    }
  });

  it('adds bounded motif-start evidence only with a separate local cue', () => {
    const input = notes([60, 64, 62, 67, 69, 71, 60, 64, 62, 67, 69, 71], [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13]);
    const boundary = analyzePhraseBoundaries(input).boundaries[6];
    expect(boundary.supported).toBe(true);
    expect(boundary.cues.find(item => item.name === 'repeated-motif-start')?.evidence).toMatchObject({ previousIndex: 0, distanceInAttacks: 6, requiresIndependentCue: true });
  });

  it('does not report repeated scales, oscillations, or every ostinato rotation as motif starts', () => {
    for (const pitches of [Array.from({ length: 32 }, (_, i) => 60 + i), Array.from({ length: 32 }, (_, i) => 60 + i % 2), Array.from({ length: 32 }, (_, i) => [60, 64, 67, 64][i % 4])]) {
      const analysis = analyzePhraseBoundaries(notes(pitches, pitches.map((_, i) => i)));
      expect(analysis.boundaries.every(boundary => !boundary.supported)).toBe(true);
      expect(analysis.boundaries.flatMap(boundary => boundary.cues).some(item => item.name === 'repeated-motif-start')).toBe(false);
    }
  });

  it('does not invent timing evidence from invalid or missing timestamps/durations', () => {
    const input = notes([60, 62, 64, 65, 67]);
    input[0].durationRatio = null;
    input[1].onset = null;
    input[2].onset = 4;
    input[3].onset = 3;
    input[3].durationRatio = -1;
    expect(analyzePhraseBoundaries(input).boundaries.flatMap(boundary => boundary.cues).every(item => !item.name.startsWith('observed-'))).toBe(true);
  });

  it('does not mutate input notes', () => {
    const input = withRest().map(Object.freeze);
    const original = structuredClone(input);
    analyzePhraseBoundaries(Object.freeze(input));
    expect(input).toEqual(original);
  });
});

describe('aligned local boundary comparison', () => {
  it('rewards matching supported internal boundaries with a small bounded adjustment', () => {
    const result = comparable(withRest(), withRest());
    expect(result).toMatchObject({ applicable: true, calibrated: false, support: 1, conflicts: 0 });
    expect(result.adjustment).toBeGreaterThan(0);
    expect(result.adjustment).toBeLessThanOrEqual(3);
    expect(result.score).toBeGreaterThan(50);
  });

  it('penalizes an observed query gap versus observed candidate continuity, but not unknown timing', () => {
    const query = withRest(), pitches = query.map(note => note.pitchMidi);
    const continuous = comparable(query, notes(pitches, pitches.map((_, i) => i)));
    expect(continuous).toMatchObject({ applicable: true, support: 0, conflicts: 1 });
    expect(continuous.adjustment).toBeLessThan(0);
    expect(continuous.adjustment).toBeGreaterThanOrEqual(-3);
    expect(comparable(query, notes(pitches))).toMatchObject({ applicable: false, conflicts: 0, score: 50, adjustment: 0 });
  });

  it('is neutral for continuous/unknown queries and crop endpoints', () => {
    const input = notes([60, 62, 64], [0, 1, 2]);
    expect(comparable(input, input)).toMatchObject({ applicable: false, support: 0, conflicts: 0, score: 50, adjustment: 0 });
    expect(comparable(withRest(), withRest(), [{ queryIndex: 0, candidateIndex: 3 }])).toMatchObject({ applicable: false, score: 50 });
  });

  it('skips insertion and deletion crossings instead of transferring boundary indices', () => {
    const query = withRest(), candidate = withRest();
    for (const mapping of [
      [{ queryIndex: 2, candidateIndex: 1 }, { queryIndex: null, candidateIndex: 2 }, { queryIndex: 3, candidateIndex: 3 }],
      [{ queryIndex: 1, candidateIndex: 2 }, { queryIndex: 2, candidateIndex: null }, { queryIndex: 3, candidateIndex: 3 }],
      [{ queryIndex: 2, candidateIndex: 1 }, { queryIndex: 3, candidateIndex: 3 }],
      [{ queryIndex: 1, candidateIndex: 2 }, { queryIndex: 3, candidateIndex: 3 }],
    ]) expect(comparable(query, candidate, mapping)).toMatchObject({ applicable: false, score: 50 });
  });

  it('uses original full candidate indices and supports genuinely adjacent partial mappings', () => {
    const query = withRest();
    const candidate = [...notes([55, 57], [0, 1]), ...query.map(note => ({ ...note, onset: note.onset + 2 }))];
    const result = comparable(query, candidate, [{ queryIndex: 2, candidateIndex: 4 }, { queryIndex: 3, candidateIndex: 5 }]);
    expect(result).toMatchObject({ applicable: true, support: 1, conflicts: 0 });
    expect(result.details[0]).toMatchObject({ queryIndex: 3, candidateIndex: 5 });
  });

  it('is deterministic, rejects invalid mappings, and does not mutate analyses or pairs', () => {
    const query = analyzePhraseBoundaries(withRest()), candidate = analyzePhraseBoundaries(withRest());
    const mapping = [...pairs(6), { queryIndex: undefined, candidateIndex: 3 }, { queryIndex: -1, candidateIndex: 2 }];
    const original = structuredClone({ query, candidate, mapping });
    const result = comparePhraseBoundaries(query, candidate, mapping);
    expect(comparePhraseBoundaries(query, candidate, mapping)).toEqual(result);
    expect({ query, candidate, mapping }).toEqual(original);
  });
});
