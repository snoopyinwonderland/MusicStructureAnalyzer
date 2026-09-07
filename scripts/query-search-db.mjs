import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const [fileArg, ...terms] = process.argv.slice(2);
if (!fileArg || !terms.length) throw new Error('Usage: node scripts/query-search-db.mjs <database> <term...>');
const db = new DatabaseSync(resolve(fileArg));
for (const term of terms) {
  const rows = db.prepare('SELECT w.id,w.title,w.composer,w.source,w.stream_id,w.role,w.access_policy FROM works_fts AS f JOIN works AS w ON w.id=f.id WHERE works_fts MATCH ? LIMIT 25').all(term);
  console.log(JSON.stringify({ term, rows }, null, 2));
}
db.close();
