import type { QueryEvent } from '../types';
import { pitchName } from './pitch';

export function transposeSelectedEvents(events: QueryEvent[], selectedIds: string[], semitones: number, preferFlat = false) {
  const selected = new Set(selectedIds);
  const tiedGroups = new Set(events.filter(event => selected.has(event.id) && event.tieGroup).map(event => event.tieGroup));
  return events.map(event => {
    if (event.kind !== 'note' || event.pitchMidi === null || (!selected.has(event.id) && !tiedGroups.has(event.tieGroup))) return event;
    const pitchMidi = Math.max(24, Math.min(108, event.pitchMidi + semitones));
    const eventPrefersFlat = /[♭b]/.test(event.spelling || '') || (!/[♯#]/.test(event.spelling || '') && preferFlat);
    return { ...event, pitchMidi, spelling: pitchName(pitchMidi, eventPrefersFlat) };
  });
}

export function insertAfterSelection(events: QueryEvent[], selectedIds: string[], inserted: QueryEvent) {
  if (!selectedIds.length) return [...events, inserted];
  const selected = new Set(selectedIds), index = events.reduce((last, event, eventIndex) => selected.has(event.id) ? eventIndex : last, -1);
  return [...events.slice(0, index + 1), inserted, ...events.slice(index + 1)];
}

export function stepSelectedDurations(events: QueryEvent[], selectedIds: string[], anchorId: string, durations: number[], direction: -1 | 1) {
  const selected = new Set(selectedIds.includes(anchorId) ? selectedIds : [anchorId]);
  return events.map(event => {
    if (!selected.has(event.id)) return event;
    const written = event.writtenDuration ?? event.durationRatio;
    const current = Math.max(0, durations.indexOf(written));
    const value = durations[Math.max(0, Math.min(durations.length - 1, current + direction))];
    return { ...event, writtenDuration: event.tupletGroup ? value : undefined, durationRatio: event.tupletGroup ? value * (event.normalNotes || 2) / (event.actualNotes || 3) : value };
  });
}
