#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { searchDatabase } from '../server/search-api.mjs';

const file = resolve(process.argv[2]);
const targetWorkId = process.argv[3];
const payload = JSON.parse(readFileSync(file, 'utf8'));
const started = performance.now();
const result = searchDatabase(payload.query || payload, 100);
const matches = [...result.exact, ...result.similar];
const targetIndex = matches.findIndex(match => match.work.workId === targetWorkId);
const from = targetIndex < 0 ? 0 : Math.max(0, targetIndex - 2);
const to = targetIndex < 0 ? Math.min(10, matches.length) : Math.min(matches.length, targetIndex + 3);
console.log(JSON.stringify({
  elapsedMs: Math.round(performance.now() - started),
  targetRank: targetIndex < 0 ? null : targetIndex + 1,
  matches: matches.slice(from, to).map((match, offset) => ({
    rank: from + offset + 1,
    kind: match.kind,
    workId: match.work.workId,
    title: match.work.title,
    streamId: match.work.streamId,
    startMeasure: match.startMeasure,
    startBeat: match.startBeat,
    endMeasure: match.endMeasure,
    ranking: match.ranking,
    localSimilarity: match.localSimilarity,
    melodyRoleScore: match.work.melodyRoleScore,
    phraseAdjustment: match.phraseContext?.adjustment ?? null,
    scores: match.scores,
    why: match.why,
  })),
}, null, 2));
