import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportEvaluationCases, loadEvaluationCases } from './export-evaluation-cases.mjs';
import { validateEvaluationCase, validateEvaluationCases } from './evaluation-case-validation.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempRoots = [];
const makeCase = (caseId = 'TEST-001') => ({
  schema: 'musicanote-evaluation-case/v1', caseId, createdAt: '2026-09-05', status: 'draft',
  query: { mode: 'melody_rhythm', meter: '4/4', events: [] },
  expected: { primaryTitles: [] }, observations: [], diagnoses: [], proposals: [], runs: [],
});
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'musicanote-case-export-'));
  tempRoots.push(root);
  const casesDir = join(root, 'cases');
  const outputDir = join(root, 'exports');
  mkdirSync(casesDir);
  return { root, casesDir, outputDir };
};
const writeCase = (directory, name, value) => writeFileSync(join(directory, name), JSON.stringify(value), 'utf8');
afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    // Only remove a test-owned directory created above, never a caller's path.
    if (dirname(root) !== tmpdir() || !root.startsWith(join(tmpdir(), 'musicanote-case-export-'))) {
      throw new Error(`Refusing to clean unexpected test path: ${root}`);
    }
    rmSync(root, { recursive: true, force: true });
  }
});

describe('evaluation case schema validation', () => {
  it('accepts the declared schema without imposing gold-label or query-event requirements', () => {
    const value = { ...makeCase(), query: {}, expected: {}, replayable: false, customMetadata: { pending: true } };
    expect(validateEvaluationCase(value)).toBe(value);
    expect(validateEvaluationCases([value])).toEqual([value]);
  });

  it.each(['schema', 'caseId', 'createdAt', 'status', 'query', 'expected', 'observations', 'diagnoses', 'proposals', 'runs'])('requires %s', field => {
    const value = makeCase();
    delete value[field];
    expect(() => validateEvaluationCase(value, 'bad.json')).toThrow(`bad.json: missing required field "${field}"`);
  });

  it.each([
    ['schema', 'wrong-version'], ['caseId', 5], ['createdAt', 'yesterday'], ['createdAt', '2026-02-30'],
    ['status', 'fixed'], ['query', null], ['query', []], ['expected', 'title'],
    ['observations', {}], ['diagnoses', ['a diagnosis']], ['proposals', [null]], ['runs', [[]]],
    ['tags', [42]], ['tags', 'tag'],
  ])('rejects wrong field types or values for %s (%j)', (field, value) => {
    expect(() => validateEvaluationCase({ ...makeCase(), [field]: value })).toThrow();
  });

  it('rejects duplicate case IDs with both source filenames', () => {
    expect(() => validateEvaluationCases([makeCase(), makeCase()], ['a.json', 'b.json']))
      .toThrow('b.json: duplicate caseId "TEST-001" (already in a.json)');
  });
});

