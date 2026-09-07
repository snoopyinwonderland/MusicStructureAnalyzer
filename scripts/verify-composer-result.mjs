import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { searchDatabase } from '../server/search-api.mjs';
const { query }=JSON.parse(readFileSync('evaluation/cases/q-p1-004-repeated-note-query.json','utf8'));
const results=searchDatabase(query,100),matches=[...results.exact,...results.similar];
assert.ok(matches.length>0);
for(const match of matches)assert.ok(match.work.artist.includes('Claude-Michel Schönberg'),`${match.work.workId}: ${match.work.artist}`);
console.log(`Verified correct composer in all ${matches.length} melody results.`);
