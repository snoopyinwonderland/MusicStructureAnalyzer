import type { QueryEvent } from '../types';

const NOTE_GLYPHS: Record<string,string> = { '4':'𝅝', '2':'𝅗𝅥', '1':'𝅘𝅥', '0.5':'𝅘𝅥𝅮', '0.25':'𝅘𝅥𝅯', '0.125':'𝅘𝅥𝅰', '0.0625':'𝅘𝅥𝅱' };
const REST_GLYPHS: Record<string,string> = { '4':'𝄻', '2':'𝄼', '1':'𝄽', '0.5':'𝄾', '0.25':'𝄿', '0.125':'𝅀', '0.0625':'𝅁' };

export function rhythmGlyph(event: QueryEvent) {
  const written=event.writtenDuration??event.durationRatio,dotted=[.75,1.5,3].includes(written),base=dotted?written/1.5:written,key=String(base),glyph=(event.kind==='rest'?REST_GLYPHS:NOTE_GLYPHS)[key]||(event.kind==='rest'?'𝄽':'𝅘𝅥');
  return `${glyph}${dotted?'·':''}`;
}
