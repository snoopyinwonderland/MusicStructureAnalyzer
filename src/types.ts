export type QueryMode = 'melody' | 'melody_rhythm' | 'rhythm' | 'contour';
export type Meter = '2/4' | '3/4' | '4/4' | '5/4' | '3/8' | '6/8' | '7/8' | '9/8' | '12/8' | 'unknown';
export type EventKind = 'note' | 'rest';

export interface QueryEvent {
  id: string;
  kind: EventKind;
  pitchMidi: number | null;
  spelling?: string;
  durationRatio: number;
  /** Written note value in quarter-note beats. durationRatio remains sounding time. */
  writtenDuration?: number;
  tupletGroup?: string;
  actualNotes?: number;
  normalNotes?: number;
  tieGroup?: string;
  onset?: number;
  contourShapeConfidence?: number;
  cue?: boolean;
}

export interface Query {
  version: 1; mode: QueryMode; meter: Meter; startsOnDownbeat: true; events: QueryEvent[];
  absoluteExactOnly?: boolean;
  exactIntervalOnly?: boolean;
  exactPitchOnly?: boolean;
  exactRhythmOnly?: boolean;
  includeRests?: boolean;
  downbeatWeightBoost?: boolean;
  scopeWorkIds?: string[];
}
export interface CorpusNote extends QueryEvent {
  measure: number; measureOrdinal?: number; beat: number; metricStrength: number; structuralSalience: number;
  structuralConfidence: number; chordRole: 'chord_tone' | 'passing' | 'neighbor' | 'unknown';
}
export interface Work {
  workId: string; sourceId: string; streamId: string; title: string; artist: string; year: string; genre: string;
  accent: string; notes: CorpusNote[]; melodyRoleScore: number; roleConfidence: number; analysisConfidence: number;
  prominence: number; youtubeId?: string; keyFifths?: number; clefShape?: 'G'|'F'|'C'; clefLine?: number; partName?: string; meter?: string;
  accessPolicy?: 'public-domain'|'research-preview'; fullScoreAvailable?: boolean;
}
export interface AlignmentStep { queryIndex: number | null; candidateIndex: number | null; cost: number; type: 'match' | 'substitution' | 'insertion' | 'deletion' }
export interface MatchResult {
  /** Heuristic evidence strength, never a calibrated correctness probability. */
  phraseContext?: { version: string; calibrated: false; applicable: boolean; support: number; conflicts: number; compared: number; adjustment: number; score: number; details: Array<{ queryIndex: number; candidateIndex: number; outcome: string; weight: number }> };
  kind: 'exact' | 'similar'; work: Work; ranking: number; localSimilarity: number; occurrenceImportance: number;
  scores: { pitch: number; interval: number; contour: number; rhythm: number; meter: number; structural: number };
  startMeasure: number; startBeat: number; endMeasure: number; alignment: AlignmentStep[]; why: string[];
  occurrenceCount?: number; occurrenceMeasures?: Array<number|string>;
  partOccurrences?: Array<{ partName: string; streamId: string; count: number; measures: Array<number|string> }>;
}
