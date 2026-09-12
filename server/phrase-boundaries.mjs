// Uncalibrated local boundary evidence, not harmonic cadence or phrase analysis.
const VERSION = 'local-boundary-evidence-v1.4';
const clamp = value => Math.max(0, Math.min(1, value));
const round = value => Math.round(value * 1e6) / 1e6;
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const median = values => {
  const sorted = values.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};
const unknown = index => ({ index, strength: 0, supported: false, reliable: false, state: 'unknown', continuity: 0, cues: [] });
const cue = (name, strength, evidence) => ({ name, strength: round(clamp(strength)), evidence });

function timeline(notes) {
  let cursor = 0;
  return notes.map((note, index) => {
    const duration = finite(note?.durationRatio) && Number(note.durationRatio) > 0 ? Number(note.durationRatio) : null;
    const explicit = finite(note?.onset);
    const onset = explicit ? Number(note.onset) : cursor;
    cursor = onset !== null && duration !== null ? onset + duration : null;
    return {
      index, duration, onset, explicit, end: cursor,
      pitch: finite(note?.pitchMidi) ? Number(note.pitchMidi) : null,
      attack: note?.isAttack !== false && !note?.tieStop,
    };
  });
}

// A local peak relative to BOTH neighboring transitions. No absolute tempo unit.
function discontinuity(values, index) {
  const value = values[index], left = values[index - 1], right = values[index + 1];
  if (![value, left, right].every(Number.isFinite) || value <= 0 || value < left || value < right) return 0;
  const baseline = (left + right) / 2;
  return clamp((value - baseline) / (value + baseline));
}

function localUnit(events, attacks, position) {
  const durations = [], iois = [];
  for (let j = Math.max(0, position - 3); j <= Math.min(attacks.length - 1, position + 3); j++) {
    durations.push(attacks[j].duration);
    if (j && j !== position && attacks[j].onset !== null && attacks[j - 1].onset !== null) {
      iois.push(attacks[j].onset - attacks[j - 1].onset);
    }
  }
  const index = attacks[position].index;
  durations.push(events[index - 1]?.duration);
  return median(iois) ?? median(durations);
}

function motifSignature(attacks, start, length) {
  const phrase = attacks.slice(start, start + length);
  if (phrase.length !== length || phrase.some(note => note.pitch === null || note.duration === null || note.onset === null)) return null;
  const intervals = phrase.slice(1).map((note, i) => round(note.pitch - phrase[i].pitch));
  // Constant scales, repeated notes and two-note oscillations provide little identity.
  if (new Set(intervals).size < 3 || !intervals.some(value => value > 0) || !intervals.some(value => value < 0)) return null;
  const unit = phrase[0].duration;
  const rhythm = phrase.map(note => round(note.duration / unit));
  const iois = phrase.slice(1).map((note, i) => round((note.onset - phrase[i].onset) / unit));
  if (iois.some(value => value <= 0)) return null;
  const before = attacks[start - 1];
  const incoming = before?.pitch !== null && before?.onset !== null && before
    ? `${round(phrase[0].pitch - before.pitch)}:${round((phrase[0].onset - before.onset) / unit)}` : null;
  return { key: `${length}|${intervals.join(',')}|${rhythm.join(',')}|${iois.join(',')}`, incoming };
}

function addMotifSupport(attacks, boundaries) {
  // At most five lengths and four recent occurrences per signature; no all-pairs search.
  const seen = new Map();
  for (let start = 0; start < attacks.length; start++) {
    let best = null;
    for (let length = 4; length <= 8; length++) {
      const signature = motifSignature(attacks, start, length);
      if (!signature) continue;
      const recent = seen.get(signature.key) || [];
      const prior = recent.findLast(entry => start - entry.start >= length && start - entry.start <= 64);
      const boundary = boundaries[attacks[start].index];
      const anchored = boundary.strength >= .2 && (
        boundary.cues.some(item => item.name === 'observed-gap') ||
        prior?.incoming !== null && signature.incoming !== null && prior?.incoming !== signature.incoming
      );
      // Repetition alone (including a repeating ostinato's rotations) is not a boundary.
      if (prior && start > 0 && anchored && (!best || length > best.length)) {
        best = { length, previousIndex: attacks[prior.start].index, distanceInAttacks: start - prior.start };
      }
      recent.push({ start, incoming: signature.incoming });
      if (recent.length > 4) recent.shift();
      seen.set(signature.key, recent);
    }
    if (best) {
      const boundary = boundaries[attacks[start].index];
      boundary.cues.push(cue('repeated-motif-start', .2, { ...best, maxDistanceInAttacks: 64, layer: 'motif', contributesToPhraseStrength: false }));
    }
  }
}

