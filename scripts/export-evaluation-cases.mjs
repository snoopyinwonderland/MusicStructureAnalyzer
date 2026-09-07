import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateEvaluationCases } from './evaluation-case-validation.mjs';

export function loadEvaluationCases(casesDir = resolve('evaluation/cases')) {
  const sources = readdirSync(casesDir).filter(name => name.endsWith('.json')).sort();
  const cases = sources.map(name => JSON.parse(readFileSync(resolve(casesDir, name), 'utf8')));
  return validateEvaluationCases(cases, sources);
}

export function exportEvaluationCases({
  casesDir = resolve('evaluation/cases'),
  outputDir = resolve('evaluation/exports'),
} = {}) {
  // Parse and validate the entire collection before creating or replacing any output.
  const cases = loadEvaluationCases(casesDir);
  const jsonl = cases.map(item => JSON.stringify(item)).join('\n') + (cases.length ? '\n' : '');
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [
    ['caseId', 'createdAt', 'status', 'mode', 'meter', 'eventCount', 'expectedTitles', 'observationCount', 'proposalCount'],
    ...cases.map(item => [
      item.caseId, item.createdAt, item.status, item.query.mode, item.query.meter,
      Array.isArray(item.query.events) ? item.query.events.length : 0,
      Array.isArray(item.expected.primaryTitles) ? item.expected.primaryTitles.join(' | ') : '',
      item.observations.length, item.proposals.length,
    ]),
  ];
  const csv = rows.map(row => row.map(quote).join(',')).join('\n') + '\n';
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, 'query-cases.jsonl'), jsonl, 'utf8');
  writeFileSync(resolve(outputDir, 'query-cases.csv'), csv, 'utf8');
  return { caseCount: cases.length, outputDir };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { caseCount, outputDir } = exportEvaluationCases();
  console.log(`Exported ${caseCount} cases to ${outputDir}`);
}
