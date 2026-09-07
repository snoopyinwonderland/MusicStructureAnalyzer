#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateEvaluationCase, validateEvaluationCases } from './evaluation-case-validation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultCasesDir = resolve(root, 'evaluation/cases');
const defaultDbPath = resolve(root, 'data/search-index-v2/search.sqlite');
const variants = new Set(['legacy', 'updated', 'both']);
const help = `Usage: node scripts/evaluate-phrase-search.mjs [options]

Runs the canonical evaluation cases through the production searchDatabase.

Options:
  --variant legacy|updated|both  Phrase-context implementation (default: both)
  --output PATH                 Incremental JSON report path (required)
  --compare PATH                Compare against a previous report
  --limit N                     Search result limit, 1-200 (default: 100)
  --cases FILE[,FILE...]        Optional JSON case files (default: evaluation/cases/*.json)
  --help                        Show this help

Timing is sequential and cache-sensitive; it is not performance proof.`;

const sha256 = value => createHash('sha256').update(value).digest('hex');
const stableJson = value => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const readJson = path => {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new Error(`${path}: invalid JSON (${error.message})`); }
};
const resolveInput = path => isAbsolute(path) ? path : resolve(process.cwd(), path);

export function parseArguments(argv) {
  const options = { variant: 'both', limit: 100, caseFiles: null, compare: null, output: null, worker: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--variant') options.variant = argv[++index];
    else if (argument === '--output') options.output = resolveInput(argv[++index]);
    else if (argument === '--compare') options.compare = resolveInput(argv[++index]);
    else if (argument === '--limit') options.limit = Number(argv[++index]);
    else if (argument === '--cases') options.caseFiles = argv[++index]?.split(',').filter(Boolean).map(resolveInput);
    else if (argument === '--_worker') options.worker = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (options.help) return options;
  if (!variants.has(options.variant)) throw new Error('--variant must be legacy, updated, or both');
  if (!options.output) throw new Error('--output is required');
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 200) throw new Error('--limit must be an integer from 1 to 200');
  if (options.worker && options.variant === 'both') throw new Error('internal worker requires one variant');
  return options;
}

export function loadRunnerCases(caseFiles = null) {
  const files = caseFiles ?? readdirSync(defaultCasesDir).filter(name => name.endsWith('.json')).sort().map(name => resolve(defaultCasesDir, name));
  const cases = files.map(readJson);
  validateEvaluationCases(cases, files);
  return cases.map((value, index) => ({ value, path: files[index] }));
}

function validateReplayableCase(value, source) {
  validateEvaluationCase(value, source);
  if (value.replayable === false) return;
  if (!Array.isArray(value.query.events)) throw new Error(`${source}: replayable case query.events must be an array`);
  if (value.query.events.length < 1) throw new Error(`${source}: replayable case query.events must not be empty`);
  if (value.expected.primaryTitles !== undefined && (!Array.isArray(value.expected.primaryTitles) || value.expected.primaryTitles.some(title => typeof title !== 'string'))) throw new Error(`${source}: expected.primaryTitles must be an array of strings`);
  if (value.expected.expectedSourceIds !== undefined && (!Array.isArray(value.expected.expectedSourceIds) || value.expected.expectedSourceIds.some(id => typeof id !== 'string'))) throw new Error(`${source}: expected.expectedSourceIds must be an array of strings`);
}

function snapshotMetadata() {
  const dbPath = resolveInput(process.env.MUSICANOTE_SEARCH_DB || defaultDbPath);
  if (!existsSync(dbPath)) throw new Error(`Search database not found: ${dbPath}`);
  const db = statSync(dbPath);
  const codePaths = [resolve(root, 'server/search-api.mjs'), resolve(root, 'server/phrase-boundaries.mjs')];
  const codeHash = sha256(codePaths.map(path => `${path}\0${readFileSync(path)}`).join('\0'));
  return { database: { path: dbPath, sizeBytes: db.size, mtimeMs: db.mtimeMs, mtime: db.mtime.toISOString() }, codeHash };
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}

