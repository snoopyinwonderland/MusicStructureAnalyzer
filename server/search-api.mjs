import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dbPath=fileURLToPath(new URL('../data/search-index-v2/search.sqlite',import.meta.url));
const youtubePath=fileURLToPath(new URL('../data/youtube-matches.json',import.meta.url));
let db;
const database=()=>db??=new DatabaseSync(dbPath,{readOnly:true});
const clamp=n=>Math.max(0,Math.min(100,n));
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const quantize=n=>Math.round(n*8)/8;
const token=(kind,values)=>`${kind}:${values.join(',')}`;
const features=notes=>{const p=notes.map(n=>n.pitchMidi),d=notes.map(n=>n.durationRatio),i=p.slice(1).map((v,x)=>v-p[x]);return{i,c:i.map(Math.sign),r:d.map(v=>quantize(v/(d.find(x=>x>0)||1)))}};
const qgrams=f=>Object.entries(f).flatMap(([kind,values])=>values.slice(0,Math.max(0,values.length-2)).map((_,pos)=>({token:token(kind,values.slice(pos,pos+3)),pos})));
const score=(q,c)=>{const qf=features(q),cf=features(c),direction=100-mean(qf.c.map((v,i)=>v==cf.c[i]?0:100));let interval=100-mean(qf.i.map((v,i)=>Math.min(100,Math.abs(v-(cf.i[i]??v+7))*14))),rhythm=100-mean(qf.r.map((v,i)=>Math.min(100,Math.abs(v-(cf.r[i]??v+1))*45))),pitch=100-mean(q.map((n,i)=>Math.min(100,Math.abs((n.pitchMidi-q[0].pitchMidi)-((c[i]?.pitchMidi??c[0].pitchMidi)-c[0].pitchMidi))*10)));if(q[0]?._mode==='contour'){const shape=n=>n===0?'S':`${Math.abs(n)<=2?'STEP':'LEAP'}_${n>0?'U':'D'}`,specific=100-mean(qf.i.map((v,i)=>shape(v)===shape(cf.i[i]??-v)?0:100));interval=specific;pitch=specific;rhythm=direction}return{pitch:clamp(pitch),interval:clamp(interval),contour:clamp(direction),rhythm:clamp(rhythm)}};
const cache=()=>{try{return existsSync(youtubePath)?JSON.parse(readFileSync(youtubePath,'utf8')):{}}catch{return{}}};
const youtubeId=(all,id,title)=>{const item=all[id]||all[title]||Object.values(all).find(x=>x?.workId===id);return item?.youtubeId||item?.videoId};
const musicxmlRoot='K:/Music Analysis/musicxml/';
const keyCache=new Map();
const sourceKey=source=>{if(keyCache.has(source))return keyCache.get(source);try{const xml=readFileSync(musicxmlRoot+source,'utf8'),match=xml.match(/<fifths>\s*(-?\d+)\s*<\/fifths>/);const value=match?Number(match[1]):0;keyCache.set(source,value);return value}catch{return 0}};
const sourceClef=(source,streamId,targetMeasure,notes)=>{try{const [partId,staff='1']=streamId.split(':'),xml=readFileSync(musicxmlRoot+source,'utf8'),part=xml.match(new RegExp(`<part\\s+id="${partId}"[^>]*>([\\s\\S]*?)<\\/part>`))?.[1]||'';let found=null;for(const match of part.matchAll(/<measure\b[^>]*number="([^"]+)"[^>]*>([\s\S]*?)<\/measure>/g)){const number=Number(match[1]);if(Number.isFinite(number)&&number>targetMeasure)break;for(const clef of match[2].matchAll(/<clef\b([^>]*)>([\s\S]*?)<\/clef>/g)){const assigned=clef[1].match(/number="(\d+)"/)?.[1]||'1';if(assigned!==staff)continue;const shape=clef[2].match(/<sign>\s*([GFC])\s*<\/sign>/)?.[1],line=Number(clef[2].match(/<line>\s*(\d+)\s*<\/line>/)?.[1]);if(shape)found={shape,line:line||(shape==='F'?4:2)}}}if(found)return found}catch{}const pitches=notes.map(n=>n.pitchMidi).sort((a,b)=>a-b),median=pitches[Math.floor(pitches.length/2)]||60;return median<60?{shape:'F',line:4}:{shape:'G',line:2}};
const displayComposer=value=>String(value||'').split(/\r?\n/).find(line=>/^\s*composed by\b/i.test(line))?.trim()||'';
const corpusNotes=(id,raw)=>raw.map((n,i)=>({id:`${id}-${i}`,kind:'note',pitchMidi:n.p,spelling:n.s,durationRatio:n.d,measure:n.m,beat:n.b,metricStrength:n.b===1?1:.5,structuralSalience:.5,structuralConfidence:.65,chordRole:'unknown'}));

const measureCache=new Map();
const sourceMeter=(source,streamId,targetMeasure)=>{try{const partId=streamId.split(':')[0],xml=readFileSync(musicxmlRoot+source,'utf8'),part=xml.match(new RegExp(`<part\\s+id="${partId}"[^>]*>([\\s\\S]*?)<\\/part>`))?.[1]||'';let meter={count:4,unit:4};for(const match of part.matchAll(/<measure\b[^>]*number="([^"]+)"[^>]*>([\s\S]*?)<\/measure>/g)){const number=Number(match[1]);if(Number.isFinite(number)&&number>targetMeasure)break;const count=Number(match[2].match(/<beats>\s*(\d+)\s*<\/beats>/)?.[1]),unit=Number(match[2].match(/<beat-type>\s*(\d+)\s*<\/beat-type>/)?.[1]);if(count&&unit)meter={count,unit}}return meter}catch{return{count:4,unit:4}}};
const sourceMeasures=(source,streamId)=>{const partId=streamId.split(':')[0],key=`${source}:${partId}`;if(measureCache.has(key))return measureCache.get(key);try{const xml=readFileSync(musicxmlRoot+source,'utf8'),part=xml.match(new RegExp(`<part\\s+id="${partId}"[^>]*>([\\s\\S]*?)<\\/part>`))?.[1]||'',values=[...part.matchAll(/<measure\b[^>]*number="([^"]+)"/g)].map((m,i)=>({ordinal:i+1,label:m[1]}));measureCache.set(key,values);return values}catch{return[]}};
const sourcePartName=(source,streamId)=>{try{const partId=streamId.split(':')[0],xml=readFileSync(musicxmlRoot+source,'utf8'),block=xml.match(new RegExp(`<score-part\\s+id="${partId}"[^>]*>([\\s\\S]*?)<\\/score-part>`))?.[1]||'';return block.match(/<part-name[^>]*>([\s\S]*?)<\/part-name>/)?.[1].replace(/<[^>]+>/g,'').trim()||partId}catch{return streamId.split(':')[0]}};

const rankedMotifs=raw=>{
 const groups=new Map();
 for(let length=4;length<=8;length++)for(let i=0;i<=raw.length-length;i++){
  const window=raw.slice(i,i+length),intervals=window.slice(1).map((n,j)=>n.p-window[j].p),key=intervals.join(','),span=window.reduce((sum,n)=>sum+Number(n.d||0),0),entry=groups.get(key)||{key,length,count:0,totalSpan:0};
  entry.count++;entry.totalSpan+=span;groups.set(key,entry);
 }
 const repeated=[...groups.values()].filter(x=>x.count>=2).map(x=>({...x,score:x.count*(1+.28*(x.length-4))*Math.log2(2+x.totalSpan/x.count)})).sort((a,b)=>b.score-a.score||b.length-a.length);
 const chosen=[];
 for(const candidate of repeated){if(chosen.some(x=>x.length>candidate.length&&(`,${x.key},`).includes(`,${candidate.key},`)&&x.score>=candidate.score))continue;chosen.push(candidate);if(chosen.length===8)break}
 return chosen.map(x=>({label:`${x.length} notes · ${x.key}`,count:x.count,score:Number(x.score.toFixed(2))}));
};

export function searchDatabase(query,limit=20){
 const notes=[];
 for(const event of query.events||[]){
  if(event.kind!=='note'||event.pitchMidi==null)continue;
  const prior=notes.at(-1);
  if(event.tieGroup&&prior?.tieGroup===event.tieGroup&&prior.pitchMidi===event.pitchMidi)prior.durationRatio+=event.durationRatio;
  else notes.push({...event});
 }
 if(notes.length)notes[0]._mode=query.mode;
 if(notes.length<4)return{exact:[],similar:[]};
 const contourMode=query.mode==='contour';
 const qg=qgrams(features(notes)).filter(g=>!contourMode||g.token.startsWith('c:'));
 const hits=new Map(),sql=database().prepare('SELECT work_id,pos FROM grams WHERE token=? LIMIT 3000');
 for(const gram of qg)for(const row of sql.all(gram.token)){const start=Math.max(0,Number(row.pos)-gram.pos),key=`${row.work_id}\u0000${start}`;hits.set(key,(hits.get(key)||0)+1)}
 const candidates=[...hits].sort((a,b)=>b[1]-a[1]).slice(0,350),get=database().prepare('SELECT * FROM works WHERE id=?'),yt=cache(),best=new Map();
 for(const [key,hitCount] of candidates){
  const [id,startText]=key.split('\u0000'),row=get.get(id);if(!row)continue;
  const all=JSON.parse(row.notes),start=+startText;
  for(const offset of[-1,0,1]){
   const s=Math.max(0,start+offset),slice=all.slice(s,s+notes.length);if(slice.length<Math.max(3,notes.length-1))continue;
   const corpus=corpusNotes(id,slice),scores=score(notes,corpus);
   // A contour result must match every U/D/S direction. Step/leap agreement ranks it higher.
   if(contourMode&&scores.contour<99.9)continue;
   const local=contourMode?.7*scores.interval+.3*scores.contour:.36*scores.interval+.27*scores.contour+(query.mode==='melody_rhythm'?.22*scores.rhythm:.07*scores.rhythm)+.15*scores.pitch;
   const exact=contourMode?scores.interval>99.9:scores.interval>99.9&&scores.contour>99.9&&(query.mode==='melody'||scores.rhythm>98);
   const existing=best.get(id);if(existing&&existing.localSimilarity>=local)continue;
   const first=all[s],last=all[Math.min(all.length-1,s+slice.length-1)],m0=first.m,m1=last.m,excerptRaw=all.filter(n=>n.m>=m0&&n.m<=m1),excerptStart=all.findIndex(n=>n===excerptRaw[0]),excerpt=corpusNotes(id,excerptRaw);
   const alignment=notes.map((_,i)=>({queryIndex:i,candidateIndex:(s-excerptStart)+i,cost:Math.max(0,(100-local)/100),type:scores.interval>80?'match':'substitution'}));
   best.set(id,{kind:exact?'exact':'similar',ranking:clamp(local+.25*Math.min(20,hitCount)),localSimilarity:clamp(local),occurrenceImportance:clamp(55+row.role*35),scores:{...scores,meter:first.b===1?100:55,structural:Math.round(row.role*100)},startMeasure:m0,startBeat:first.b,endMeasure:m1,alignment,why:contourMode?[`입력한 U/D/S 진행 방향이 이 구간과 모두 일치합니다.`,`Step/Leap 세부 형태 일치도는 ${Math.round(scores.interval)}점입니다.`]:[`후보 n-gram ${hitCount}개가 이 위치를 지목했습니다.`,`유사도 계산에 음정 ${Math.round(scores.interval)}, 윤곽 ${Math.round(scores.contour)}, 리듬 ${Math.round(scores.rhythm)}점이 반영되었습니다.`],work:{workId:id,sourceId:row.source,streamId:row.stream_id,title:row.title,artist:row.composer||'Unknown',year:'',genre:'MusicXML',accent:'#52736a',notes:excerpt,melodyRoleScore:row.role,roleConfidence:row.role,analysisConfidence:.72,prominence:.65,youtubeId:youtubeId(yt,id,row.title)}});
  }
 }
 const list=[...best.values()].sort((a,b)=>b.ranking-a.ranking).slice(0,limit);
 for(const item of list){item.work.artist=displayComposer(item.work.artist);item.work.keyFifths=sourceKey(item.work.sourceId);const originalStart=item.startMeasure,clef=sourceClef(item.work.sourceId,item.work.streamId,originalStart,item.work.notes),meter=sourceMeter(item.work.sourceId,item.work.streamId,originalStart),partName=sourcePartName(item.work.sourceId,item.work.streamId),labels=sourceMeasures(item.work.sourceId,item.work.streamId),label=n=>labels.find(x=>x.ordinal===n)?.label??String(n);item.work.clefShape=clef.shape;item.work.clefLine=clef.line;item.work.meter=`${meter.count}/${meter.unit}`;item.work.partName=partName;item.work.genre=`MusicXML · ${partName}`;item.startMeasure=Number(label(item.startMeasure))||item.startMeasure;item.endMeasure=Number(label(item.endMeasure))||item.endMeasure;for(const note of item.work.notes){note.measure=Number(label(note.measure))||note.measure;note.clefShape=clef.shape;note.clefLine=clef.line;note.meterCount=meter.count;note.meterUnit=meter.unit;note.partName=partName;note.keyFifths=item.work.keyFifths}}
 return{exact:list.filter(x=>x.kind==='exact'),similar:list.filter(x=>x.kind==='similar')};
}

export function getWork(id){const row=database().prepare('SELECT * FROM works WHERE id=?').get(id);if(!row)return null;const raw=JSON.parse(row.notes),notes=corpusNotes(row.id,raw),labels=sourceMeasures(row.source,row.stream_id),label=n=>labels.find(x=>x.ordinal===n)?.label??String(n),clef=sourceClef(row.source,row.stream_id,raw[0]?.m||1,notes),meter=sourceMeter(row.source,row.stream_id,raw[0]?.m||1),partName=sourcePartName(row.source,row.stream_id),keyFifths=sourceKey(row.source),pitchNames=new Map(),durations=new Map(),motifs=new Map(),measures=new Map();for(const note of notes){note.measure=Number(label(note.measure))||note.measure;note.clefShape=clef.shape;note.clefLine=clef.line;note.meterCount=meter.count;note.meterUnit=meter.unit;note.partName=partName;note.keyFifths=keyFifths}for(const n of raw){pitchNames.set(n.s,(pitchNames.get(n.s)||0)+1);durations.set(n.d,(durations.get(n.d)||0)+1);measures.set(label(n.m),(measures.get(label(n.m))||0)+1)}for(let i=0;i<raw.length-3;i++){const motif=raw.slice(i,i+4).map((n,j,a)=>j?n.p-a[j-1].p:0).slice(1).join(',');motifs.set(motif,(motifs.get(motif)||0)+1)}const top=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([label,count])=>({label:String(label),count}));let xml='';try{xml=readFileSync(musicxmlRoot+row.source,'utf8')}catch{}const yt=cache();return{workId:row.id,streamId:row.stream_id,partName,title:row.title,artist:displayComposer(row.composer),sourceId:row.source,keyFifths,clefShape:clef.shape,clefLine:clef.line,meter:`${meter.count}/${meter.unit}`,youtubeId:youtubeId(yt,row.id,row.title),notes,xml,stats:{pitches:top(pitchNames),rhythms:top(durations),motifs:rankedMotifs(raw),structure:{measures:measures.size,notes:raw.length,peakMeasures:top(measures).slice(0,5)}}}}

export function searchApiPlugin(){return{name:'musicanote-search-api',configureServer(server){server.middlewares.use('/api/search/v2/melody',(req,res)=>{if(req.method!=='POST'){res.statusCode=405;return res.end()}let body='';req.on('data',x=>body+=x);req.on('end',()=>{try{if(!existsSync(dbPath))throw new Error('Search index is not built. Run pnpm index:sqlite.');res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(searchDatabase(JSON.parse(body).query,JSON.parse(body).limit||20)))}catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}))}})})}}}
export function workApiPlugin(){return{name:'musicanote-work-api',configureServer(server){server.middlewares.use('/api/work/',(req,res)=>{const id=decodeURIComponent((req.url||'').split('?')[0].replace(/^\//,'')),work=getWork(id);res.setHeader('Content-Type','application/json; charset=utf-8');if(!work){res.statusCode=404;return res.end(JSON.stringify({error:'Work not found'}))}res.end(JSON.stringify(work))})}}}
