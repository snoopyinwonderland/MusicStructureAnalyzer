import { existsSync, renameSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const temporary = resolve(process.argv[2]);
const target = resolve(process.argv[3]);
if (!existsSync(temporary)) throw new Error(`Missing ${temporary}`);

const db = new DatabaseSync(temporary);
console.log('Creating grams_token index...');
db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; CREATE INDEX IF NOT EXISTS grams_token ON grams(token)');
console.log('Validating database schema...');
const requiredTables = ['grams', 'works', 'works_fts'];
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all().map((row) => row.name);
const hasGramIndex = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'grams_token'").get());
db.close();

if (!requiredTables.every((name) => tables.includes(name)) || !hasGramIndex) throw new Error('SQLite schema validation failed');
if (existsSync(target)) unlinkSync(target);
renameSync(temporary, target);
console.log(JSON.stringify({ target, schemaValidated: true }, null, 2));
