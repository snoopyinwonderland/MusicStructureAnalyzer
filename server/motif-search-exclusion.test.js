import { describe, expect, it } from 'vitest';
import { normalizeYoutubeTitle, searchDatabase } from './search-api.mjs';

const notes=pitches=>pitches.map((pitchMidi,index)=>({id:String(index),kind:'note',pitchMidi,durationRatio:1}));

describe('Motif search exclusions',()=>{
  it('excludes the current work and every edition with the same normalized title',()=>{
    const events=notes([60,62,64,67]);
    const initial=searchDatabase({version:1,mode:'melody',meter:'4/4',startsOnDownbeat:true,events},5);
    const first=[...initial.exact,...initial.similar][0];
    expect(first).toBeTruthy();
    const filtered=searchDatabase({version:1,mode:'melody',meter:'4/4',startsOnDownbeat:true,events,excludeWorkIds:[first.work.workId],excludeTitle:first.work.title},20);
    expect([...filtered.exact,...filtered.similar].every(result=>result.work.workId!==first.work.workId&&normalizeYoutubeTitle(result.work.title)!==normalizeYoutubeTitle(first.work.title))).toBe(true);
  },15_000);
});
