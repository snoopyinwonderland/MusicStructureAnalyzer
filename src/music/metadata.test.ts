import { expect, it } from 'vitest';
import { displayArtist } from './metadata';
it('repairs names in previously cached melody results without changing valid names',()=>{
 expect(displayArtist('Composed by Claude-Michel Sch鰊berg')).toBe('Composed by Claude-Michel Schönberg');
 expect(displayArtist('Claude-Michel Schönberg')).toBe('Claude-Michel Schönberg');
 expect(displayArtist('山田耕筰')).toBe('山田耕筰');
});