function cellShape(attacks, start, length) {
  const notes = attacks.slice(start, start + length);
  if (notes.length !== length || notes.some(note => note.pitch === null || note.duration === null || note.onset === null)) return null;
  const unit = median(notes.map(note => note.duration));
  if (!unit) return null;
  return {
    rhythm: notes.map(note => round(note.duration / unit)),
    iois: notes.slice(1).map((note, index) => round((note.onset - notes[index].onset) / unit)),
    contour: notes.slice(1).map((note, index) => Math.sign(note.pitch - notes[index].pitch)),
  };
}

function cellShapeSimilarity(left, right) {
  if (!left || !right || left.rhythm.length !== right.rhythm.length) return 0;
  const closeRatio = (a, b, tolerance = .12) => a.length === b.length
    ? a.filter((value, index) => Math.abs(value - b[index]) <= tolerance * Math.max(1, Math.abs(value), Math.abs(b[index]))).length / Math.max(1, a.length)
    : 0;
  const contour = left.contour.filter((value, index) => value === right.contour[index]).length / Math.max(1, left.contour.length);
  return round(.45 * closeRatio(left.rhythm, right.rhythm) + .35 * closeRatio(left.iois, right.iois) + .2 * contour);
}

// Repeated sequential figures often contain breaths between cells without ending the
// larger phrase. Preserve those cell divisions as evidence, but demote them from the
// primary phrase level and expose the whole run's start/end as candidates.
function addRepeatedFigureContinuity(attacks, boundaries) {
  const gapPositions = [];
  for (let position = 1; position < attacks.length; position++) {
    const boundary = boundaries[attacks[position].index];
    if (boundary.cues.some(item => item.name === 'observed-gap' && item.strength >= .65)) gapPositions.push(position);
  }
  const runs = [];
  for (let i = 0; i < gapPositions.length - 1; i++) {
    const first = gapPositions[i], second = gapPositions[i + 1], length = second - first, start = first - length, end = second + length;
    if (length < 3 || length > 8 || start < 0 || end > attacks.length) continue;
    const firstSimilarity = cellShapeSimilarity(cellShape(attacks, start, length), cellShape(attacks, first, length));
    const secondSimilarity = cellShapeSimilarity(cellShape(attacks, first, length), cellShape(attacks, second, length));
    if (firstSimilarity < .82 || secondSimilarity < .72) continue;
    const candidate = { start, end, length, internal: [first, second], similarities: [firstSimilarity, secondSimilarity] };
    const previous = runs.at(-1);
    if (previous && previous.length === length && candidate.start <= previous.end) {
      previous.end = Math.max(previous.end, candidate.end);
      previous.internal = [...new Set([...previous.internal, ...candidate.internal])].sort((a, b) => a - b);
      previous.similarities.push(...candidate.similarities);
    } else runs.push(candidate);
  }
  return runs.map((run, runIndex) => {
    const runId = `repeat-run-${runIndex + 1}-${attacks[run.start].index}`;
    const startIndex = attacks[run.start].index, endIndex = run.end < attacks.length ? attacks[run.end].index : boundaries.length - 1;
    const evidence = { runId, cellLengthInAttacks: run.length, cellCount: run.internal.length + 1, internalBoundaryIndices: run.internal.map(position => attacks[position].index), similarity: round(median(run.similarities) || 0), requiresCadenceReview: true };
    for (const position of run.internal) {
      const boundary = boundaries[attacks[position].index];
      boundary.rawStrength = boundary.strength;
      boundary.continuity = Math.max(boundary.continuity, .9);
      boundary.cues.push(cue('repeated-figure-continuation', .9, evidence));
      boundary.primaryLevel = 'subphrase-cell';
      boundary.suppressedBy = runId;
      boundary.strength = round(Math.min(boundary.strength, .49));
    }
    if (startIndex > 0) {
      const boundary = boundaries[startIndex];
      const independentBoundary = boundary.strength >= .65 && boundary.continuity < .75;
      boundary.cues.push(cue('repeated-figure-run-start', .35, { ...evidence, layer: 'motif', contributesToPhraseStrength: false, promotedToPhraseBoundary: independentBoundary }));
      if (independentBoundary) boundary.primaryLevel = 'phrase';
    }
    if (endIndex > 0 && endIndex < boundaries.length - 1) {
      const boundary = boundaries[endIndex];
      const independentClosure = boundary.strength >= .65 && boundary.continuity < .75;
      const endEvidence = { ...evidence, requiresIndependentClosureCue: true, promotedToPhraseBoundary: independentClosure };
      boundary.cues.push(cue('repeated-figure-run-end', independentClosure ? .68 : .35, endEvidence));
      // A repeated run ending is structural evidence, not sufficient closure by
      // itself. In particular, do not create a tiny phrase where the notes are
      // temporally continuous and no independent boundary cue is present.
      if (independentClosure) boundary.primaryLevel = 'phrase';
    }
    return { ...evidence, startIndex, endIndex };
  });
}

