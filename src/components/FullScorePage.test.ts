import { describe, expect, it } from 'vitest';
import type { CorpusNote } from '../types';
import { buildMotifSpans, buildPhraseSpans, harmonyRomanParts, jumpByMeasures, motifSearchEstimate, motifSimilarityEvidence, notePitchAndValue, noteValueLabel, phraseEndingBoundaryIndex, phraseRangeLabel, playbackMatchRange, usesCampaniaAnalysisFont } from './FullScorePage';

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
    expect(phraseRangeLabel(spans[0])).toBe('Phrase 1 · 1마디 · C4(4분음표) → C♯4(4분음표)');
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

  it('maps a clicked Phrase number to its ending boundary independently of rendered pages',()=>{
    const boundaries=[boundary(2),boundary(4,false),boundary(5)];
    expect(phraseEndingBoundaryIndex(1,boundaries)).toBe(2);
    expect(phraseEndingBoundaryIndex(2,boundaries)).toBe(5);
  });

  it('shows readable note values and marks a tied duration without using the analysis font',()=>{
    const eighth={...note(0,66,1),spelling:'F#4',durationRatio:.5};
    const tied={...note(1,69,1),spelling:'A4',durationRatio:5,tieEndMeasure:2};
    expect(notePitchAndValue(eighth)).toBe('F#4(8분음표)');
    expect(noteValueLabel(tied)).toBe('5박·타이 지속');
  });
});

describe('boundary harmony display semantics',()=>{
  it('separates preparation, phrase-ending arrival, and the next phrase onset',()=>{
    const record={harmonyProgression:{display:'A → B7 | A',romanDisplay:'I → II7 | I',preparationRoman:'I',arrivalRoman:'II7',afterBoundaryRoman:'I'}} as any;
    expect(harmonyRomanParts(record)).toEqual({preparation:'I',arrival:'II7',afterBoundary:'I'});
  });

  it('keeps the Campania eligibility helper away from unknown values',()=>{
    expect(usesCampaniaAnalysisFont('F#4')).toBe(true);
    expect(usesCampaniaAnalysisFont('Ab4')).toBe(true);
    expect(usesCampaniaAnalysisFont('V7')).toBe(true);
    expect(usesCampaniaAnalysisFont('unknown')).toBe(false);
    expect(usesCampaniaAnalysisFont(' UNKNOWN ')).toBe(false);
  });
});

