import { describe, expect, it } from 'vitest';
import type { QueryEvent } from '../types';
import { insertAfterSelection, stepSelectedDurations, transposeSelectedEvents } from './queryEdit';

const note = (id: string, pitchMidi: number, spelling: string, tieGroup?: string): QueryEvent => ({ id, kind: 'note', pitchMidi, spelling, durationRatio: 1, tieGroup });

describe('query pitch editing', () => {
  it('moves selected notes by one semitone and ignores rests', () => {
    const events: QueryEvent[] = [note('c', 60, 'C4'), { id: 'r', kind: 'rest', pitchMidi: null, durationRatio: 1 }];
    const result = transposeSelectedEvents(events, ['c', 'r'], 1);
    expect(result[0]).toMatchObject({ pitchMidi: 61, spelling: 'C♯4' });
    expect(result[1]).toEqual(events[1]);
  });

  it('preserves a flat spelling preference and moves an entire tie group', () => {
    const events = [note('a', 70, 'B♭4', 'tie'), note('b', 70, 'B♭4', 'tie')];
    const result = transposeSelectedEvents(events, ['a'], -1);
    expect(result.map(event => [event.pitchMidi, event.spelling])).toEqual([[69, 'A4'], [69, 'A4']]);
  });
});

describe('query insertion and group duration editing', () => {
  it('inserts after the last selected event so Undo can store one atomic edit', () => {
    const events = [note('a', 60, 'C4'), note('b', 62, 'D4'), note('c', 64, 'E4')];
    const rest: QueryEvent = { id: 'r', kind: 'rest', pitchMidi: null, durationRatio: 1 };
    expect(insertAfterSelection(events, ['b'], rest).map(event => event.id)).toEqual(['a', 'b', 'r', 'c']);
  });

  it('steps every selected duration by one notated value', () => {
    const events = [note('a', 60, 'C4'), note('b', 62, 'D4'), note('c', 64, 'E4')];
    events[0].durationRatio = .5; events[1].durationRatio = 1;
    const result = stepSelectedDurations(events, ['a', 'b'], 'a', [.25, .5, .75, 1, 1.5, 2], 1);
    expect(result.map(event => event.durationRatio)).toEqual([.75, 1.5, 1]);
  });
});
