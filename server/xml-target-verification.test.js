import { describe, expect, it } from 'vitest';
import { markXmlTargets, positionedXmlNotes } from './xml-target-verification.mjs';

const xml = '<score-partwise><part-list/><part id="P1"><measure number="1"><attributes><divisions>4</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note><backup><duration>4</duration></backup><note><pitch><step>F</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><staff>2</staff></note></measure><measure number="2"><note><pitch><step>D</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>';

describe('MusicXML benchmark target verification', () => {
  it('tracks divisions, backup, staff, voice and measure ordinal', () => {
    const notes = positionedXmlNotes(xml, 'P1:1:1', 10);
    expect(notes.map(note => [note.measureOrdinal, note.beat, note.staff, note.voice, note.pitchMidi])).toEqual([[11, 1, '1', '1', 60], [11, 1, '2', '2', 53], [12, 1, '1', '1', 63]]);
  });

  it('marks only exact targets in the requested lane', () => {
    const result = markXmlTargets(xml, 'P1:1:1', [{ measureOrdinal: 1, beat: 1, pitchMidi: 60 }, { measureOrdinal: 1, beat: 1, pitchMidi: 53 }]);
    expect(result).toMatchObject({ requested: 2, resolved: 1, unresolved: 1 });
    expect(result.xml).toContain('id="benchmark-target-0" color="#c9473f"');
  });
});
