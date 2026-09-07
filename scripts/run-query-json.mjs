import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2]);
const limit = Number(process.argv[3]) || 100;
const titleFilter = process.argv.slice(4).join(' ').trim().toLocaleLowerCase();
const payload = JSON.parse(readFileSync(file, 'utf8'));
const { searchDatabase } = await import('../server/search-api.mjs');
const started = performance.now();
const result = searchDatabase(payload.query || payload, limit);
const matches = [...result.exact, ...result.similar].filter(match => !titleFilter || match.work.title.toLocaleLowerCase().includes(titleFilter));
console.log(JSON.stringify({
  elapsedMs: Math.round(performance.now() - started),
  profile: result.profile,
  count: matches.length,
  matches: matches.map((match, index) => ({
    rank: index + 1,
    title: match.work.title,
    artist: match.work.artist,
    workId: match.work.workId,
    source: match.work.sourceId,
    streamId: match.work.streamId,
    startMeasure: match.startMeasure,
    endMeasure: match.endMeasure,
    ranking: match.ranking,
    localSimilarity: match.localSimilarity,
    scores: match.scores,
  })),
}, null, 2));
