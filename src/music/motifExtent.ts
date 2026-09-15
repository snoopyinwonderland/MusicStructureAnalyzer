/** Quarter-note coordinates; durationRatio includes the complete sounding tie. */
type TimedNote = { onset: number; durationRatio: number; kind?: string; isAttack?: boolean; tieStop?: boolean };

export const MOTIF_EXTENT_RULE_VERSION = 'long-arrival-rest-v1';

/** Recover a pickup omitted by a fixed-size rhythm cell. Require a contiguous
 * short-note run anchored by silence (or score start), without crossing another
 * candidate. Four preceding attacks is a search limit, not a Motif definition. */
export function rhythmCellStart(notes: TimedNote[], start: number, end: number, occupied: Array<{startIndex:number;endIndex:number}> = []): number {
  if (occupied.some(span => span.startIndex < start && span.endIndex >= start)) return start;
  const durations = notes.slice(start,end).filter(n=>n.kind!=='rest'&&n.isAttack!==false&&!n.tieStop).map(n=>Number(n.durationRatio)).filter(d=>d>0).sort((a,b)=>a-b);
  const unit = durations[Math.floor(durations.length/2)];
  if (!Number.isFinite(unit) || unit<=0) return start;
  let proposed=start;
  for(let count=0;count<4 && proposed>0;count++){
    const prior=notes[proposed-1], current=notes[proposed];
    if(prior.kind==='rest'||prior.isAttack===false||prior.tieStop)break;
    const duration=Number(prior.durationRatio),gap=Number(current.onset)-Number(prior.onset)-duration;
    if(duration<unit*.5||duration>unit*1.5||Math.abs(gap)>1e-8)break;
    if(occupied.some(span=>span.startIndex<=proposed-1&&span.endIndex>=proposed-1))break;
    proposed--;
  }
  if(proposed===start)return start;
  if(proposed===0)return proposed;
  const prior=notes[proposed-1];
  const silence=prior.kind==='rest'
    ? Number(notes[proposed].onset)-Number(prior.onset)
    : Number(notes[proposed].onset)-Number(prior.onset)-Number(prior.durationRatio);
  return silence+1e-8>=Math.max(.5,unit)?proposed:start;
}

/** A projected repetition period is an upper bound, not a musical ending.
 * Only trim after a sustained arrival followed by a real gap in this stream.
 * This does not declare a cadence or change the underlying tied event.
 */
export function projectedMotifEnd(notes: TimedNote[], start: number, exclusiveOnset: number): number | null {
  const attacks: number[] = [];
  for (let index = start; index < notes.length; index++) {
    const note = notes[index];
    if (Number(note.onset) >= exclusiveOnset) break;
    if (note.kind !== 'rest' && note.isAttack !== false && !note.tieStop) attacks.push(index);
  }
  for (let position = 3; position < attacks.length - 1; position++) {
    const index = attacks[position], nextIndex = attacks[position + 1];
    const note = notes[index], next = notes[nextIndex];
    const prior = attacks.slice(position - 3, position).map(i => Number(notes[i].durationRatio)).sort((a, b) => a - b);
    const median = prior[1], duration = Number(note.durationRatio);
    // A notated continuation must never create an artificial silence.
    let release = Number(note.onset) + duration;
    for (let i = index + 1; i < nextIndex; i++) {
      if (notes[i].kind !== 'rest') release = Math.max(release, Number(notes[i].onset) + Number(notes[i].durationRatio));
    }
    const gap = Number(next.onset) - release;
    if (median > 0 && duration >= Math.max(1, 2 * median) && gap + 1e-8 >= Math.max(.5, median)) return index;
  }
  return attacks.at(-1) ?? null;
}
