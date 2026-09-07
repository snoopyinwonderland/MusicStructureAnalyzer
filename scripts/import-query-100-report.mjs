import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateEvaluationCases } from './evaluation-case-validation.mjs';

const PITCH_CLASS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const REPORT_CATEGORIES = [
  'pickup-omission', 'pitch-substitution', 'cadence-change', 'tempo-scaling', 'local-rhythm-change',
  'ornament-insertion-deletion', 'tie-split-merge', 'internal-rest', 'octave-shift', 'transposition-enharmonic',
  'large-leap-error', 'multiple-internal-rests', 'upbeat-after-rest', 'staccato-rest', 'arpeggio-leap',
  'gap-fill-contour', 'rest-elasticity', 'leap-with-ornament', 'compound-melody-octave-bounce', 'transposed-leap',
  'modal-distortion', 'swing-straight', 'extreme-octave-shift', 'repeated-note-compression', 'chromatic-ornament',
  'interval-inversion', 'syncopation-flattening', 'hemiola-meter-ambiguity', 'combined-errors', 'short-query',
];

export function pitchToMidi(spelling) {
  const match = String(spelling).replaceAll('♯', '#').replaceAll('♭', 'b').match(/^([A-G])([#b]?)(-?\d+)$/);
  if (!match) throw new Error(`Unsupported pitch spelling: ${spelling}`);
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return 12 * (Number(match[3]) + 1) + PITCH_CLASS[match[1]] + accidental;
}

export function parseQueryNotation(notation, caseId) {
  const tokens = [...String(notation).matchAll(/(Rest|[A-G](?:#|b|♯|♭)?-?\d+)\((\d+(?:\.\d+)?)\)(~?)/g)];
  const events = tokens.map((match, index) => ({
    id: `${caseId.toLowerCase()}-${String(index + 1).padStart(2, '0')}`,
    kind: match[1] === 'Rest' ? 'rest' : 'note',
    pitchMidi: match[1] === 'Rest' ? null : pitchToMidi(match[1]),
    ...(match[1] === 'Rest' ? {} : { spelling: match[1].replaceAll('#', '♯').replaceAll('b', '♭') }),
    durationRatio: Number(match[2]),
    ...(match[3] ? { reportTieMarker: true } : {}),
  }));
  let tieNumber = 0;
  for (let index = 0; index < events.length; index++) {
    if (!events[index].reportTieMarker) continue;
    const start = index;
    while (index + 1 < events.length && events[index + 1].reportTieMarker && events[index + 1].pitchMidi === events[start].pitchMidi) index++;
    if (index > start) {
      const tieGroup = `${caseId.toLowerCase()}-tie-${++tieNumber}`;
      for (let tied = start; tied <= index; tied++) events[tied].tieGroup = tieGroup;
    }
  }
  return events.map(({ reportTieMarker, ...event }) => event);
}

const clean = value => value.replace(/\s+/g, ' ').trim();

export function parseReportCases(markdown, expectedCount = 300) {
  const blocks = [...markdown.matchAll(/^\| \*\*(Q\d{3})\*\* \|[\s\S]*?(?=^\| \*\*Q\d{3}\*\* \||^### |^## |^---|(?![\s\S]))/gm)];
  const cases = blocks.map(block => {
    const cells = block[0].replace(/\r?\n/g, ' ').split('|').slice(1, -1).map(clean);
    if (cells.length !== 6) throw new Error(`Could not parse ${block[1]} table row (${cells.length} cells)`);
    const reportId = cells[0].replaceAll('*', ''), rawTitle = cells[1].replace(/^\*\*|\*\*$/g, ''), rawCredit = cells[2], rawMeasures = cells[3], rawCount = cells[4], notation = cells[5].replace(/^`|`$/g, '');
    const title = clean(rawTitle), credit = clean(rawCredit), measures = clean(rawMeasures);
    const caseId = `Q-R100-${reportId.slice(1)}`;
    const events = parseQueryNotation(notation, caseId);
    const declaredEventCount = Number(rawCount);
    if (events.length !== declaredEventCount) throw new Error(`${reportId}: declared ${declaredEventCount} events but parsed ${events.length}`);
    return {
      schema: 'musicanote-evaluation-case/v1', caseId, createdAt: '2026-09-05', status: 'draft', replayable: true,
      tags: ['imported-report', 'unverified-ground-truth', REPORT_CATEGORIES[Math.floor((Number(reportId.slice(1)) - 1) / 10)]],
      query: { version: 1, mode: 'melody_rhythm', meter: 'unknown', startsOnDownbeat: null, events, absoluteExactOnly: false },
      expected: { primaryTitles: [title], reportedCredit: credit, reportedMeasures: measures, confirmation: 'report-assertion-unverified', missingProvenance: ['workId', 'sourceId', 'streamId', 'targetOnsets', 'meter', 'query-start-position'] },
      observations: [{ kind: 'report-import', message: 'Markdown 표의 음높이·음가·쉼표를 기계적으로 정규화했다. 보고서의 목표 제목과 마디는 독립 검증 전 정답 지표에 포함하지 않는다.', reportId, notation }],
      diagnoses: [], proposals: [], runs: [],
      provenance: { source: 'docs/query-100-evaluation-report.md', reportId, importVersion: 1 },
    };
  });
  if (cases.length !== expectedCount) throw new Error(`Expected ${expectedCount} query rows, found ${cases.length}`);
  return validateEvaluationCases(cases, cases.map(value => `docs/query-100-evaluation-report.md#${value.caseId}`));
}

export function importReport({ input = resolve('docs/query-100-evaluation-report.md'), output = resolve('evaluation/generated/query-100-report.jsonl') } = {}) {
  const cases = parseReportCases(readFileSync(input, 'utf8'));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${cases.map(value => JSON.stringify(value)).join('\n')}\n`, 'utf8');
  return { count: cases.length, output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = importReport();
  console.log(`Imported ${result.count} draft cases to ${result.output}`);
}