describe('motif overlay spans',()=>{
  it('uses a learned motif-search estimate and bounds stale values',()=>{
    expect(motifSearchEstimate(10,null)).toBe(25);
    expect(motifSearchEstimate(10,7.2)).toBe(8);
    expect(motifSearchEstimate(10,999)).toBe(120);
  });

  it('labels a complete changed-ending occurrence as a variant in the same Motif family',()=>{
    const pitches=[60,61,62,63,64,65,67,68,69,70,71,73],notes=pitches.map((pitch,index)=>note(index,pitch,Math.floor(index/2)+1));
    const spans=buildMotifSpans(notes,[{length:4,signatureKey:'motif-a',previousIndex:0,currentIndex:6,distanceInAttacks:6,closeContinuation:true}]);
    expect(spans.map(span=>[span.label,span.startIndex,span.endIndex])).toEqual([['Motif 1-1',0,5],['Motif 1-2',6,11]]);
  });

  it('does not display a two-attack recurrence as a Motif',()=>{
    const notes=[0,1,2,3,4,5].map(index=>note(index,60+index,Math.floor(index/2)+1));
    const spans=buildMotifSpans(notes,[{length:2,signatureKey:'motif-a',previousIndex:0,currentIndex:4,distanceInAttacks:4,closeContinuation:false}]);
    expect(spans).toEqual([]);
  });

  it('retains a distant four-attack recurrence as a reviewable reappearance',()=>{
    const notes=[0,1,2,3,4,5,6,7].map(index=>note(index,60+index,Math.floor(index/2)+1));
    const spans=buildMotifSpans(notes,[{length:4,signatureKey:'motif-a',previousIndex:0,currentIndex:4,distanceInAttacks:4,closeContinuation:false}]);
    expect(spans).toHaveLength(2);
    expect(spans[1].familyNumber).toBe(spans[0].familyNumber);
  });

  it('uses Phrase-frame boundaries to extend an exact core through a varied long arrival and emits its answer',()=>{
    const pitches=[60,60,61,62,64,64,62,61,62,59,59,59,59,61,61,65,64,61,61,61,62,64,64,62,61,62,59,59,59,59,64,61];
    const notes=pitches.map((pitch,index)=>note(index,pitch,Math.floor(index/4)+1));
    notes[8].durationRatio=2;notes[25].durationRatio=3;
    const relations=[{length:6,signatureKey:'shared-exact-core',previousIndex:2,currentIndex:19,distanceInAttacks:17,closeContinuation:false}];
    const frames=[
      {signatureKey:'shared-exact-core',frameStartIndex:0,motifCoreIndex:2,internalBoundaryIndex:9,frameEndIndex:15},
      {signatureKey:'shared-exact-core',frameStartIndex:15,motifCoreIndex:19,internalBoundaryIndex:26,frameEndIndex:32},
    ];
    const spans=buildMotifSpans(notes,relations,[],[],frames);
    expect(spans.filter(span=>[2,9,19,26].includes(span.startIndex)).map(span=>[span.startIndex,span.endIndex])).toEqual([[2,8],[9,14],[19,25],[26,31]]);
    expect(spans.find(span=>span.startIndex===2)?.familyNumber).toBe(spans.find(span=>span.startIndex===19)?.familyNumber);
  });

  it('compares transposition-invariant melodic shape and normalized rhythm',()=>{
    const left=[note(0,60,1),note(1,62,1),note(2,65,1),note(3,64,1)];
    const transposed=[note(0,65,1),note(1,67,1),note(2,70,1),note(3,69,1)];
    expect(motifSimilarityEvidence(left,transposed)).toMatchObject({similarity:100,melodic:100,interval:100,contour:100,shape:100,rhythm:100,coverage:100,transformations:['transposition']});
  });

  it('does not turn a shared rhythm-family proposal into shared Motif identity',()=>{
    const pitches=[60,62,64,65,67,60,67,60,67,60],notes=pitches.map((pitch,index)=>note(index,pitch,index<5?1:2));
    const cells=[
      {startIndex:0,endIndex:4,attackCount:5,rhythmFamily:'four-short-plus-long-arrival',rhythmVariant:'straight'},
      {startIndex:5,endIndex:9,attackCount:5,rhythmFamily:'four-short-plus-long-arrival',rhythmVariant:'straight'},
    ];
    const spans=buildMotifSpans(notes,[],[],cells);
    expect(spans.map(span=>[span.label,span.familyNumber])).toEqual([['Motif 1-1',1],['Motif 2-1',2]]);
  });

  it('keeps an ornamented variation close while exposing insertion and coverage evidence',()=>{
    const left=[note(0,60,1),note(1,62,1),note(2,65,1),note(3,64,1),note(4,60,2)];
    const varied=[note(0,67,1),note(1,69,1),note(1.5,70,1),note(2,72,1),note(3,71,1),note(4,67,2)];
    varied[2].durationRatio=.5;
    const evidence=motifSimilarityEvidence(left,varied);
    expect(evidence.similarity).toBeGreaterThanOrEqual(75);
    expect(evidence.transformations).toContain('ornament-insertion');
    expect(evidence.coverage).toBe(83);
  });

  it('recognizes terminal duration change without losing melodic identity',()=>{
    const left=[note(0,60,1),note(1,62,1),note(2,64,1),note(3,65,1)];
    const varied=[note(0,67,1),note(1,69,1),note(2,71,1),note(3,72,1)];
    left.at(-1)!.durationRatio=2;varied.at(-1)!.durationRatio=3;
    const evidence=motifSimilarityEvidence(left,varied);
    expect(evidence.melodic).toBe(100);
    expect(evidence.transformations).toContain('terminal-extension');
  });

  it('projects the complete prototype extent onto a distant recurrence instead of the matched signature length',()=>{
    const notes=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].map(index=>note(index,60+index%6,Math.floor(index/4)+1));
    const relations=[
      {length:4,signatureKey:'close',previousIndex:0,currentIndex:6,distanceInAttacks:6,closeContinuation:true},
      {length:5,signatureKey:'distant',previousIndex:0,currentIndex:10,distanceInAttacks:10,closeContinuation:false},
    ];
    const spans=buildMotifSpans(notes,relations);
    expect(spans.find(span=>span.startIndex===0)?.endIndex).toBe(5);
    expect(spans.find(span=>span.startIndex===10)?.endIndex).toBe(15);
  });

  it('uses parallel relation cells, not Phrase endpoints, to bound repeated Motif variants',()=>{
    const notes=Array.from({length:40},(_,index)=>note(index,[60,62,64,65,67,69,71,72][index%8],Math.floor(index/4)+1));
    const relations=[
      {length:8,signatureKey:'left',previousIndex:4,currentIndex:24,distanceInAttacks:20,closeContinuation:false},
      {length:4,signatureKey:'right',previousIndex:8,currentIndex:28,distanceInAttacks:20,closeContinuation:false},
    ];
    const misleadingPhraseSpans=buildPhraseSpans(notes,[{index:4,supported:true},{index:12,supported:true},{index:24,supported:true},{index:32,supported:true}] as any);
    const spans=buildMotifSpans(notes,relations,misleadingPhraseSpans);
    expect(spans.filter(span=>[4,8,24,28].includes(span.startIndex)).map(span=>[span.startIndex,span.endIndex])).toEqual([[4,7],[8,15],[24,27],[28,35]]);
  });

  it('keeps an established local prototype shorter than a broader parallel match',()=>{
    const notes=Array.from({length:40},(_,index)=>note(index,[66,64,67,66,62,57][index%6],Math.floor(index/4)+1));
    const relations=[
      {length:4,signatureKey:'local',previousIndex:6,currentIndex:13,distanceInAttacks:7,closeContinuation:true},
      {length:5,signatureKey:'left',previousIndex:0,currentIndex:20,distanceInAttacks:20,closeContinuation:false},
      {length:8,signatureKey:'right',previousIndex:6,currentIndex:26,distanceInAttacks:20,closeContinuation:false},
    ];
    const spans=buildMotifSpans(notes,relations,[]);
    expect(spans.find(span=>span.startIndex===6)?.endIndex).toBe(12);
    expect(spans.find(span=>span.startIndex===26)?.endIndex).toBe(32);
  });

  it('keeps the parallel Motif attack extent independent while its terminal note may be tied',()=>{
    const notes=Array.from({length:40},(_,index)=>note(index,60+index%5,Math.floor(index/4)+1));
    for(const [held,attack] of [[15,16],[35,36]]){notes[held].pitchMidi=66;notes[attack].pitchMidi=66;Object.assign(notes[held],{tieEndMeasure:Number(notes[held].measure)+1,durationRatio:1})}
    const relations=[
      {length:8,signatureKey:'left',previousIndex:4,currentIndex:24,distanceInAttacks:20,closeContinuation:false},
      {length:4,signatureKey:'right',previousIndex:8,currentIndex:28,distanceInAttacks:20,closeContinuation:false},
    ];
    const spans=buildMotifSpans(notes,relations,[]);
    expect(spans.find(span=>span.startIndex===8)?.endIndex).toBe(15);
    expect(spans.find(span=>span.startIndex===28)?.endIndex).toBe(35);
  });

  it('does not invent Motifs from short Phrase spans without recurrence evidence',()=>{
    const notes=Array.from({length:8},(_,index)=>note(index,60+index,index<4?1:2));
    const phraseSpans=buildPhraseSpans(notes,[{index:4,supported:true}] as any);
    expect(buildMotifSpans(notes,[],phraseSpans)).toEqual([]);
  });
});
