import type { CorpusNote } from '../types';
import type { MotifSpanMarker } from '../components/FullXmlNotation';

/** Count distinct occurrences and covered attacks, not summed overlapping spans. */
export function summarizeMotifFamilies(notes: CorpusNote[], spans: MotifSpanMarker[]) {
  const attack = (note: CorpusNote) => note.kind === 'note' && note.pitchMidi !== null && (note as any).isAttack !== false && !(note as any).tieStop;
  const totalAttacks = notes.filter(attack).length;
  const families = new Map<number, { familyNumber: number; occurrences: MotifSpanMarker[] }>();
  const seen = new Set<string>();
  for (const span of spans) {
    if (span.startIndex < 0 || span.endIndex >= notes.length || span.endIndex < span.startIndex) continue;
    const key = `${span.familyNumber}:${span.startIndex}:${span.endIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const family = families.get(span.familyNumber) ?? { familyNumber: span.familyNumber, occurrences: [] };
    family.occurrences.push(span); families.set(span.familyNumber, family);
  }
  return [...families.values()].sort((a,b)=>a.familyNumber-b.familyNumber).map(family => {
    const covered = new Set<number>();
    const variants = new Map<number, MotifSpanMarker[]>();
    for (const span of family.occurrences.sort((a,b)=>a.startIndex-b.startIndex)) {
      for (let i=span.startIndex;i<=span.endIndex;i++) if (attack(notes[i])) covered.add(i);
      const items = variants.get(span.variantIndex) ?? []; items.push(span); variants.set(span.variantIndex,items);
    }
    return { ...family, count:family.occurrences.length, coveredAttacks:covered.size, totalAttacks,
      coveragePercent: totalAttacks ? 100*covered.size/totalAttacks : 0,
      variants:[...variants.entries()].sort(([a],[b])=>a-b).map(([variantIndex,occurrences])=>{
        const representative=occurrences[0], selected=notes.slice(representative.startIndex,representative.endIndex+1);
        const events: CorpusNote[]=[]; let cursor=Number(selected[0]?.onset)||0;
        for (const note of selected) {
          const onset=Number(note.onset);
          if (Number.isFinite(onset)&&onset>cursor+1e-6) events.push({id:`gap-${note.id}`,kind:'rest',pitchMidi:null,durationRatio:onset-cursor} as CorpusNote);
          events.push({...note}); cursor=Math.max(cursor,(Number.isFinite(onset)?onset:cursor)+note.durationRatio);
        }
        return {variantIndex,occurrences,representative,label:representative.label,count:occurrences.length,
          startMeasure:representative.startNote.measure,endMeasure:representative.endNote.measure,events};
      }) };
  });
}
