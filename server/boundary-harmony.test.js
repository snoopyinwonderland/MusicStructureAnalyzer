import {describe,expect,it} from 'vitest';
import {analyzeBoundaryHarmony} from './boundary-harmony.mjs';

const chord=(onset,pitches,duration=1,measure=1,beat=1)=>pitches.map((p,index)=>({p,o:onset,d:duration,m:measure,b:beat,s:String(p),voice:index}));
const stream=notes=>({streamId:'P1:1:1',notes});
const boundary=(index,strength=.9)=>({index,supported:true,strength,cues:[{name:'observed-gap',strength:.8}]});

describe('boundary-focused harmony and cadence',()=>{
  it('proposes a C-major authentic cadence only from the harmonic window',()=>{
    const notes=[...chord(0,[55,59,62],1,1,1),...chord(1,[48,52,55],1,1,2),...chord(2,[57,60,64],1,2,1)];
    const melody=[{o:0,p:62,d:1},{o:1,p:60,d:1},{o:2,p:64,d:1}];
    const result=analyzeBoundaryHarmony({melodyNotes:melody,boundaries:[boundary(2)],streams:[stream(notes)],keyFifths:0});
    expect(result.scope).toBe('phrase-boundary-windows-only');
    expect(result.records[0].harmonyProgression.display).toContain('G');
    expect(result.records[0].harmonyProgression.display).toContain('C');
    expect(result.records[0].harmonyProgression.romanDisplay).toBe('V → I | vi');
    expect(['PAC','IAC']).toContain(result.records[0].cadenceHypotheses[0].type);
    expect(result.records[0].cadenceHypotheses[0].evidence.length).toBeGreaterThan(3);
  });

  it('does not invent a cadence from sparse monophony',()=>{
    const melody=[{o:0,p:60,d:1},{o:2,p:62,d:1}];
    const result=analyzeBoundaryHarmony({melodyNotes:melody,boundaries:[boundary(1)],streams:[stream(melody)],keyFifths:0});
    expect(result.records[0].status).toBe('insufficient_evidence');
    expect(result.records[0].selectedCadence).toBeNull();
  });

  it('keeps a missing third explicitly ambiguous',()=>{
    const melody=[{o:0,p:57,d:1},{o:0,p:64,d:1},{o:2,p:60,d:1}];
    const result=analyzeBoundaryHarmony({melodyNotes:melody,boundaries:[boundary(2)],streams:[stream(melody)],keyFifths:0});
    expect(result.records[0].observed.arrival.label).toContain('(no3)');
  });

  it('does not reuse a stale arrival harmony at a much later boundary',()=>{
    const notes=[...chord(0,[55,59,62],1),...chord(1,[48,52,55],1)];
    const melody=[{o:0,p:62,d:1},{o:1,p:60,d:1},{o:8,p:64,d:1}];
    const result=analyzeBoundaryHarmony({melodyNotes:melody,boundaries:[boundary(2)],streams:[stream(notes)],keyFifths:0});
    expect(result.records[0].status).toBe('insufficient_evidence');
    expect(result.records[0].selectedCadence).toBeNull();
  });

  it('uses the harmony governing a held terminal sounding event instead of a shorter late surface sonority',()=>{
    const notes=[...chord(1,[48,52,55],2,1,2),...chord(3,[55,59,62],1,1,4),...chord(4,[48,52,55],1,2,1)];
    const melody=[{o:0,p:64,d:1},{o:1,p:60,d:3,tm:2},{o:4,p:64,d:1}];
    const result=analyzeBoundaryHarmony({melodyNotes:melody,boundaries:[boundary(2)],streams:[stream(notes)],keyFifths:0});
    expect(result.records[0].scope.arrivalSelection).toBe('max-overlap-with-terminal-sounding-event');
    expect(result.records[0].harmonyProgression.arrivalRoman).toBe('I');
    expect(result.records[0].observed.terminalHarmonyCandidates.length).toBeGreaterThan(1);
  });

  it('uses the complete vertical chord at a tied terminal note continuation onset',()=>{
    const melodyStream=[{p:57,o:1,d:1,m:1,b:4,ts:true},{p:57,o:2,d:1,m:2,b:1,te:true}],accompaniment=[...chord(2,[50,54,57],1,2,1),...chord(3,[55,57],1,2,3)];
    const melody=[{o:0,p:62,d:1,m:1},{o:1,p:57,d:2,m:1,tm:2},{o:4,p:66,d:1,m:3}];
    const result=analyzeBoundaryHarmony({melodyNotes:melody,boundaries:[boundary(2)],streams:[stream(melodyStream),{streamId:'P2:1:1',notes:accompaniment}],keyFifths:2});
    expect(result.records[0].scope.arrivalSelection).toBe('tie-continuation-onset');
    expect(result.records[0].harmonyProgression.arrivalRoman).toBe('I');
    expect(result.records[0].observed.terminalMelodySpan.tieContinuationOnset).toBe(2);
  });

  it('ignores unsupported boundaries',()=>{
    const result=analyzeBoundaryHarmony({melodyNotes:[{o:0,p:60,d:1}],boundaries:[{...boundary(0),supported:false}],streams:[]});
    expect(result.records).toEqual([]);
  });
});
