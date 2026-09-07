import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] || 'data/search-index-v2/search.sqlite');
const db = new DatabaseSync(file);
const scalar = (sql) => Number(db.prepare(sql).get().value);

const report = {
  file,
  streamRows: scalar('SELECT count(*) AS value FROM works'),
  restricted: scalar("SELECT count(*) AS value FROM works WHERE access_policy = 'research-preview'"),
  indexes: db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name").all().map((row) => row.name),
};

db.close();
console.log(JSON.stringify(report, null, 2));
