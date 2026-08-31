import { describe,expect,it } from 'vitest';
import type { Query } from '../types';
import { toMEI } from './mei';
const query=(durationRatio:number):Query=>({version:1,mode:'melody_rhythm',meter:'4/4',startsOnDownbeat:true,events:[{id:'q1',kind:'note',pitchMidi:60,durationRatio}]});
describe('MEI note values',()=>{it.each([[.0625,'64',false],[.125,'32',false],[.25,'16',false],[.5,'8',false],[1,'4',false],[1.5,'4',true],[2,'2',false],[3,'2',true],[4,'1',false]])('%s beat maps to a notation value',(beats,dur,dotted)=>{const mei=toMEI(query(beats as number));expect(mei).toContain(`dur="${dur}"`);expect(mei.includes('dots="1"')).toBe(dotted)});it('writes visible tie roles directly on the selected notes',()=>{const q=query(1);q.events.push({...q.events[0],id:'q2',durationRatio:1.5});q.events=q.events.map(e=>({...e,tieGroup:'t1'}));const mei=toMEI(q);expect(mei).toContain('xml:id="q1" pname="c" oct="4" tie="i"');expect(mei).toContain('xml:id="q2" pname="c" oct="4" tie="t"')});});

describe('MEI accidental spelling',()=>{
 it('accepts Unicode sharp/flat spellings and restores a natural explicitly',()=>{const q:Query={version:1,mode:'melody_rhythm',meter:'4/4',startsOnDownbeat:true,events:[{id:'a',kind:'note',pitchMidi:70,spelling:'A♯4',durationRatio:.5},{id:'g-sharp',kind:'note',pitchMidi:68,spelling:'G♯4',durationRatio:1},{id:'g-natural',kind:'note',pitchMidi:67,spelling:'G4',durationRatio:1}]};const mei=toMEI(q);expect(mei).toContain('xml:id="a" pname="a" oct="4" accid="s"');expect(mei).toContain('xml:id="g-sharp" pname="g" oct="4" accid="s"');expect(mei).toContain('xml:id="g-natural" pname="g" oct="4" accid="n"')});
 it('preserves flat spelling for an enharmonic black key',()=>{const q:Query={version:1,mode:'melody_rhythm',meter:'4/4',startsOnDownbeat:true,events:[{id:'bb',kind:'note',pitchMidi:70,spelling:'B♭4',durationRatio:1}]};expect(toMEI(q)).toContain('pname="b" oct="4" accid="f"')});
});
