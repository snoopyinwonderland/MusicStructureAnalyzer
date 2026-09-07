import { describe, expect, it } from 'vitest';
import { parseMeterTimeline, meterFromTimeline } from './search-api.mjs';

describe('cached meter timeline',()=>{
 it('preserves pickup, inherited meter and later compound meter changes',()=>{
  const q=String.fromCharCode(34);
  const xml=`<measure number=${q}0${q}><attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes></measure><measure number=${q}1${q}><note><time-modification><actual-notes>3</actual-notes></time-modification></note></measure><measure number=${q}2${q}><attributes><time><beats>6</beats><beat-type>8</beat-type></time></attributes></measure>`;
  const timeline=parseMeterTimeline(xml);
  expect(timeline).toHaveLength(3);
  expect(meterFromTimeline(timeline,0)).toEqual({count:3,unit:4});
  expect(meterFromTimeline(timeline,1)).toEqual({count:3,unit:4});
  expect(meterFromTimeline(timeline,2)).toEqual({count:6,unit:8});
 });
 it('keeps the default when no meter is available',()=>{expect(meterFromTimeline([],5)).toEqual({count:4,unit:4})});
});
