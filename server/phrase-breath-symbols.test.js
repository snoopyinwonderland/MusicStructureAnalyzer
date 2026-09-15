import {it,expect} from 'vitest';
import {attachBreathSymbols,applyBreathSymbolEvidence} from './phrase-breath-symbols.mjs';
it('preserves a notated symbol in the right voice and carries it over a tied segment',()=>{
 const xml='<score-partwise><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><notations><fermata>normal</fermata></notations></note></measure></part></score-partwise>';
 const notes=attachBreathSymbols([{pitchMidi:60,measureOrdinal:1,beat:1},{pitchMidi:60,tieStop:true},{pitchMidi:62}],xml,'P1:1:1');
 const boundaries=notes.map(()=>({strength:0,cues:[]})); applyBreathSymbolEvidence(notes,boundaries);
 expect(boundaries[1].cues).toHaveLength(0);
 expect(boundaries[2].strength).toBe(.45);
 expect(boundaries[2].cues[0].evidence.source.measureOrdinal).toBe(1);
 expect(attachBreathSymbols([{pitchMidi:60,measureOrdinal:1,beat:1}],xml,'P1:1:2')[0].breathSymbols).toHaveLength(0);
});
