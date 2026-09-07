import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Uses the production API with a small independent SQLite corpus, not demo search.
const pitches = [60, 64, 67, 62, 65, 69];
let directory;
const query = { version: 1, mode: 'melody_rhythm', meter: '4/4', startsOnDownbeat: true, absoluteExactOnly: false,
  events: pitches.flatMap((pitchMidi, i) => [
    ...(i === 3 ? [{ id: 'rest', kind: 'rest', pitchMidi: null, durationRatio: 2 }] : []),
    { id: String(i), kind: 'note', pitchMidi, durationRatio: 1 },
  ]),
};
const worker = `
  const { searchDatabase } = await import('./server/search-api.mjs');
  const query = JSON.parse(process.env.PHRASE_TEST_QUERY), output = {};
  for (const flag of ['0', '1']) {
    process.env.MUSICANOTE_PHRASE_CONTEXT = flag;
    const result = searchDatabase(query, 100);
    output[flag] = [...result.exact, ...result.similar];
  }
  console.log(JSON.stringify(output));
`;
function compare(input = query) {
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', worker], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 20000,
    env: { ...process.env, MUSICANOTE_SEARCH_DB: join(directory, 'search.sqlite'),
      MUSICANOTE_METER_CONTEXT_DB: join(directory, 'meter.sqlite'),
      MUSICANOTE_PROFILE_SEARCH: '0', MUSICANOTE_SEED_WINDOWS: '0', PHRASE_TEST_QUERY: JSON.stringify(input) },
  }));
}
const targets = result => result.alignment.filter(step => step.queryIndex !== null && step.candidateIndex !== null)
  .map(step => { const note = result.work.notes[step.candidateIndex]; return [step.queryIndex, note.onset, note.pitchMidi]; });

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'musicanote-phrase-integration-'));
  const db = new DatabaseSync(join(directory, 'search.sqlite'));
  db.exec('CREATE TABLE works(id TEXT PRIMARY KEY,title TEXT,composer TEXT,source TEXT,stream_id TEXT,role REAL,notes TEXT,access_policy TEXT); CREATE TABLE grams(token TEXT,work_id TEXT,pos INTEGER)');
  const add = db.prepare('INSERT INTO works VALUES(?,?,?,?,?,?,?,?)'), gram = db.prepare('INSERT INTO grams VALUES(?,?,?)');
  for (const gap of [true, false]) {
    const id = gap ? 'fixture-rest' : 'fixture-contact';
    const raw = pitches.map((p, i) => { const o = i + (gap && i >= 3 ? 2 : 0); return { p, o, d: 1, b: o % 4 + 1, m: Math.floor(o / 4) + 1 }; });
    add.run(id, id, 'Synthetic validation', `__phrase_fixture__/${id}.xml`, 'P1:1:1', 1, JSON.stringify(raw), 'public-domain');
    const intervals = pitches.slice(1).map((p, i) => p - pitches[i]);
    for (const [kind, values, width] of [['i', intervals, 3], ['i5', intervals, 5], ['c', intervals.map(Math.sign), 3], ['r', pitches.map(() => 1), 3]])
      for (let i = 0; i <= values.length - width; i++) gram.run(`${kind}:${values.slice(i, i + width).join(',')}`, id, i);
  }
  db.close();
});
afterAll(() => {
  if (directory && dirname(directory) === tmpdir() && directory.startsWith(join(tmpdir(), 'musicanote-phrase-integration-'))) rmSync(directory, { recursive: true, force: true });
});

describe('production search with conservative phrase context', () => {
  it('only adjusts final rank and preserves works, matching notes, range and old scores', () => {
    const result = compare();
    expect(result['0']).toHaveLength(2);
    expect(result['1'].map(item => item.work.workId).sort()).toEqual(result['0'].map(item => item.work.workId).sort());
    for (const updated of result['1']) {
      const legacy = result['0'].find(item => item.work.workId === updated.work.workId);
      expect(updated.localSimilarity).toBe(legacy.localSimilarity);
      expect(updated.scores).toEqual(legacy.scores);
      expect(targets(updated)).toEqual(targets(legacy));
      expect([updated.startMeasure, updated.endMeasure]).toEqual([legacy.startMeasure, legacy.endMeasure]);
      expect(updated.phraseContext.calibrated).toBe(false);
      expect(Math.abs(updated.ranking - legacy.ranking)).toBeLessThanOrEqual(3);
    }
    expect(result['1'].find(item => item.work.workId === 'fixture-rest').phraseContext.support).toBeGreaterThan(0);
    expect(result['1'].find(item => item.work.workId === 'fixture-contact').phraseContext.conflicts).toBeGreaterThan(0);
  });
  it.each([
    ['melody-only', { mode: 'melody' }], ['contour', { mode: 'contour' }],
    ['rhythmic exact-only', { absoluteExactOnly: true }], ['melodic exact-only', { mode: 'melody', absoluteExactOnly: true }],
  ])('keeps %s independent of the new temporal layer', (_name, options) => {
    const result = compare({ ...query, ...options });
    expect(result['0'].length).toBeGreaterThan(0);
    expect(result['1']).toEqual(result['0']);
    expect(result['1'].every(item => !item.phraseContext)).toBe(true);
  });
  it('retains the existing scope restriction', () => {
    const result = compare({ ...query, scopeWorkIds: ['fixture-contact'] });
    for (const variant of Object.values(result)) expect(variant.map(item => item.work.workId)).toEqual(['fixture-contact']);
  });
});