function normalizedPrefix(attacks, start, end, count = 3) {
  const notes = attacks.slice(start, Math.min(end, start + count));
  if (notes.length < count || notes.some(note => note.duration === null)) return null;
  const unit = notes[0].duration;
  return unit > 0 ? notes.map(note => round(note.duration / unit)) : null;
}

function addRhythmicGestureContinuity(attacks, boundaries) {
  const gaps = [];
  for (let position = 1; position < attacks.length; position++) {
    const boundary = boundaries[attacks[position].index], previous = attacks[position - 1];
    const observed = boundary.cues.find(item => item.name === 'observed-gap' && item.strength >= .65);
    if (observed && previous.end !== null && attacks[position].onset !== null) gaps.push({ position, absolute: attacks[position].onset - previous.end });
  }
  const groups = [];
  for (let i = 0; i < gaps.length - 2; i++) {
    const [left, middle, right] = gaps.slice(i, i + 3), leftLength = middle.position - left.position, rightLength = right.position - middle.position;
    if (leftLength < 3 || leftLength > 8 || rightLength < 3 || rightLength > 8 || right.absolute < Math.max(2, middle.absolute * 2.5)) continue;
    const first = normalizedPrefix(attacks, left.position, middle.position), second = normalizedPrefix(attacks, middle.position, right.position);
    if (!first || !second || first.some((value, index) => Math.abs(value - second[index]) > .12 * Math.max(1, value, second[index]))) continue;
    // Require a genuinely short-short-long pickup cell, not arbitrary equal notes.
    if (!(first[0] <= first[2] * .6 && first[1] <= first[2] * .6)) continue;
    const boundary = boundaries[attacks[middle.position].index], groupId = `gesture-chain-${groups.length + 1}-${attacks[left.position].index}`;
    const evidence = { groupId, startIndex: attacks[left.position].index, internalBoundaryIndex: attacks[middle.position].index, endIndex: attacks[right.position].index, sharedRhythmPrefix: first, followingGapQuarters: round(right.absolute), requiresCadenceReview: true };
    boundary.rawStrength = boundary.rawStrength ?? boundary.strength;
    boundary.continuity = Math.max(boundary.continuity, .82);
    boundary.cues.push(cue('rhythmic-gesture-continuation', .82, evidence));
    boundary.primaryLevel = 'subphrase-cell';
    boundary.suppressedBy = groupId;
    boundary.strength = round(Math.min(boundary.strength, .49));
    groups.push(evidence);
  }
  return groups;
}

