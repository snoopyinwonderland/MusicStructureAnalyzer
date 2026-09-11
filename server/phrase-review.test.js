import { describe, expect, it } from 'vitest';
import { createPhraseReviewRecord } from './phrase-review.mjs';

describe('phrase boundary review record', () => {
  it('keeps human review outside the analyzer claim and disables training by default', () => {
    const record = createPhraseReviewRecord({
      workId: 'work-1', streamId: 'P1:1:1', analyzerVersion: 'evidence-v1',
      boundaryIndex: 7, onset: 12, measure: '4', measureOrdinal: 4, beat: 1,
      verdict: 'rejected', candidate: { strength: .72, cues: ['observed-gap'] }, analysisContext: { boundaryHarmony: { progression: 'V → I', cadence: 'PAC' } }, comment: '호흡은 있으나 프레이즈는 계속됨',
    }, new Date('2026-09-09T00:00:00Z'), 'fixed');
    expect(record.reviewId).toBe('pbr_fixed');
    expect(record.target).toMatchObject({ boundaryIndex: 7, onset: 12, measureOrdinal: 4, beat: 1 });
    expect(record.human.status).toBe('rejected');
    expect(record.analysisContext.boundaryHarmony.cadence).toBe('PAC');
    expect(record.trainingEligible).toBe(false);
  });

  it('rejects invalid verdicts and endpoints', () => {
    expect(() => createPhraseReviewRecord({ workId: 'w', streamId: 's', boundaryIndex: 0, verdict: 'accepted' })).toThrow();
    expect(() => createPhraseReviewRecord({ workId: 'w', streamId: 's', boundaryIndex: 1, verdict: 'yes' })).toThrow();
  });
});
