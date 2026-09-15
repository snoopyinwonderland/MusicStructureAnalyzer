import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildMotifSpans} from './FullScorePage';
import {positionedXmlNotes} from '../../server/xml-target-verification.mjs';
it('inspects preserved structure review without changing the source',()=>{
 const {work:w}=JSON.parse(readFileSync('evaluation/case-assets/S-STRUCT-004/review-snapshot.json','utf8'));
 const a=w.phraseAnalysis;
 const spans=buildMotifSpans(w.notes,a.motifRelations,[],a.motifCells,a.recurringMotifPhraseFrames?.frames);
 expect(spans.some(s=>s.startIndex===0&&s.endIndex===7)).toBe(true);
 expect(spans.find(s=>s.startIndex===8)?.endIndex).toBe(15);
 expect(w.notes[15].spelling).toBe('D#5');
 expect(w.notes[15].tieEndMeasure).toBe(8);
 expect(spans.some(s=>s.startIndex===3&&s.endIndex===7)).toBe(false);
 expect(spans[0].containedFragments.some(f=>f.startIndex===3&&f.endIndex===7)).toBe(true);
 const xml=readFileSync('evaluation/case-assets/S-STRUCT-004/context.musicxml','utf8');
 expect(positionedXmlNotes(xml,w.streamId).filter(n=>/<fermata\b/.test(n.block)).map(n=>n.measureOrdinal)).toEqual([89,89]);
 expect(spans.length).toBeGreaterThan(0);
});