/** Boundaries[i] is immediately before original note i; endpoints remain unknown. */
export function analyzePhraseBoundaries(notes) {
  const events = timeline(Array.isArray(notes) ? notes : []);
  const boundaries = Array.from({ length: events.length + 1 }, (_, index) => unknown(index));
  const attacks = events.filter(note => note.attack);
  const pitchDistances = attacks.map((note, i) => i && note.pitch !== null && attacks[i - 1].pitch !== null ? Math.abs(note.pitch - attacks[i - 1].pitch) : null);
  const iois = attacks.map((note, i) => i && note.onset !== null && attacks[i - 1].onset !== null && note.onset > attacks[i - 1].onset ? note.onset - attacks[i - 1].onset : null);
  for (let position = 0; position < attacks.length; position++) {
    const current = attacks[position], index = current.index;
    if (!index) continue;
    const previous = events[index - 1], boundary = boundaries[index];
    const unit = localUnit(events, attacks, position);
    const pitchPeak = discontinuity(pitchDistances, position);
    const ioiPeak = discontinuity(iois, position);
    if (pitchPeak > 0) boundary.cues.push(cue('pitch-discontinuity', .25 * pitchPeak, { localPeak: round(pitchPeak), method: 'neighbor-relative, LBDM-inspired' }));
    if (ioiPeak > 0) boundary.cues.push(cue('ioi-discontinuity', .25 * ioiPeak, { localPeak: round(ioiPeak), method: 'neighbor-relative, LBDM-inspired' }));
    boundary.strength = round(.25 * pitchPeak + .25 * ioiPeak);
    // Inferred sequential onsets cannot establish either a rest or its absence.
    if (unit && current.explicit && previous.explicit && previous.end !== null && current.onset > previous.onset) {
      const gapRatio = (current.onset - previous.end) / unit;
      if (gapRatio >= .25) {
        const gapStrength = Math.min(.95, .55 + .2 * Math.log2(1 + gapRatio));
        boundary.cues.push(cue('observed-gap', gapStrength, { gapRatio: round(gapRatio), relativeTo: 'local IOI or duration', explicitOnsets: true }));
        boundary.strength = round(clamp(boundary.strength + gapStrength));
      } else if (gapRatio >= -1e-6 && gapRatio <= .03 && pitchPeak <= .25 && ioiPeak <= .25) {
        boundary.continuity = .85;
        boundary.cues.push(cue('observed-continuity', .85, { gapRatio: round(Math.max(0, gapRatio)), explicitOnsets: true, meaning: 'temporal contact, not proof of no musical phrase' }));
      }
    }
  }
  addMotifSupport(attacks, boundaries);
  const repeatedFigureRuns = addRepeatedFigureContinuity(attacks, boundaries);
  const rhythmicGestureGroups = addRhythmicGestureContinuity(attacks, boundaries);
  for (let index = 1; index < events.length; index++) {
    const boundary = boundaries[index];
    if (!events[index].attack) {
      boundary.continuity = 1;
      boundary.cues.push(cue('tie-continuation', 1, { newAttack: false }));
    }
    boundary.supported = boundary.strength >= .65;
    boundary.reliable = boundary.supported || boundary.continuity >= .75;
    boundary.state = boundary.supported ? 'boundary' : boundary.continuity >= .75 ? 'continuous' : 'unknown';
  }
  return { version: VERSION, calibrated: false, label: 'phrase boundary evidence with separate motif-group hypotheses; harmonic cadence is a separate layer', repeatedFigureRuns, rhythmicGestureGroups, boundaries };
}

/** Only adjacent INTERNAL mapped transitions are comparable; use full candidate indices. */
export function comparePhraseBoundaries(queryAnalysis, candidateAnalysis, pairs) {
  const query = queryAnalysis?.boundaries || [], candidate = candidateAnalysis?.boundaries || [];
  let previous = null, support = 0, conflicts = 0, weighted = 0;
  const details = [], seen = new Set();
  for (const pair of Array.isArray(pairs) ? pairs : []) {
    const q = pair?.queryIndex, c = pair?.candidateIndex;
    if (!Number.isInteger(q) || !Number.isInteger(c) || q < 0 || c < 0 || q >= query.length - 1 || c >= candidate.length - 1) {
      previous = null;
      continue;
    }
    if (previous && q === previous.q + 1 && c === previous.c + 1 && q > 0 && c > 0 && !seen.has(`${q}:${c}`)) {
      seen.add(`${q}:${c}`);
      const qb = query[q], cb = candidate[c];
      if (qb?.supported && qb.reliable && qb.strength >= .65 && cb?.reliable) {
        const gap = qb.cues?.find(item => item.name === 'observed-gap' && item.strength >= .65);
        if (cb.supported && cb.strength >= .65) {
          const weight = Math.min(qb.strength, cb.strength);
          support++; weighted += weight;
          details.push({ queryIndex: q, candidateIndex: c, outcome: 'supported-match', weight: round(weight) });
        } else if (gap && cb.continuity >= .75) {
          const weight = gap.strength * cb.continuity;
          conflicts++; weighted -= weight;
          details.push({ queryIndex: q, candidateIndex: c, outcome: 'observed-gap-vs-continuity', weight: round(weight) });
        }
      }
    }
    previous = { q, c };
  }
  const compared = support + conflicts;
  const adjustment = round(3 * Math.max(-1, Math.min(1, weighted / Math.max(2, compared))));
  return { version: VERSION, calibrated: false, applicable: compared > 0, support, conflicts, compared, adjustment, score: round(50 + adjustment * 50 / 3), details };
}
