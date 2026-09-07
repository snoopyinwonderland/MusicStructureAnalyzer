import { describe, expect, it } from 'vitest';
import { rhythmGlyph } from './rhythmGlyph';

const event=(kind:'note'|'rest',durationRatio:number,writtenDuration?:number)=>({id:'x',kind,pitchMidi:kind==='note'?60:null,durationRatio,writtenDuration});
describe('rhythm-only notation glyphs',()=>{
  it('shows distinct written note values',()=>{expect(rhythmGlyph(event('note',1))).toBe('𝅘𝅥');expect(rhythmGlyph(event('note',.5))).toBe('𝅘𝅥𝅮');expect(rhythmGlyph(event('note',.25))).toBe('𝅘𝅥𝅯')});
  it('shows dotted and rest values',()=>{expect(rhythmGlyph(event('note',.75))).toBe('𝅘𝅥𝅮·');expect(rhythmGlyph(event('rest',.5))).toBe('𝄾')});
  it('uses the written tuplet value',()=>{expect(rhythmGlyph(event('note',1/3,.5))).toBe('𝅘𝅥𝅮')});
});