function mappedTargets(match) {
  const notes = match.work?.notes ?? [];
  return (match.alignment ?? []).flatMap(step => {
    if (step.candidateIndex === null || step.type === 'insertion') return [];
    const note = notes[step.candidateIndex];
    if (!note) return [];
    const onset = Number(note.onset), pitch = Number(note.pitchMidi);
    return Number.isFinite(onset) && Number.isFinite(pitch) ? [`${onset}:${pitch}`] : [];
  }).join(',');
}

export function snapshotMatch(match, index) {
  const output = {
    rank: index + 1, kind: match.kind, workId: match.work?.workId, title: match.work?.title,
    sourceId: match.work?.sourceId, streamId: match.work?.streamId,
    startMeasure: match.startMeasure, endMeasure: match.endMeasure,
    actualMappedTargets: mappedTargets(match), ranking: match.ranking,
    local: match.localSimilarity, localSimilarity: match.localSimilarity, scores: match.scores,
  };
  if (match.phraseContext !== undefined) output.phraseContext = match.phraseContext;
  return output;
}

export function judgeExpectation(expected, matches) {
  const titles = expected.primaryTitles ?? [], sourceIds = expected.expectedSourceIds ?? [];
  if (!titles.length && !sourceIds.length) return { status: 'unjudged' };
  const normalizedTitles = new Set(titles.map(title => title.toLocaleLowerCase())), expectedSources = new Set(sourceIds);
  const rank = matches.findIndex(match => normalizedTitles.has(String(match.title ?? '').toLocaleLowerCase()) || expectedSources.has(match.sourceId)) + 1;
  const bestRank = rank || null;
  return { status: 'judged', bestRank, top1: rank === 1, top5: rank > 0 && rank <= 5, top10: rank > 0 && rank <= 10 };
}

function runCase(searchDatabase, item, limit, metadata) {
  validateReplayableCase(item.value, item.path);
  const queryHash = sha256(stableJson(item.value.query));
  const snapshot = { queryHash, database: metadata.database, codeHash: metadata.codeHash };
  if (item.value.replayable === false) return { caseId: item.value.caseId, source: item.path, queryHash, snapshot, status: 'skipped', reason: item.value.queryAvailability?.status || 'replayable:false' };
  const started = performance.now(), result = searchDatabase(item.value.query, limit), elapsedMs = Math.round((performance.now() - started) * 1000) / 1000;
  const matches = [...result.exact, ...result.similar].map(snapshotMatch);
  return { caseId: item.value.caseId, source: item.path, queryHash, snapshot, status: 'completed', elapsedMs, resultCount: matches.length, results: matches, expectation: judgeExpectation(item.value.expected, matches) };
}

const byId = results => new Map((results ?? []).map(result => [result.workId, result]));
const equal = (left, right) => stableJson(left) === stableJson(right);

export function compareCaseRuns(before, after) {
  if (!before || !after || before.status !== 'completed' || after.status !== 'completed') return { status: 'not-comparable' };
  const oldResults = byId(before.results), newResults = byId(after.results);
  const lostWorkIds = [...oldResults.keys()].filter(id => !newResults.has(id)), addedWorkIds = [...newResults.keys()].filter(id => !oldResults.has(id));
  const changed = [...oldResults.keys()].filter(id => newResults.has(id)).flatMap(id => {
    const oldResult = oldResults.get(id), newResult = newResults.get(id), change = { workId: id };
    if (oldResult.rank !== newResult.rank) change.rank = { before: oldResult.rank, after: newResult.rank };
    const oldRange = [oldResult.startMeasure, oldResult.endMeasure], newRange = [newResult.startMeasure, newResult.endMeasure];
    if (!equal(oldRange, newRange)) change.range = { before: oldRange, after: newRange };
    if (!equal(oldResult.actualMappedTargets, newResult.actualMappedTargets)) change.targets = { before: oldResult.actualMappedTargets, after: newResult.actualMappedTargets };
    return Object.keys(change).length > 1 ? [change] : [];
  });
  const expectationChanged = !equal(before.expectation, after.expectation) ? { before: before.expectation, after: after.expectation } : null;
  return { status: 'compared', lostWorkIds, addedWorkIds, changed, expectationChanged };
}

