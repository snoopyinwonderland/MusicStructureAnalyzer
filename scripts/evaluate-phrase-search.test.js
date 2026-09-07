import { describe, expect, it } from 'vitest';
import { compareCaseRuns, judgeExpectation, parseArguments, snapshotMatch } from './evaluate-phrase-search.mjs';

describe('phrase search evaluation CLI', () => {
  it('parses the documented controls', () => {
    const options = parseArguments(['--variant', 'updated', '--output', 'out.json', '--compare', 'old.json', '--limit', '100', '--cases', 'a.json,b.json']);
    expect(options.variant).toBe('updated');
    expect(options.limit).toBe(100);
    expect(options.caseFiles.map(path => path.replaceAll('\\', '/'))).toEqual(expect.arrayContaining([expect.stringMatching(/a\.json$/), expect.stringMatching(/b\.json$/)]));
  });

  it('rejects missing output, unknown variants, and unsafe limits', () => {
    expect(() => parseArguments([])).toThrow('--output is required');
    expect(() => parseArguments(['--variant', 'future', '--output', 'x'])).toThrow('--variant');
    expect(() => parseArguments(['--output', 'x', '--limit', '201'])).toThrow('--limit');
  });
});

describe('expectation judging', () => {
  const matches = [{ title: 'Not it', sourceId: 'source-a' }, { title: 'I LOVES YOU, PORGY', sourceId: 'source-b' }];
  it('uses case-insensitive exact title equality, not substring matching', () => {
    expect(judgeExpectation({ primaryTitles: ['i loves you, porgy'] }, matches)).toMatchObject({ bestRank: 2, top1: false, top5: true, top10: true });
    expect(judgeExpectation({ primaryTitles: ['LOVES YOU'] }, matches).bestRank).toBeNull();
  });
  it('accepts expected source IDs and leaves cases without labels unjudged', () => {
    expect(judgeExpectation({ expectedSourceIds: ['source-a'] }, matches).bestRank).toBe(1);
    expect(judgeExpectation({ primaryTitles: [] }, matches)).toEqual({ status: 'unjudged' });
  });
});

describe('before/after comparison', () => {
  it('stores one-based display ranks, not zero-based array indices', () => {
    const result = { work: { workId: 'a', notes: [] }, alignment: [] };
    expect([result, result].map(snapshotMatch).map(item => item.rank)).toEqual([1, 2]);
  });
  const result = (workId, rank, startMeasure, targets) => ({ workId, rank, startMeasure, endMeasure: startMeasure + 1, actualMappedTargets: targets });
  it('reports membership, rank, range, target, and expectation changes', () => {
    const before = { status: 'completed', expectation: { top1: false }, results: [result('lost', 1, 1, []), result('same', 2, 2, [{ onset: 1, pitch: 60 }])] };
    const after = { status: 'completed', expectation: { top1: true }, results: [result('same', 1, 3, [{ onset: 2, pitch: 62 }]), result('added', 2, 4, [])] };
    const comparison = compareCaseRuns(before, after);
    expect(comparison).toEqual(expect.objectContaining({ status: 'compared', lostWorkIds: ['lost'], addedWorkIds: ['added'], expectationChanged: { before: { top1: false }, after: { top1: true } } }));
    expect(comparison.changed[0]).toHaveProperty('rank');
    expect(comparison.changed[0]).toHaveProperty('range');
    expect(comparison.changed[0]).toHaveProperty('targets');
  });
});
