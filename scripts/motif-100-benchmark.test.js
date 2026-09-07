import { describe, expect, it } from 'vitest';
import { buildCases, mutateEvents } from './motif-100-benchmark.mjs';

const events = [60, 62, 67, 65, 64, 69, 67, 72, 71, 69].map((pitchMidi, index) => ({ kind: 'note', pitchMidi, spelling: 'X', durationRatio: index % 3 ? .5 : 1 }));

describe('motif 100 benchmark generation', () => {
  it('changes exactly the requested musical dimension', () => {
    expect(mutateEvents(events, 'pitch', 0).filter((event, index) => event.pitchMidi !== events[index].pitchMidi)).toHaveLength(1);
    expect(Math.abs(mutateEvents(events, 'octave', 0)[4].pitchMidi - events[4].pitchMidi)).toBe(12);
    expect(mutateEvents(events, 'rhythm', 0).reduce((sum, event) => sum + event.durationRatio, 0)).toBeCloseTo(events.reduce((sum, event) => sum + event.durationRatio, 0));
    expect(mutateEvents(events, 'rest', 0).some(event => event.kind === 'rest')).toBe(true);
  });

  it('creates five deterministic variants for every base', () => {
    const notes = events.map((event, index) => ({ p: event.pitchMidi, s: event.spelling, d: event.durationRatio, o: index, m: 1 + Math.floor(index / 4), b: index % 4 + 1 }));
    const base = { row: { id: 'w', source: 'x.xml', stream_id: 'P1:1:1', title: 'T', composer: 'C', role: .9 }, notes, meter: '4/4', startsStrong: true, score: 80, occurrenceCount: 2, boundaryGap: 1, family: 'MusicXML', partName: 'Violin', start: 0 };
    const cases = buildCases([base]);
    expect(cases).toHaveLength(5);
    expect(new Set(cases.map(item => item.mutation.kind)).size).toBe(5);
  });
});
