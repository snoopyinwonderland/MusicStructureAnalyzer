#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = resolve(import.meta.dirname, '..');
const caseId = process.argv[2] || 'Q-M100-081';
const suites = ['motif-100', 'motif-200'];
let item;
for (const suite of suites) {
  const path = resolve(root, `evaluation/${suite}/cases.jsonl`);
  for (const line of readFileSync(path, 'utf8').trim().split(/\r?\n/)) {
    const candidate = JSON.parse(line);
    if (candidate.caseId === caseId) item = candidate;
  }
}
if (!item) throw new Error(`Unknown case ${caseId}`);

const notes = item.query.events.filter(event => event.kind === 'note');
const intervals = notes.slice(1).map((note, index) => note.pitchMidi - notes[index].pitchMidi);
const grams = intervals.slice(0, -2).map((_, pos) => ({
  pos,
  token: `i:${intervals.slice(pos, pos + 3).join(',')}`,
}));
const db = new DatabaseSync(resolve(root, 'data/search-index-v2/search.sqlite'), { readOnly: true });
db.exec('PRAGMA query_only=ON; PRAGMA mmap_size=4294967296');
const totalSql = db.prepare('SELECT count(*) n FROM grams WHERE token=?');
const targetSql = db.prepare('SELECT rowid, pos FROM grams WHERE token=? AND work_id=? ORDER BY rowid');
for (const gram of grams) {
  const targetRows = targetSql.all(gram.token, item.expected.workId);
  const matching = targetRows.filter(row => Number(row.pos) - gram.pos === Number(item.expected.baseStartIndex));
  console.log(JSON.stringify({
    ...gram,
    total: Number(totalSql.get(gram.token).n),
    targetRows: targetRows.length,
    matching: matching.map(row => ({ pos: Number(row.pos), rowid: Number(row.rowid) })),
  }));
}
