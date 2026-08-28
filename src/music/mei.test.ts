import { describe,expect,it } from 'vitest';
import type { Query } from '../types';
import { toMEI } from './mei';
const query=(durationRatio:number):Query=>({version:1,mode:'melody_rhythm',meter:'4/4',startsOnDownbeat:true,events:[{id:'q1',kind:'note',pitchMidi:60,durationRatio}]});
describe('MEI note values',()=>{it.each([[.0625,'64',false],[.125,'32',false],[.25,'16',false],[.5,'8',false],[1,'4',false],[1.5,'4',true],[2,'2',false],[3,'2',true],[4,'1',false]])('%s beat maps to a notation value',(beats,dur,dotted)=>{const mei=toMEI(query(beats as number));expect(mei).toContain(`dur="${dur}"`);expect(mei.includes('dots="1"')).toBe(dotted)});it('writes a tie between selected notes',()=>{const q=query(1);q.events.push({...q.events[0],id:'q2',durationRatio:1.5});q.events=q.events.map(e=>({...e,tieGroup:'t1'}));expect(toMEI(q)).toContain('<tie startid="#q1" endid="#q2"/>')});});
