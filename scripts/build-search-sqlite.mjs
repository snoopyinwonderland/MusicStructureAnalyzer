import { createReadStream, existsSync, renameSync, unlinkSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';

const source = new URL('../data/search-index-v2/works.jsonl', import.meta.url);
const target = new URL('../data/search-index-v2/search.sqlite', import.meta.url);
const temporary = new URL('../data/search-index-v2/search.sqlite.tmp', import.meta.url);
if (!existsSync(source)) throw new Error(`Missing ${source.pathname}`);
if (existsSync(temporary)) unlinkSync(temporary);
const db = new DatabaseSync(temporary);
db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=MEMORY;
CREATE TABLE works(id TEXT PRIMARY KEY,title TEXT,normalized_title TEXT,composer TEXT,source TEXT,stream_id TEXT,role REAL,notes TEXT);
CREATE VIRTUAL TABLE works_fts USING fts5(id UNINDEXED,title,normalized_title,composer,source,stream_id,tokenize='unicode61 remove_diacritics 2');
CREATE TABLE grams(token TEXT,work_id TEXT,pos INTEGER);
CREATE INDEX grams_token ON grams(token);`);
const addWork=db.prepare('INSERT INTO works VALUES(?,?,?,?,?,?,?,?)');
const addFts=db.prepare('INSERT INTO works_fts VALUES(?,?,?,?,?,?)');
const addGram=db.prepare('INSERT INTO grams VALUES(?,?,?)');
const token=(kind,values)=>`${kind}:${values.join(',')}`;
const quantize=n=>Math.round(n*8)/8;
const grams=(kind,values,size=3)=>values.slice(0,Math.max(0,values.length-size+1)).map((_,i)=>[token(kind,values.slice(i,i+size)),i]);
let count=0;
db.exec('BEGIN');
const lines=createInterface({input:createReadStream(source,{encoding:'utf8'}),crlfDelay:Infinity});
for await (const line of lines) {
  const work=JSON.parse(line), stream=work.streams?.[0];
  if (!stream?.notes?.length) continue;
  addWork.run(work.id,work.title,work.normalizedTitle,work.composer||'',work.source,stream.id,stream.role,JSON.stringify(stream.notes));
  addFts.run(work.id,work.title,work.normalizedTitle,work.composer||'',work.source,stream.id);
  const pitches=stream.notes.map(n=>n.p), durations=stream.notes.map(n=>n.d);
  const intervals=pitches.slice(1).map((p,i)=>p-pitches[i]);
  const contours=intervals.map(n=>Math.sign(n));
  const base=durations.find(n=>n>0)||1, rhythm=durations.map(n=>quantize(n/base));
  for(const [value,pos] of [...grams('i',intervals),...grams('c',contours),...grams('r',rhythm)]) addGram.run(value,work.id,pos);
  count++;
  if(count%250===0){db.exec('COMMIT; BEGIN');process.stdout.write(`\rIndexed ${count} works`)}
}
db.exec('COMMIT; ANALYZE'); db.close();
if(existsSync(target)) unlinkSync(target); renameSync(temporary,target);
console.log(`\nCreated search.sqlite with ${count} melody streams.`);
