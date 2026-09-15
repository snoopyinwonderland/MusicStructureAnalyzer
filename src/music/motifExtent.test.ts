import {describe,it,expect} from 'vitest';
import {projectedMotifEnd,rhythmCellStart} from './motifExtent';

const gesture = (duration=2.5,gap=1) => [
  ...Array.from({length:7},(_,i)=>({onset:i*.5,durationRatio:.5})),
  {onset:3.5,durationRatio:duration},
  {onset:3.5+duration+gap,durationRatio:.5},
  {onset:4+duration+gap,durationRatio:.5},
];

describe('projected motif complete extent',()=>{
  it('stops at the sustained arrival before silence, preserving its duration',()=>{
    const notes=gesture(),before=JSON.stringify(notes);
    expect(projectedMotifEnd(notes,0,8)).toBe(7);
    expect(JSON.stringify(notes)).toBe(before);
  });
  it('accepts a varied terminal duration without extending into the next gesture',()=>{
    expect(projectedMotifEnd(gesture(1.5),0,8)).toBe(7);
  });
  it('does not trim for a gap without a sustained arrival',()=>{
    expect(projectedMotifEnd(gesture(.5),0,8)).toBe(9);
  });
  it('does not trim a sustained note without sufficient silence',()=>{
    expect(projectedMotifEnd(gesture(2.5,.25),0,8)).toBe(9);
  });
  it('does not interpret tie continuation as silence or a new attack',()=>{
    const notes=gesture();
    notes.splice(8,0,{onset:6,durationRatio:1,isAttack:false,tieStop:true} as typeof notes[number]);
    expect(projectedMotifEnd(notes,0,8)).toBe(10);
  });
  it('ignores explicit rests as attack endpoints',()=>{
    const notes=[...gesture().slice(0,8),{onset:6,durationRatio:1,kind:'rest'}];
    expect(projectedMotifEnd(notes,0,8)).toBe(7);
  });
  it('preserves half-open time bounds and handles empty windows',()=>{
    expect(projectedMotifEnd(gesture(),0,3.5)).toBe(6);
    expect(projectedMotifEnd([],0,8)).toBeNull();
  });
});

describe('rhythm cell pickup completeness',()=>{
  const notes=()=>[{onset:0,durationRatio:1},...Array.from({length:6},(_,i)=>({onset:2+i*.5,durationRatio:.5})),{onset:5,durationRatio:2.5}];
  it('includes a contiguous short prefix after a rest gap',()=>{
    expect(rhythmCellStart(notes(),3,7)).toBe(1);
  });
  it('does not claim notes already owned by another candidate',()=>{
    expect(rhythmCellStart(notes(),3,7,[{startIndex:1,endIndex:2}])).toBe(3);
  });
  it('does not extend a rhythm cell inside a complete motif',()=>{
    expect(rhythmCellStart(notes(),3,7,[{startIndex:1,endIndex:7}])).toBe(3);
  });
  it('requires an external start anchor rather than just adjacency',()=>{
    const n=notes();n[0].durationRatio=2;
    expect(rhythmCellStart(n,3,7)).toBe(3);
  });
  it('never crosses a gap inside the proposed pickup',()=>{
    const n=notes();n[2].durationRatio=.25;
    expect(rhythmCellStart(n,3,7)).toBe(3);
  });
  it('allows a short pickup at score start',()=>{
    expect(rhythmCellStart(notes().slice(1),2,6)).toBe(0);
  });
  it('does not absorb a long preceding arrival',()=>{
    const n=notes();n[2].durationRatio=1;
    expect(rhythmCellStart(n,3,7)).toBe(3);
  });
  it('does not extend an unanchored run beyond the search limit',()=>{
    const n=Array.from({length:12},(_,i)=>({onset:i*.5,durationRatio:.5}));
    expect(rhythmCellStart(n,6,11)).toBe(6);
  });
});
