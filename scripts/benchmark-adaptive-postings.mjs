#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { searchDatabase } from '../server/search-api.mjs';

const root = resolve(import.meta.dirname, '..');
const defaultIds = [
  'Q-M100-001','Q-M100-006','Q-M100-016','Q-M100-017','Q-M100-036','Q-M100-039',
  'Q-M100-041','Q-M100-081','Q-M100-082','Q-M100-091','Q-M100-096','Q-M100-097',
  'Q-M100-002','Q-M100-037','Q-M200-019','Q-M200-067',
];
const requested = process.argv.slice(2).length ? process.argv.slice(2) : defaultIds;
const cases = new Map();
for (const suite of ['motif-100', 'motif-200']) {
  const path = resolve(root, `evaluation/${suite}/cases.jsonl`);
  for (const line of readFileSync(path, 'utf8').trim().split(/\r?\n/)) {
    const item = JSON.parse(line); cases.set(item.caseId, item);
  }
}

const output = [];
for (const caseId of requested) {
  const item = cases.get(caseId); if (!item) throw new Error(`Unknown case ${caseId}`);
  const started = performance.now(), result = searchDatabase(item.query, 100), matches = [...result.exact, ...result.similar];
  const index = matches.findIndex(match => match.work.workId === item.expected.workId || match.work.sourceId === item.expected.sourceId);
  const row = { caseId, mutation: item.mutation.kind, rank: index < 0 ? null : index + 1, elapsedMs: Math.round(performance.now() - started), resultCount: matches.length };
  output.push(row); console.log(JSON.stringify(row));
}
console.log(JSON.stringify({ total: output.length, found: output.filter(item => item.rank).length, top5: output.filter(item => item.rank && item.rank <= 5).length, meanMs: Math.round(output.reduce((sum, item) => sum + item.elapsedMs, 0) / output.length) }, null, 2));
