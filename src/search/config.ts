export const SEARCH_CONFIG = {
  version: 'similarity-v1', featureVersion: 'features-v1', candidateLimit: 300, bandRatio: 0.2,
  tau: 0.36, exactRhythmEpsilon: 0.035, minimumNotes: 4,
  weights: { melody: { pitch: .55, interval: .25, contour: .20, rhythm: 0 }, melody_rhythm: { pitch: .42, interval: .20, contour: .13, rhythm: .25 }, rhythm: { pitch: 0, interval: 0, contour: 0, rhythm: 1 }, contour: { pitch: 0, interval: .2, contour: .8, rhythm: 0 } },
  ranking: { similarity: .82, importance: .13, confidence: .05 }
} as const;
