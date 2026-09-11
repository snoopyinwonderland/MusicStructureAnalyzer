import { describe, expect, it } from 'vitest';
import type { CorpusNote } from '../types';
import { buildPhraseSpans, jumpByMeasures, phraseRangeLabel, playbackMatchRange } from './FullScorePage';

const note=(onset:number,pitchMidi:number,measureOrdinal:number)=>({onset,pitchMidi,measureOrdinal,measure:measureOrdinal,kind:'note',durationRatio:1} as CorpusNote);

describe('full score playback navigation',()=>{
  const notes=[note(0,60,1),note(1,62,1),note(4,64,2),note(8,65,3),note(12,67,4),note(16,69,5),note(20,71,6)];

  it('maps the highlighted search notes onto playback indices',()=>{
    expect(playbackMatchRange(notes,[notes[2],notes[4]])).toEqual({first:2,last:4});
  });

  it('jumps by MusicXML measure order and clamps at either end',()=>{
    expect(jumpByMeasures(notes,2,1)).toBe(3);
    expect(jumpByMeasures(notes,3,-1)).toBe(2);
    expect(jumpByMeasures(notes,2,5)).toBe(6);
    expect(jumpByMeasures(notes,2,-5)).toBe(0);
  });
});

describe('phrase range visualization',()=>{
  const notes=[0,1,2,3,4,5,6].map(index=>note(index,60+index,index<3?1:2));
  const boundary=(index:number,supported=true)=>({index,supported,strength:.8,reliable:true,state:'boundary',continuity:0,cues:[]} as any);

  it('uses non-overlapping [start,end) boundary semantics from the first through last note',()=>{
    const spans=buildPhraseSpans(notes,[boundary(2),boundary(5)]);
    expect(spans.map(span=>[span.startIndex,span.endIndex])).toEqual([[0,1],[2,4],[5,6]]);
    expect(spans.map(span=>[span.sharedStart,span.sharedEnd])).toEqual([[false,false],[false,false],[false,false]]);
    expect(phraseRangeLabel(spans[0])).toBe('Phrase 1 · 1마디 · C4 → C♯4');
  });

  it('ignores unsupported and endpoint boundaries',()=>{
    expect(buildPhraseSpans(notes,[boundary(0),boundary(3,false),boundary(6)])).toHaveLength(1);
  });

  it('includes silent measures in the displayed range up to a beat-one boundary',()=>{
    const sparse=[note(0,60,1),note(4,62,4),note(40,64,11),note(41,65,11)];
    Object.assign(sparse[2],{beat:1});
    const spans=buildPhraseSpans(sparse,[boundary(2)]);
    expect(spans[0]).toMatchObject({startMeasure:1,endMeasure:10,endPitch:'D4'});
    expect(spans[1]).toMatchObject({startMeasure:11,endMeasure:11,startPitch:'E4'});
  });
});
