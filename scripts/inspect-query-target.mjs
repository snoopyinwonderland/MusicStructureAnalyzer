import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { alignLocal, annotateStructural, prepareQueryNotes, score } from '../server/search-api.mjs';

const payload=JSON.parse(readFileSync(process.argv[2],'utf8')),pattern=`%${process.argv.slice(3).join(' ')}%`,db=new DatabaseSync('data/search-index-v2/search.sqlite',{readOnly:true});
const query=annotateStructural(prepareQueryNotes(payload.query?.events||payload.events),payload.query?.meter||payload.meter||'4/4');
const rows=db.prepare('SELECT id,title,stream_id,role,notes FROM works WHERE title LIKE ?').all(pattern);
const output=[];
for(const row of rows){
 const candidate=annotateStructural(JSON.parse(row.notes).map(note=>({pitchMidi:note.p,durationRatio:note.d,onset:note.o,beat:note.b,measure:note.m,spelling:note.s})),payload.query?.meter||payload.meter||'4/4',true),alignment=alignLocal(query,candidate,payload.query?.mode||payload.mode||'melody'),window=candidate.slice(alignment.start,alignment.end+1),scores=window.length===query.length?score(query,window):null;
 output.push({id:row.id,title:row.title,streamId:row.stream_id,role:row.role,alignment,scores,start:window[0]&&{measure:window[0].measure,beat:window[0].beat,onset:window[0].onset},pitches:window.map(note=>note.pitchMidi)});
}
console.log(JSON.stringify(output.sort((a,b)=>b.alignment.similarity-a.alignment.similarity).slice(0,20),null,2));
