import {describe,it,expect} from 'vitest';
import {summarizeMotifFamilies} from './motifFamilies';
describe('structure-derived Motif family summary',()=>{
  it('deduplicates occurrences and overlapping attacks while preserving variants',()=>{
    const notes=Array.from({length:10},(_,i)=>({id:`n${i}`,kind:'note',pitchMidi:60+i,durationRatio:1,onset:i,measure:1})) as any;
    notes[2].tieStop=true;
    const span=(start:number,end:number,variantIndex:number,motifNumber:number)=>({familyNumber:1,variantIndex,motifNumber,label:`Motif 1-${variantIndex+1}`,startIndex:start,endIndex:end,startNote:notes[start],endNote:notes[end]}) as any;
    const a=span(0,4,0,1),b=span(3,6,1,2);
    const result=summarizeMotifFamilies(notes,[a,b,a]);
    expect(result[0]).toMatchObject({count:2,coveredAttacks:6,totalAttacks:9});
    expect(result[0].coveragePercent).toBeCloseTo(100*6/9);
    expect(result[0].variants.map(v=>[v.label,v.count])).toEqual([['Motif 1-1',1],['Motif 1-2',1]]);
  });
  it('preserves internal rests in representative queries without mutating source',()=>{
    const notes=[{id:'a',kind:'note',pitchMidi:60,onset:0,durationRatio:1,measure:1},{id:'b',kind:'note',pitchMidi:62,onset:2,durationRatio:1,measure:1}] as any;
    const span={familyNumber:1,variantIndex:0,motifNumber:1,label:'Motif 1-1',startIndex:0,endIndex:1,startNote:notes[0],endNote:notes[1]} as any;
    const result=summarizeMotifFamilies(notes,[span])[0].variants[0];
    expect(result.events.map(e=>[e.kind,e.durationRatio])).toEqual([['note',1],['rest',1],['note',1]]);
    expect(notes).toHaveLength(2); expect(result.events[0]).not.toBe(notes[0]);
    expect(summarizeMotifFamilies([],[])).toEqual([]);
  });
});
