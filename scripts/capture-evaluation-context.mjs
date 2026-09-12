#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getWork } from '../server/search-api.mjs';
import { positionedXmlNotes } from '../server/xml-target-verification.mjs';
import { musicXmlHarmonyStreams } from '../server/musicxml-harmony-events.mjs';
import { validateEvaluationCase } from './evaluation-case-validation.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const atomicWrite = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, value, 'utf8');
  renameSync(temporary, path);
};
const option = (argv, name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : fallback;
};
const required = (argv, name) => {
  const value = option(argv, name);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
};
const numberOption = (argv, name, fallback) => {
  const value = Number(option(argv, name, fallback));
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number`);
  return value;
};
const xmlText = (block, tag) => block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.replace(/<[^>]+>/g, '').trim() ?? null;
const normalizeEvent = (note, defaultStaff, defaultVoice) => ({
  id: note.id ?? null,
  kind: note.kind ?? 'note',
  pitchMidi: Number.isFinite(note.pitchMidi) ? note.pitchMidi : null,
  spelling: note.spelling ?? null,
  durationQuarter: Number(note.durationRatio ?? note.duration ?? 0),
  onsetQuarter: Number(note.onset),
  measure: note.measure,
  measureOrdinal: Number(note.measureOrdinal),
  beat: Number(note.beat),
  partName: note.partName ?? null,
  staff: String(note.staff ?? defaultStaff),
  voice: String(note.voice ?? defaultVoice),
  tie: note.tie ?? null,
  sourceIndex: Number.isFinite(note.sourceIndex) ? note.sourceIndex : null,
});

export function captureEvaluationContext({ casePath, workId, start, end, targets = '', before = 2, after = 2, force = false }) {
  const item = validateEvaluationCase(JSON.parse(readFileSync(casePath, 'utf8')), casePath);
  const contextStart = Math.max(1, start - before), contextEnd = end + after;
  const work = getWork(workId, { ordinalStart: contextStart, ordinalEnd: contextEnd, targets, excerpt: '1' });
  const fullWork = getWork(workId);
  if (!work?.xml) throw new Error(`Could not create MusicXML context for ${workId}`);
  const sourceXml = fullWork?.xml || work.xml;
  const assetDirectory = resolve(dirname(casePath), '..', 'case-assets', item.caseId);
  const xmlPath = resolve(assetDirectory, 'context.musicxml');
  const eventsPath = resolve(assetDirectory, 'events.json');
  if (!force && (existsSync(xmlPath) || existsSync(eventsPath) || item.knowledgeBase)) {
    throw new Error(`Context already exists for ${item.caseId}; pass --force to replace it`);
  }
  const [, defaultStaff = '1', defaultVoice = '1'] = String(work.streamId).split(':');
  const events = (work.notes || []).map(note => normalizeEvent(note, defaultStaff, defaultVoice)).filter(note => note.measureOrdinal >= contextStart && note.measureOrdinal <= contextEnd);
  const targetPairs = String(targets).split(',').filter(Boolean).map(value => {
    const [onset, pitchMidi] = value.split(':').map(Number);
    return { onsetQuarter: onset, pitchMidi };
  });
  const notationEvents = positionedXmlNotes(sourceXml, work.streamId, 0).filter(note => note.measureOrdinal >= contextStart && note.measureOrdinal <= contextEnd).map(note => ({
    partId: note.partId, staff: note.staff, voice: note.voice, measureOrdinal: note.measureOrdinal, beat: note.beat,
    pitchMidi: note.pitchMidi, isRest: note.isRest, chord: note.chord,
    durationDivisions: Number(xmlText(note.block, 'duration') || 0), noteType: xmlText(note.block, 'type'),
    dots: (note.block.match(/<dot\b/g) || []).length,
    timeModification: note.block.match(/<time-modification\b[\s\S]*?<\/time-modification>/)?.[0] ?? null,
    ties: [...note.block.matchAll(/<tie\s+type=["']([^"']+)["']/g)].map(match => match[1]),
    slurs: [...note.block.matchAll(/<slur\b[^>]*type=["']([^"']+)["'][^>]*>/g)].map(match => match[1]),
  }));
  const eventSnapshot = {
    schema: 'musicanote-case-events/v1', caseId: item.caseId, capturedAt: new Date().toISOString(),
    identity: { workId: work.workId, sourceId: work.sourceId, streamId: work.streamId, partName: work.partName },
    range: { focusStartMeasureOrdinal: start, focusEndMeasureOrdinal: end, contextStartMeasureOrdinal: contextStart, contextEndMeasureOrdinal: contextEnd, beforeMeasures: before, afterMeasures: after },
    meter: work.meter, keyFifths: work.keyFifths, clef: { shape: work.clefShape, line: work.clefLine },
    targets: targetPairs, events, notationEvents,
    harmonyEvents: musicXmlHarmonyStreams(sourceXml).flatMap(stream => stream.notes.map(note => ({ streamId: stream.streamId, ...note }))).filter(note => Number(note.m) >= contextStart && Number(note.m) <= contextEnd),
  };
  const xml = sourceXml.endsWith('\n') ? sourceXml : `${sourceXml}\n`;
  atomicWrite(xmlPath, xml);
  atomicWrite(eventsPath, `${JSON.stringify(eventSnapshot, null, 2)}\n`);
  item.knowledgeBase = {
    schema: 'musicanote-case-knowledge/v1', status: 'captured', capturedAt: eventSnapshot.capturedAt,
    identity: eventSnapshot.identity,
    sourceSnapshot: { xmlSha256: sha256(xml), eventsSha256: sha256(JSON.stringify(eventSnapshot)), searchDatabaseWorkId: work.workId },
    focus: { startMeasureOrdinal: start, endMeasureOrdinal: end, targets: targetPairs },
    context: { beforeMeasures: before, afterMeasures: after, startMeasureOrdinal: contextStart, endMeasureOrdinal: contextEnd },
    assets: { musicXml: `../case-assets/${item.caseId}/context.musicxml`, events: `../case-assets/${item.caseId}/events.json` },
    classification: { phenomenonTypes: [...new Set(item.tags || [])], musicalFunctions: [], contextualConditions: [], exclusions: [], confidence: 'unreviewed' },
    ruleLearning: { candidateRules: [], counterexamples: [], reusableFor: ['retrieval-regression', 'ranking-regression', 'notation-highlight-regression', 'human-rule-review'] },
  };
  atomicWrite(casePath, `${JSON.stringify(item, null, 2)}\n`);
  return { caseId: item.caseId, xmlPath, eventsPath, eventCount: events.length, context: item.knowledgeBase.context };
}

function main(argv = process.argv.slice(2)) {
  const caseId = required(argv, 'case');
  const casesDirectory = resolve('evaluation/cases');
  const filename = readdirSync(casesDirectory).find(name => name.endsWith('.json') && JSON.parse(readFileSync(resolve(casesDirectory, name), 'utf8')).caseId === caseId);
  if (!filename) throw new Error(`Unknown caseId ${caseId}`);
  const result = captureEvaluationContext({
    casePath: resolve(casesDirectory, filename), workId: required(argv, 'work'),
    start: numberOption(argv, 'start'), end: numberOption(argv, 'end'), targets: option(argv, 'targets', ''),
    before: numberOption(argv, 'before', 2), after: numberOption(argv, 'after', 2), force: argv.includes('--force'),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}
