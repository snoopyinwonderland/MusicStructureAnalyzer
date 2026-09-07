import {describe,it,expect} from 'vitest';
import {seedWindows} from './seed-windows.mjs';
describe('experimental seed windows',()=>{
  it('merges overlapping neighborhoods and clamps start',()=>{
    expect(seedWindows([['a\u00000',5],['a\u000010',4]],10)).toEqual([{position:0,start:0,end:30,evidence:5}]);
  });
  it('preserves distant seeds and skips redundant nearby seeds',()=>{
    expect(seedWindows([['a\u0000100',5],['a\u0000101',4],['a\u0000200',3]],10).map(w=>[w.start,w.end])).toEqual([[90,120],[190,220]]);
  });
  it('returns no windows without evidence',()=>expect(seedWindows([],10)).toEqual([]));
});
