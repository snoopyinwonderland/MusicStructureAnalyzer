import {expect,it} from 'vitest';
import {expandEmptyMeasures,restrictedPreviewXml} from './search-api.mjs';
it('preserves empty measure ordinals without swallowing the following measure',()=>{
 const xml='<score-partwise><part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions></attributes></measure><measure number="2" /><measure number="3"/><measure number="4"><note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration></note></measure></part></score-partwise>';
 const normalized=expandEmptyMeasures(xml);
 expect(normalized.match(/<measure\b/g)).toHaveLength(4);
 expect(normalized.match(/<\/measure>/g)).toHaveLength(4);
 const excerpt=restrictedPreviewXml(normalized,'P1:1:1',4,4,0);
 expect(excerpt).toContain('number="4"');
 expect(excerpt).toContain('<step>E</step>');
 expect(excerpt).not.toContain('number="2"');
 expect(excerpt).toContain('<divisions>4</divisions>');
 expect(expandEmptyMeasures(normalized)).toBe(normalized);
 expect(expandEmptyMeasures('<measure-style/><rest measure="yes"/>')).toBe('<measure-style/><rest measure="yes"/>');
});
