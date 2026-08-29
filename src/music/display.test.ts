import { describe, expect, it } from 'vitest';
import type { CorpusNote } from '../types';
import { collapseTies } from '../search/features';
import { withMeasureRests } from './display';

describe('excerpt playback events', () => {
  it('recombines notation-only tie pieces into one sounding attack', () => {
    const note = { id: 'long', kind: 'note', pitchMidi: 62, spelling: 'D4', durationRatio: 2, measure: 1, beat: 4, metricStrength: .5, structuralSalience: .5, structuralConfidence: .5, chordRole: 'unknown', meterCount: 4 } as CorpusNote & { meterCount: number };
    const displayed = withMeasureRests([note]);
    expect(displayed.filter(event => event.kind === 'note')).toHaveLength(2);
    const sounded = collapseTies(displayed);
    expect(sounded.filter(event => event.kind === 'note')).toHaveLength(1);
    expect(sounded.find(event => event.kind === 'note')?.durationRatio).toBe(2);
  });
});