describe('evaluation case export', () => {
  it('writes actual JSONL/CSV line separators and round-trips special characters and all source records', () => {
    const options = fixture();
    const first = makeCase('A');
    first.expected.primaryTitles = ['한글, "Porgy" \\ literal\\n'];
    first.observations = [{ message: 'first\nsecond\r\nthird\t♯', targets: '96:76,97.5:74' }];
    first.runs = [{ result: { primaryRank: null }, pending: true }];
    first.legacySource = { path: 'original.jsonl', caseRecordLine: 1 };
    const second = makeCase('B');
    second.observations = [{ message: 'another record' }];
    writeCase(options.casesDir, 'z-second.json', second);
    writeCase(options.casesDir, 'a-first.json', first);
    const legacyBytes = '{"recordType":"run","raw":"untouched"}\n';
    writeFileSync(join(options.casesDir, 'original.jsonl'), legacyBytes);
    const sourceBefore = new Map(readdirSync(options.casesDir).map(name => [name, readFileSync(join(options.casesDir, name))]));

    expect(exportEvaluationCases(options).caseCount).toBe(2);
    const jsonl = readFileSync(join(options.outputDir, 'query-cases.jsonl'), 'utf8');
    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines.pop()).toBe('');
    expect(lines.map(line => JSON.parse(line))).toEqual([first, second]);
    expect(readFileSync(join(options.outputDir, 'query-cases.csv'), 'utf8')).toContain('"한글, ""Porgy"" \\ literal\\n"');
    expect(readFileSync(join(options.outputDir, 'query-cases.csv'), 'utf8').split('\n')).toHaveLength(4);
    for (const [name, bytes] of sourceBefore) expect(readFileSync(join(options.casesDir, name))).toEqual(bytes);
  });

  it.each(['invalid', 'duplicate', 'invalid-json'])('rejects %s before replacing existing exports', kind => {
    const options = fixture();
    mkdirSync(options.outputDir);
    writeFileSync(join(options.outputDir, 'query-cases.jsonl'), 'prior-jsonl');
    writeFileSync(join(options.outputDir, 'query-cases.csv'), 'prior-csv');
    writeCase(options.casesDir, 'a.json', makeCase());
    if (kind === 'invalid-json') writeFileSync(join(options.casesDir, 'b.json'), '{bad');
    else writeCase(options.casesDir, 'b.json', kind === 'duplicate' ? makeCase() : { ...makeCase('B'), diagnoses: ['invalid'] });

    expect(() => exportEvaluationCases(options)).toThrow();
    expect(readFileSync(join(options.outputDir, 'query-cases.jsonl'), 'utf8')).toBe('prior-jsonl');
    expect(readFileSync(join(options.outputDir, 'query-cases.csv'), 'utf8')).toBe('prior-csv');
  });

  it('does not create an output directory when validation fails', () => {
    const options = fixture();
    writeCase(options.casesDir, 'invalid.json', { caseId: 'incomplete' });
    expect(() => exportEvaluationCases(options)).toThrow();
    expect(existsSync(options.outputDir)).toBe(false);
  });

  it('exports an empty collection without an invalid blank JSONL record', () => {
    const options = fixture();
    expect(exportEvaluationCases(options).caseCount).toBe(0);
    expect(readFileSync(join(options.outputDir, 'query-cases.jsonl'), 'utf8')).toBe('');
    expect(readFileSync(join(options.outputDir, 'query-cases.csv'), 'utf8').split('\n')).toHaveLength(2);
  });
});

describe('canonical case provenance', () => {
  it('validates every canonical case and preserves every Porgy legacy record without guessing V2 notes', () => {
    const casesDir = join(repositoryRoot, 'evaluation/cases');
    const cases = loadEvaluationCases(casesDir);
    const sourcePath = 'evaluation/cases/user-queries-phase1.jsonl';
    const legacy = readFileSync(join(repositoryRoot, sourcePath), 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
    const originalBase = legacy.find(item => item.caseId === 'Q-P1-001');
    const originalVariant = legacy.find(item => item.caseId === 'Q-P1-001-V2');
    const base = cases.find(item => item.caseId === originalBase.caseId);
    const variant = cases.find(item => item.caseId === originalVariant.caseId);
    for (const [key, value] of Object.entries(originalBase)) {
      expect(key === 'runs' ? base.legacySource.originalRuns : base[key]).toEqual(value);
    }
    expect(base.legacySource.path).toBe(sourcePath);
    expect(base.runs).toEqual(legacy.filter(item => item.recordType === 'run' && item.parentCaseId === base.caseId));
    expect(base.legacySource.runRecordLines.map(line => legacy[line - 1])).toEqual(base.runs);
    for (const [key, value] of Object.entries(originalVariant)) {
      expect(key === 'status' ? variant.originalStatus : variant[key]).toEqual(value);
    }
    expect(legacy[variant.legacySource.caseRecordLine - 1]).toEqual(originalVariant);
    expect(variant.legacySource.path).toBe(sourcePath);
    expect(variant.query).toEqual({});
    expect(variant.replayable).toBe(false);
    expect(variant.queryAvailability.status).toBe('missing-full-query');
    expect(variant.expected.primaryTitles).toEqual(originalBase.expected.primaryTitles);
    expect(variant.expected.confirmation).toBe('user-stated');
    expect(variant.expected).not.toHaveProperty('primaryRank');
  });

  it('does not promote pending highlighting verification into a verified outcome', () => {
    const value = JSON.parse(readFileSync(join(repositoryRoot, 'evaluation/cases/q-p1-005-empty-measure-highlighting.json'), 'utf8'));
    expect(value.originalStatus).toBe('fixed');
    expect(value.status).toBe('diagnosed');
    expect(value.resolution).toContain('browser visual verification pending');
    expect(value.targets).toBe('96:76,97.5:74,98:76,98.5:74,98.75:72,99.5:71,100:69');
    expect(value.runs).toEqual([]);
    expect(value.expected.primaryTitles).toEqual([]);
  });
});
