export type QueryMode = 'melody' | 'melody_rhythm' | 'contour';
export type Meter = '4/4' | '3/4' | '6/8' | 'unknown';
export type EventKind = 'note' | 'rest';

export interface QueryEvent {
  id: string;
  kind: EventKind;
  pitchMidi: number | null;
  spelling?: string;
  durationRatio: number;
  tieGroup?: string;
  onset?: number;
  contourShapeConfidence?: number;
}

export interface Query { version: 1; mode: QueryMode; meter: Meter; startsOnDownbeat: true; events: QueryEvent[] }
export interface CorpusNote extends QueryEvent {
  measure: number; beat: number; metricStrength: number; structuralSalience: number;
  structuralConfidence: number; chordRole: 'chord_tone' | 'passing' | 'neighbor' | 'unknown';
}
export interface Work {
  workId: string; sourceId: string; streamId: string; title: string; artist: string; year: string; genre: string;
  accent: string; notes: CorpusNote[]; melodyRoleScore: number; roleConfidence: number; analysisConfidence: number;
  prominence: number; youtubeId?: string; keyFifths?: number; clefShape?: 'G'|'F'|'C'; clefLine?: number; partName?: string; meter?: string;
}
export interface AlignmentStep { queryIndex: number | null; candidateIndex: number | null; cost: number; type: 'match' | 'substitution' | 'insertion' | 'deletion' }
export interface MatchResult {
  kind: 'exact' | 'similar'; work: Work; ranking: number; localSimilarity: number; occurrenceImportance: number;
  scores: { pitch: number; interval: number; contour: number; rhythm: number; meter: number; structural: number };
  startMeasure: number; startBeat: number; endMeasure: number; alignment: AlignmentStep[]; why: string[];
}
