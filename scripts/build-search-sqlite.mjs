import { createReadStream, existsSync, renameSync, unlinkSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const source = process.argv[2] ? resolve(process.argv[2]) : new URL('../data/search-index-v2/works.jsonl', import.meta.url);
const target = process.argv[3] ? resolve(process.argv[3]) : new URL('../data/search-index-v2/search.sqlite', import.meta.url);
const temporary = `${target}.tmp`;
if (!existsSync(source)) throw new Error(`Missing ${source.pathname || source}`);
if (existsSync(temporary)) unlinkSync(temporary);
const db = new DatabaseSync(temporary);
db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=MEMORY; PRAGMA page_size=8192;
CREATE TABLE works(id TEXT PRIMARY KEY,title TEXT,normalized_title TEXT,composer TEXT,source TEXT,stream_id TEXT,role REAL,notes TEXT,genre TEXT,license TEXT,license_conflict INTEGER,pdmx_metadata TEXT,access_policy TEXT,source_metadata TEXT);
CREATE VIRTUAL TABLE works_fts USING fts5(id UNINDEXED,title,normalized_title,composer,source,stream_id,tokenize='unicode61 remove_diacritics 2');
CREATE TABLE grams(token TEXT,work_id TEXT,pos INTEGER);`);
const addWork=db.prepare('INSERT INTO works VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
const addFts=db.prepare('INSERT INTO works_fts VALUES(?,?,?,?,?,?)');
const addGram=db.prepare('INSERT INTO grams VALUES(?,?,?)');
const token=(kind,values)=>`${kind}:${values.join(',')}`;
const quantize=n=>Math.round(n*8)/8;
const grams=(kind,values,size=3)=>values.slice(0,Math.max(0,values.length-size+1)).map((_,i)=>[token(kind,values.slice(i,i+size)),i]);
async function* jsonLines(file){let buffer='';for await(const chunk of createReadStream(file,{encoding:'utf8'})){buffer+=chunk;let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(line)yield line}}if(buffer)yield buffer}
let count=0;
db.exec('BEGIN');
for await (const line of jsonLines(source)) {
  const work=JSON.parse(line),streams=(work.streams||[]).filter(stream=>stream?.notes?.length);
  for(let streamIndex=0;streamIndex<streams.length;streamIndex++){
    const stream=streams[streamIndex],suffix=createHash('sha1').update(stream.id).digest('hex').slice(0,8),id=streamIndex===0?work.id:`${work.id}-${suffix}`;
    const pdmx=work.pdmx||{};
    const metadata=work.metadata||{},accessPolicy=metadata.accessPolicy||'public-domain';
    addWork.run(id,work.title,work.normalizedTitle,work.composer||'',work.source,stream.id,stream.role,JSON.stringify(stream.notes),pdmx.genres||'',pdmx.license||'',pdmx.license_conflict?1:0,JSON.stringify(pdmx),accessPolicy,JSON.stringify(metadata));
    addFts.run(id,work.title,work.normalizedTitle,work.composer||'',work.source,stream.id);
    const pitches=stream.notes.map(n=>n.p), durations=stream.notes.map(n=>n.d);
    const intervals=pitches.slice(1).map((p,i)=>p-pitches[i]);
    const contours=intervals.map(n=>Math.sign(n));
    const base=durations.find(n=>n>0)||1, rhythm=durations.map(n=>quantize(n/base));
    for(const [value,pos] of [...grams('i',intervals),...grams('i5',intervals,5),...grams('c',contours),...grams('r',rhythm)]) addGram.run(value,id,pos);
    count++;
    if(count%250===0){db.exec('COMMIT; BEGIN');process.stdout.write(`\rIndexed ${count} melody streams`)}
  }
}
db.exec('COMMIT; CREATE INDEX grams_token ON grams(token); ANALYZE'); db.close();
if(existsSync(target)) unlinkSync(target); renameSync(temporary,target);
console.log(`\nCreated search.sqlite with ${count} melody streams.`);
