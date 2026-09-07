import { describe, expect, it } from 'vitest';
import { excerptMeasureIndexes, excerptOrdinalOffset, fullScoreLayout, tiedNoteChain, type TieChainEvent } from './FullXmlNotation';

const event = (value: string, overrides: Partial<Omit<TieChainEvent<string>, 'value'>> = {}): TieChainEvent<string> => ({
  value, partId: 'P3', staff: '1', voice: '1', measureOrdinal: 25, beat: 4, pitchMidi: 65, isRest: false, tieTypes: [], ...overrides,
});

describe('full score layout',()=>{
  it('uses a taller, smaller-scale page for five or more parts',()=>{
    expect(fullScoreLayout(4)).toEqual({pageWidth:1900,pageHeight:2700,scale:24});
    expect(fullScoreLayout(5)).toEqual({pageWidth:2100,pageHeight:3100,scale:21});
  });
});

describe('MusicXML excerpt measure selection', () => {
  it('uses absolute XML ordinals when printed measure numbers repeat', () => {
    const labels = [...Array(3)].flatMap(() => Array.from({ length: 20 }, (_, index) => String(index + 1)));
    expect(excerptMeasureIndexes(labels, 13, 15)).toHaveLength(9);
    expect(excerptMeasureIndexes(labels, 13, 15, 13, 15)).toEqual([12, 13, 14]);
  });
  it('retains the absolute ordinal origin after trimming a public excerpt', () => {
    expect(excerptOrdinalOffset([{ measureOrdinal: 8 }, { measureOrdinal: 9 }] as never)).toBe(7);
    expect(excerptOrdinalOffset([])).toBe(0);
  });
});

describe('MusicXML tie highlighting', () => {
  it('follows the source tie in its staff and voice, not an earlier competing-voice F4', () => {
    // 57982.xml: P3/staff 1/voice 1 m25 beat 4 ties into m26 beat 1.
    // The staff 2/voice 5 F4 at m25 beat 3 is later in DOM order after a backup.
    const sourceStart = event('m25-staff1-voice1', { tieTypes: ['start'] });
    const wrongVoice = event('m25-staff2-voice5', { staff: '2', voice: '5', beat: 3, tieTypes: ['stop'] });
    const sourceStop = event('m26-staff1-voice1', { measureOrdinal: 26, beat: 1, tieTypes: ['stop'] });
    expect(tiedNoteChain(sourceStart, [sourceStart, wrongVoice, sourceStop])).toEqual(['m25-staff1-voice1', 'm26-staff1-voice1']);
  });

  it('continues a stop-and-start tie chain at each next onset', () => {
    const start = event('start', { tieTypes: ['start'] });
    const middle = event('middle', { measureOrdinal: 26, beat: 1, tieTypes: ['stop', 'start'] });
    const end = event('end', { measureOrdinal: 27, beat: 1, tieTypes: ['stop'] });
    expect(tiedNoteChain(start, [start, middle, end])).toEqual(['start', 'middle', 'end']);
  });

  it('does not jump across a new attack, rest, or malformed continuation to a later stop', () => {
    const start = event('start', { tieTypes: ['start'] });
    const attack = event('attack', { measureOrdinal: 26, beat: 1 });
    const laterStop = event('later-stop', { measureOrdinal: 27, beat: 1, tieTypes: ['stop'] });
    const rest = event('rest', { measureOrdinal: 26, beat: 1, pitchMidi: 0, isRest: true });
    const malformed = event('malformed', { measureOrdinal: 26, beat: 1, tieTypes: ['continue'] });
    expect(tiedNoteChain(start, [start, attack, laterStop])).toEqual(['start']);
    expect(tiedNoteChain(start, [start, rest, laterStop])).toEqual(['start']);
    expect(tiedNoteChain(start, [start, malformed, laterStop])).toEqual(['start']);
  });
});
