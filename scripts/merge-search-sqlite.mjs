import { copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [primaryArg, additionalArg, destinationArg] = process.argv.slice(2);
const resume = process.argv.includes('--resume');
if (!primaryArg || !additionalArg || !destinationArg) throw new Error('Usage: node scripts/merge-search-sqlite.mjs <primary> <additional> <destination>');
const primary = resolve(primaryArg), additional = resolve(additionalArg), destination = resolve(destinationArg);
if (!existsSync(primary) || !existsSync(additional)) throw new Error('Source database is missing');
if (existsSync(destination) && !resume) throw new Error(`Destination already exists: ${destination}`);
if (!resume) {
  console.log('Copying primary database...');
  copyFileSync(primary, destination);
}

const db = new DatabaseSync(destination);
try {
  const workColumns = new Set(db.prepare('PRAGMA table_info(works)').all().map((column) => column.name));
  if (!workColumns.has('access_policy')) db.exec('ALTER TABLE works ADD COLUMN access_policy TEXT');
  if (!workColumns.has('source_metadata')) db.exec('ALTER TABLE works ADD COLUMN source_metadata TEXT');
  console.log('Preparing database for bulk n-gram loading...');
  db.exec('DROP INDEX IF EXISTS grams_token');
  db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=MEMORY; ATTACH DATABASE '${additional.replaceAll("'", "''")}' AS extra; CREATE TEMP TABLE missing_ids(id TEXT PRIMARY KEY);`);
  console.log('Finding missing stream IDs with covering indexes...');
  db.exec('INSERT INTO missing_ids SELECT w.id FROM extra.works AS w INDEXED BY sqlite_autoindex_works_1 LEFT JOIN main.works AS p INDEXED BY sqlite_autoindex_works_1 ON p.id=w.id WHERE p.id IS NULL');
  console.log('Inserting works...');
  db.exec('BEGIN; INSERT INTO main.works SELECT w.* FROM extra.works AS w JOIN missing_ids USING(id); COMMIT');
  console.log('Inserting title-search rows...');
  db.exec('BEGIN; INSERT INTO main.works_fts SELECT f.* FROM extra.works_fts AS f JOIN missing_ids USING(id); COMMIT');
  console.log('Inserting n-grams...');
  db.exec('BEGIN; INSERT INTO main.grams SELECT g.* FROM extra.grams AS g JOIN missing_ids ON missing_ids.id=g.work_id; COMMIT');
  console.log('Rebuilding n-gram search index...');
  db.exec('CREATE INDEX grams_token ON grams(token)');
  console.log('Analyzing merged database...');
  db.exec('DROP TABLE missing_ids; ANALYZE main; DETACH DATABASE extra');
  const schema = db.prepare("SELECT count(*) AS value FROM sqlite_master WHERE name IN ('works','works_fts','grams','grams_token')").get().value;
  if (Number(schema) !== 4) throw new Error('Merged database schema validation failed');
  console.log(JSON.stringify({ destination, schemaValidated: true }, null, 2));
} catch (error) {
  db.close();
  if (!resume && existsSync(destination)) unlinkSync(destination);
  throw error;
}
db.close();
