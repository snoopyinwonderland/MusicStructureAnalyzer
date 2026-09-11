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

  it('ignores unsupported boundaries',()=>{
    const result=analyzeBoundaryHarmony({melodyNotes:[{o:0,p:60,d:1}],boundaries:[{...boundary(0),supported:false}],streams:[]});
    expect(result.records).toEqual([]);
  });
});
