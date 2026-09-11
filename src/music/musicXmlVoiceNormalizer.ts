export type VoiceNormalizationResult = {
  normalizedMeasures: number;
  skippedMeasures: number;
};

type TimedNote = {
  node: Element;
  lane: string;
  onset: number;
  duration: number;
  chord: boolean;
};

export type VoiceLaneTiming = Pick<TimedNote, 'onset' | 'duration' | 'chord'>;

const directChildren = (element: Element, tag?: string) =>
  [...element.children].filter(child => !tag || child.tagName === tag);

const directText = (element: Element, tag: string) =>
  directChildren(element, tag)[0]?.textContent?.trim() || '';

const durationOf = (element: Element) => Number(directText(element, 'duration') || 0);
const laneOf = (note: Element) => `${directText(note, 'staff') || '1'}:${directText(note, 'voice') || '1'}`;

export const hasInterleavedVoiceSequence = (lanes: readonly string[]) => {
  const completed = new Set<string>();
  let current = '';
  for (const lane of lanes) {
    if (lane === current) continue;
    if (current) completed.add(current);
    if (completed.has(lane)) return true;
    current = lane;
  }
  return false;
};

export const laneForwardGaps = (notes: readonly VoiceLaneTiming[]) => {
  let expected = 0;
  let lastOnset = -1;
  const gaps: number[] = [];
  for (const note of notes) {
    if (note.chord) {
      if (lastOnset < 0 || Math.abs(note.onset - lastOnset) > 1e-6) return null;
      gaps.push(0);
      continue;
    }
    const gap = note.onset - expected;
    if (gap < -1e-6) return null;
    gaps.push(gap > 1e-6 ? gap : 0);
    lastOnset = note.onset;
    expected = note.onset + note.duration;
  }
  return expected > 0 ? gaps : null;
};

const timedMove = (doc: XMLDocument, name: 'forward' | 'backup', durationValue: number) => {
  const move = doc.createElement(name);
  const duration = doc.createElement('duration');
  duration.textContent = String(durationValue);
  move.appendChild(duration);
  return move;
};

const normalizeMeasure = (measure: Element) => {
  const children = directChildren(measure);
  const first = children.findIndex(child => child.tagName === 'note');
  let last = -1;
  for (let index = children.length - 1; index >= 0; index--) {
    if (children[index].tagName === 'note') { last = index; break; }
  }
  if (first < 0 || last < first) return false;
  const musical = children.slice(first, last + 1);
  if (musical.some(child => child.tagName !== 'note' && child.tagName !== 'backup')) return false;

  let cursor = 0;
  let lastOnset = 0;
  const notes: TimedNote[] = [];
  for (const element of musical) {
    const duration = durationOf(element);
    if (element.tagName === 'backup') {
      if (!(duration > 0)) return false;
      cursor -= duration;
      if (cursor < -1e-6) return false;
      continue;
    }
    if (directChildren(element, 'grace').length || !(duration > 0)) return false;
    const chord = directChildren(element, 'chord').length > 0;
    const onset = chord ? lastOnset : cursor;
    notes.push({ node: element, lane: laneOf(element), onset, duration, chord });
    if (!chord) {
      lastOnset = onset;
      cursor += duration;
    }
  }

  const lanes = new Map<string, TimedNote[]>();
  for (const note of notes) lanes.set(note.lane, [...(lanes.get(note.lane) || []), note]);
  if (lanes.size < 2 || !hasInterleavedVoiceSequence(notes.map(note => note.lane))) return false;
  const plans = [...lanes.values()].map(lane => ({ lane, gaps: laneForwardGaps(lane) }));
  if (plans.some(plan => !plan.gaps)) return false;

  const boundary = children[last + 1] || null;
  for (const element of musical) element.remove();
  for (const [planIndex, { lane, gaps }] of plans.entries()) {
    for (const [noteIndex, note] of lane.entries()) {
      const gap = gaps![noteIndex];
      if (gap > 1e-6) measure.insertBefore(timedMove(measure.ownerDocument, 'forward', gap), boundary);
      measure.insertBefore(note.node, boundary);
    }
    if (planIndex === plans.length - 1) continue;
    const span = Math.max(...lane.filter(note => !note.chord).map(note => note.onset + note.duration));
    measure.insertBefore(timedMove(measure.ownerDocument, 'backup', span), boundary);
  }
  return true;
};

/** Reorders only safe beat-interleaved voices in the temporary Verovio document. */
export const normalizeMusicXmlVoices = (doc: XMLDocument): VoiceNormalizationResult => {
  let normalizedMeasures = 0;
  let skippedMeasures = 0;
  for (const part of [...doc.getElementsByTagName('part')]) {
    for (const measure of directChildren(part, 'measure')) {
      if (normalizeMeasure(measure)) normalizedMeasures++;
      else skippedMeasures++;
    }
  }
  return { normalizedMeasures, skippedMeasures };
};
