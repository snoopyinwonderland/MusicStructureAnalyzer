import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(':memory:');
db.exec(`ATTACH DATABASE '${process.argv[2].replaceAll("'", "''")}' AS extra; CREATE TEMP TABLE missing_ids(id TEXT PRIMARY KEY);`);
console.log(db.prepare('EXPLAIN QUERY PLAN SELECT g.* FROM extra.grams AS g JOIN missing_ids ON missing_ids.id=g.work_id').all());
db.close();
