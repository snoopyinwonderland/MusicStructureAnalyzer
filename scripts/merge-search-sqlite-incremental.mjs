import {DatabaseSync} from 'node:sqlite';
import {existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const [targetArg,deltaArg,manifestArg]=process.argv.slice(2);
if(!targetArg||!deltaArg)throw new Error('Usage: node scripts/merge-search-sqlite-incremental.mjs <target> <delta> [manifest]');
const target=resolve(targetArg),delta=resolve(deltaArg),manifest=resolve(manifestArg||'data/kysing-metadata/last-index-merge.json');
if(!existsSync(target)||!existsSync(delta))throw new Error('Target or delta database is missing');
const db=new DatabaseSync(target),q=value=>String(value).replaceAll("'","''");let committed=false;
try{
 db.exec(`PRAGMA busy_timeout=30000; ATTACH DATABASE '${q(delta)}' AS delta`);
 const deltaStreams=Number(db.prepare('SELECT count(*) n FROM delta.works').get().n),deltaSources=Number(db.prepare('SELECT count(DISTINCT source) n FROM delta.works').get().n),deltaGrams=Number(db.prepare('SELECT count(*) n FROM delta.grams').get().n);
 const collisions=Number(db.prepare('SELECT count(*) n FROM delta.works d JOIN main.works m USING(id)').get().n);
 if(collisions)throw new Error(`Refusing merge: ${collisions} stream IDs already exist`);
 const existingSources=Number(db.prepare('SELECT count(DISTINCT d.source) n FROM delta.works d JOIN main.works m ON m.source=d.source').get().n);
 if(existingSources)throw new Error(`Refusing merge: ${existingSources} source files already exist`);
 const ids=db.prepare('SELECT id FROM delta.works ORDER BY id').all().map(row=>row.id);
 db.exec('BEGIN IMMEDIATE');
 db.exec('INSERT INTO main.works SELECT * FROM delta.works');
 db.exec('INSERT INTO main.works_fts SELECT * FROM delta.works_fts');
 db.exec('INSERT INTO main.grams SELECT * FROM delta.grams');
 const inserted=Number(db.prepare('SELECT count(*) n FROM main.works WHERE id IN (SELECT id FROM delta.works)').get().n),insertedGrams=Number(db.prepare('SELECT count(*) n FROM main.grams WHERE work_id IN (SELECT id FROM delta.works)').get().n);
 if(inserted!==deltaStreams||insertedGrams!==deltaGrams)throw new Error(`Post-insert validation failed: works ${inserted}/${deltaStreams}, grams ${insertedGrams}/${deltaGrams}`);
 db.exec('COMMIT');committed=true;
 const result={completedAt:new Date().toISOString(),target,delta,deltaSources,deltaStreams,deltaGrams,insertedStreams:inserted,insertedGrams,ids};
 writeFileSync(manifest,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,ids:`${ids.length} IDs saved in manifest`},null,2));
}catch(error){if(!committed)try{db.exec('ROLLBACK')}catch{}throw error}finally{try{db.exec('DETACH DATABASE delta')}catch{}db.close()}
