import type { QueryEvent } from '../types';

export const collapseTies = (events: QueryEvent[]) => {const merged:QueryEvent[]=[];for(const event of events){const previous=merged.at(-1);if(event.kind==='note'&&event.tieGroup&&previous?.kind==='note'&&previous.tieGroup===event.tieGroup&&previous.pitchMidi===event.pitchMidi)previous.durationRatio+=event.durationRatio;else merged.push({...event})}return merged};
export const sounding = (events: QueryEvent[]) => collapseTies(events).filter(e => e.kind === 'note' && e.pitchMidi !== null);
export const intervals = (events: QueryEvent[]) => {
  const notes = sounding(events); return notes.slice(1).map((n, i) => n.pitchMidi! - notes[i].pitchMidi!);
};
export const relativePitches = (events: QueryEvent[]) => {
  const notes = sounding(events); return notes.length ? notes.map(n => n.pitchMidi! - notes[0].pitchMidi!) : [];
};
export const contour = (events: QueryEvent[]) => intervals(events).map(i => i === 0 ? 'SAME' : i > 0 ? (i <= 2 ? 'SU' : 'LU') : (i >= -2 ? 'SD' : 'LD'));
export const normalizedDurations = (events: QueryEvent[]) => {
  const notes = sounding(events); if (!notes.length) return []; const mean = notes.reduce((s, n) => s + n.durationRatio, 0) / notes.length;
  return notes.map(n => n.durationRatio / mean);
};
export const featureVector = (events: QueryEvent[]) => ({ relative: relativePitches(events), intervals: intervals(events), contour: contour(events), durations: normalizedDurations(events) });
export const ngrams = <T,>(items: T[], n: number) => items.length < n ? [] : items.slice(0, items.length - n + 1).map((_, i) => items.slice(i, i + n).join(':'));
