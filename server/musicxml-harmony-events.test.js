import {describe,expect,it} from 'vitest';
import {musicXmlHarmonyStreams} from './musicxml-harmony-events.mjs';

describe('MusicXML boundary-harmony event adapter',()=>{
  it('preserves chord members and a barline tie continuation on the shared quarter timeline',()=>{
    const xml=`<score-partwise><part id="P1"><measure number="1"><attributes><divisions>2</divisions></attributes><note><pitch><step>A</step><octave>3</octave></pitch><duration>1</duration><tie type="start"/><voice>1</voice><staff>1</staff></note></measure><measure number="2"><note><pitch><step>A</step><octave>3</octave></pitch><duration>4</duration><tie type="stop"/><voice>1</voice><staff>1</staff></note></measure></part><part id="P2"><measure number="1"><attributes><divisions>2</divisions></attributes><forward><duration>1</duration></forward></measure><measure number="2"><note><pitch><step>D</step><octave>3</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note><note><chord/><pitch><step>F</step><alter>1</alter><octave>3</octave></pitch><duration>4</duration><staff>1</staff></note><note><chord/><pitch><step>A</step><octave>3</octave></pitch><duration>4</duration><staff>1</staff></note></measure></part></score-partwise>`;
    const events=musicXmlHarmonyStreams(xml).flatMap(stream=>stream.notes);
    expect(events.filter(note=>note.m===2&&note.o===.5).map(note=>note.p).sort((a,b)=>a-b)).toEqual([50,54,57,57]);
    expect(events.find(note=>note.m===2&&note.p===57&&note.te)).toBeTruthy();
  });
});
