import { describe, expect, it } from 'vitest';
import { parseQueryNotation, parseReportCases, pitchToMidi } from './import-query-100-report.mjs';

describe('query-100 report importer', () => {
  it('parses enharmonic spellings, rests, decimal values, and tied segments', () => {
    expect(pitchToMidi('Bb4')).toBe(70);
    expect(pitchToMidi('C#5')).toBe(73);
    const events = parseQueryNotation('Rest(0.5) Bb4(0.332) C#5(0.25)~ C#5(0.25)~', 'Q-X');
    expect(events.map(event => [event.kind, event.pitchMidi, event.durationRatio])).toEqual([['rest', null, .5], ['note', 70, .332], ['note', 73, .25], ['note', 73, .25]]);
    expect(events[2].tieGroup).toBe(events[3].tieGroup);
  });

  it('recognizes a multiline table row before enforcing the complete document count', () => {
    const row = '| **Q201** | **TRY EVERYTHING** | Composed by Sia\nArranged by Reflet | m14~18 | 2 | `F4(0.5) G4(1)` |';
    const [parsed] = parseReportCases(row, 1);
    expect(parsed).toMatchObject({ caseId: 'Q-R100-201', status: 'draft', tags: expect.arrayContaining(['modal-distortion']), query: { meter: 'unknown', startsOnDownbeat: null } });
    expect(parsed.expected).toMatchObject({ primaryTitles: ['TRY EVERYTHING'], reportedCredit: 'Composed by Sia Arranged by Reflet' });
  });
});