function selectComparableRun(report, caseId, preferredVariant) {
  const variant = report?.variants?.[preferredVariant] ?? report?.variants?.updated ?? report?.variants?.legacy;
  return variant?.cases?.find(item => item.caseId === caseId);
}

export function buildComparisons(report, previousReport = null) {
  const output = {};
  if (report.variants.legacy && report.variants.updated) output.legacyToUpdated = report.variants.updated.cases.map(after => ({ caseId: after.caseId, ...compareCaseRuns(selectComparableRun(report, after.caseId, 'legacy'), after) }));
  if (previousReport) {
    output.previousToCurrent = {};
    for (const [variant, run] of Object.entries(report.variants)) output.previousToCurrent[variant] = run.cases.map(after => ({ caseId: after.caseId, ...compareCaseRuns(selectComparableRun(previousReport, after.caseId, variant), after) }));
  }
  return output;
}

function initialReport(options, metadata) {
  return { schema: 'musicanote-phrase-search-evaluation/v1', status: 'incomplete', startedAt: new Date().toISOString(), completedAt: null, requestedVariant: options.variant, limit: options.limit, timingNote: 'Cases ran sequentially. Timings are cache-sensitive observations, not performance proof.', snapshot: metadata, variants: {}, comparisons: {} };
}

async function worker(options) {
  const cases = loadRunnerCases(options.caseFiles), metadata = snapshotMetadata();
  const report = existsSync(options.output) ? readJson(options.output) : initialReport(options, metadata);
  report.snapshot = metadata;
  report.variants[options.variant] = { phraseContextEnvironment: options.variant === 'legacy' ? '0' : '1', status: 'incomplete', cases: [] };
  atomicWrite(options.output, report);
  const { searchDatabase } = await import('../server/search-api.mjs');
  for (const item of cases) {
    report.variants[options.variant].cases.push(runCase(searchDatabase, item, options.limit, metadata));
    atomicWrite(options.output, report);
  }
  report.variants[options.variant].status = 'complete';
  atomicWrite(options.output, report);
}

function spawnWorker(options, variant) {
  const arguments_ = [fileURLToPath(import.meta.url), '--_worker', '--variant', variant, '--output', options.output, '--limit', String(options.limit)];
  if (options.caseFiles) arguments_.push('--cases', options.caseFiles.join(','));
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, arguments_, { stdio: 'inherit', env: { ...process.env, MUSICANOTE_PHRASE_CONTEXT: variant === 'legacy' ? '0' : '1' } });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? accept() : reject(new Error(`The ${variant} worker ${signal ? `was interrupted by ${signal}` : `exited with code ${code}`}`)));
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return console.log(help);
  if (options.worker) return worker(options);
  loadRunnerCases(options.caseFiles);
  atomicWrite(options.output, initialReport(options, snapshotMetadata()));
  const requested = options.variant === 'both' ? ['legacy', 'updated'] : [options.variant];
  for (const variant of requested) await spawnWorker(options, variant);
  const complete = readJson(options.output), previous = options.compare ? readJson(options.compare) : null;
  complete.comparisons = buildComparisons(complete, previous);
  complete.status = 'complete';
  complete.completedAt = new Date().toISOString();
  if (options.compare) complete.comparedWith = options.compare;
  atomicWrite(options.output, complete);
  console.log(`Completed ${requested.join(' and ')} evaluation: ${options.output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
