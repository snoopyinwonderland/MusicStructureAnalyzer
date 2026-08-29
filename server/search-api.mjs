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
const score=(q,c)=>{const qf=features(q),cf=features(c),direction=100-mean(qf.c.map((v,i)=>v==cf.c[i]?0:100));let interval=100-mean(qf.i.map((v,i)=>Math.min(100,Math.abs(v-(cf.i[i]??v+7))*14))),rhythm=100-mean(qf.r.map((v,i)=>Math.min(100,Math.abs(v-(cf.r[i]??v+1))*45))),pitch=100-mean(q.map((n,i)=>Math.min(100,Math.abs((n.pitchMidi-q[0].pitchMidi)-((c[i]?.pitchMidi??c[0].pitchMidi)-c[0].pitchMidi))*10)));if(q[0]?._mode==='contour'){const shape=n=>n===0?'S':`${Math.abs(n)<=2?'STEP':'LEAP'}_${n>0?'U':'D'}`,weights=qf.i.map((_,i)=>Number(q[i+1]?.contourShapeConfidence??1)),total=weights.reduce((a,b)=>a+b,0)||1,specific=100-weights.reduce((sum,weight,i)=>sum+(shape(qf.i[i])===shape(cf.i[i]??-qf.i[i])?0:100*weight),0)/total;interval=specific;pitch=specific;rhythm=direction}return{pitch:clamp(pitch),interval:clamp(interval),contour:clamp(direction),rhythm:clamp(rhythm)}};

const direction=n=>Math.sign(n);
const shape=n=>n===0?'S':`${Math.abs(n)<=2?'STEP':'LEAP'}_${n>0?'U':'D'}`;
const transitionCost=(query,candidate,i,j,mode)=>{
 if(i===0)return 0;
 const qi=query[i].pitchMidi-query[i-1].pitchMidi,ci=j?candidate[j].pitchMidi-candidate[j-1].pitchMidi:99;
 const directionCost=direction(qi)===direction(ci)?0:1,shapeCost=shape(qi)===shape(ci)?0:.32,intervalCost=Math.min(1,Math.abs(qi-ci)/7);
 const qRatio=query[i].durationRatio/(query[i-1].durationRatio||1),cRatio=j?candidate[j].durationRatio/(candidate[j-1].durationRatio||1):4,rhythmCost=Math.min(1,Math.abs(Math.log2(Math.max(.0625,qRatio)/Math.max(.0625,cRatio)))/2);
 if(mode==='contour')return directionCost?1:shapeCost*Number(query[i]?.contourShapeConfidence??1);
 if(mode==='melody_rhythm')return .42*intervalCost+.28*directionCost+.12*shapeCost+.18*rhythmCost;
 return .58*intervalCost+.3*directionCost+.12*shapeCost;
};

// Semi-global Smith-Waterman-style alignment: the complete query is aligned to
// the best local candidate span, while candidate prefix/suffix notes are free.
export function alignLocal(query,candidate,mode='melody'){
 const n=query.length,m=candidate.length,insertCost=.42,deleteCost=.62;
 const dp=Array.from({length:n+1},()=>Array(m+1).fill(Infinity)),back=Array.from({length:n+1},()=>Array(m+1).fill(null));
 for(let j=0;j<=m;j++)dp[0][j]=0;
 for(let i=1;i<=n;i++){dp[i][0]=i*deleteCost;back[i][0]={i:i-1,j:0,type:'deletion',cost:deleteCost}}
 for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){
  const substitution=transitionCost(query,candidate,i-1,j-1,mode),choices=[{value:dp[i-1][j-1]+substitution,i:i-1,j:j-1,type:substitution<.18?'match':'substitution',cost:substitution},{value:dp[i][j-1]+insertCost,i,j:j-1,type:'insertion',cost:insertCost},{value:dp[i-1][j]+deleteCost,i:i-1,j,type:'deletion',cost:deleteCost}],best=choices.sort((a,b)=>a.value-b.value)[0];
  dp[i][j]=best.value;back[i][j]=best;
 }
 let end=0;for(let j=1;j<=m;j++)if(dp[n][j]<dp[n][end])end=j;
 const path=[];let i=n,j=end;
 while(i>0){const step=back[i][j];if(!step)break;path.push({queryIndex:step.type==='insertion'?null:i-1,candidateIndex:step.type==='deletion'?null:j-1,cost:step.cost,type:step.type});i=step.i;j=step.j}
 path.reverse();
 const mapped=path.filter(x=>x.queryIndex!==null&&x.candidateIndex!==null),start=mapped.length?Math.min(...mapped.map(x=>x.candidateIndex)):0,finish=mapped.length?Math.max(...mapped.map(x=>x.candidateIndex)):0,coverage=mapped.length/Math.max(1,n),normalized=dp[n][end]/Math.max(1,n);
 return{path,start,end:finish,coverage,cost:dp[n][end],similarity:clamp(100*Math.exp(-normalized/.48)*coverage)};
}

export const prepareQueryNotes=events=>{
 const notes=[];let onset=0;
 for(const event of events||[]){const duration=Number(event.durationRatio)||0;if(event.kind==='note'&&event.pitchMidi!=null){const prior=notes.at(-1);if(event.tieGroup&&prior?.tieGroup===event.tieGroup&&prior.pitchMidi===event.pitchMidi)prior.durationRatio+=duration;else notes.push({...event,onset});}onset+=duration}
 return notes;
};
const rhythmValues=events=>events.map((event,index)=>{const next=events[index+1];return next&&Number.isFinite(next.onset)&&Number.isFinite(event.onset)?Math.max(1/64,next.onset-event.onset):Math.max(1/64,Number(event.durationRatio)||0)});
// About 9% timing variation is treated as equivalent. Beyond that dead zone,
// the quadratic term keeps small changes gentle and makes large changes costly.
const durationDistance=(queryDuration,candidateDuration)=>{const error=Math.abs(Math.log2(Math.max(.03125,queryDuration)/Math.max(.03125,candidateDuration))),excess=Math.max(0,error-.125);return Math.min(1.5,excess+1.35*excess*excess)};
export const rhythmRankFactor=similarity=>similarity>=85?1:similarity>=65?.82+.18*(similarity-65)/20:similarity>=45?.45+.37*(similarity-45)/20:.2+.25*Math.max(0,similarity)/45;

// Rhythm DTW is deliberately narrow: only 1:1, 1:2 and 2:1 duration groups
// are allowed, and paths cannot leave a 22% diagonal band.
export function alignRhythmDtw(query,candidate){
 const q=rhythmValues(query),c=rhythmValues(candidate),n=q.length,m=c.length;
 if(!n||!m)return{cost:Infinity,similarity:0};
 const qTotal=q.reduce((a,b)=>a+b,0),cTotal=c.reduce((a,b)=>a+b,0),tempo=cTotal/qTotal||1,scaled=c.map(x=>x/tempo),dp=Array.from({length:n+1},()=>Array(m+1).fill(Infinity));
 dp[0][0]=0;
 for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){
  if(Math.abs(i/n-j/m)>.22+1/Math.max(n,m))continue;
  dp[i][j]=Math.min(
   dp[i-1][j-1]+durationDistance(q[i-1],scaled[j-1]),
   j>=2?dp[i-1][j-2]+durationDistance(q[i-1],scaled[j-2]+scaled[j-1])+.14:Infinity,
   i>=2?dp[i-2][j-1]+durationDistance(q[i-2]+q[i-1],scaled[j-1])+.14:Infinity,
  );
 }
 const normalized=dp[n][m]/Math.max(n,m);
 return{cost:dp[n][m],similarity:Number.isFinite(normalized)?clamp(100*Math.exp(-normalized/.42)):0};
}
const cache=()=>{try{return existsSync(youtubePath)?JSON.parse(readFileSync(youtubePath,'utf8')):{}}catch{return{}}};
const youtubeId=(all,id,title)=>{const item=all[id]||all[title]||Object.values(all).find(x=>x?.workId===id);return item?.youtubeId||item?.videoId};
const musicxmlRoot='K:/Music Analysis/musicxml/';
const keyCache=new Map();
const sourceKey=source=>{if(keyCache.has(source))return keyCache.get(source);try{const xml=readFileSync(musicxmlRoot+source,'utf8'),match=xml.match(/<fifths>\s*(-?\d+)\s*<\/fifths>/);const value=match?Number(match[1]):0;keyCache.set(source,value);return value}catch{return 0}};
const sourceClef=(source,streamId,targetMeasure,notes)=>{try{const [partId,staff='1']=streamId.split(':'),xml=readFileSync(musicxmlRoot+source,'utf8'),part=xml.match(new RegExp(`<part\\s+id="${partId}"[^>]*>([\\s\\S]*?)<\\/part>`))?.[1]||'';let found=null;for(const match of part.matchAll(/<measure\b[^>]*number="([^"]+)"[^>]*>([\s\S]*?)<\/measure>/g)){const number=Number(match[1]);if(Number.isFinite(number)&&number>targetMeasure)break;for(const clef of match[2].matchAll(/<clef\b([^>]*)>([\s\S]*?)<\/clef>/g)){const assigned=clef[1].match(/number="(\d+)"/)?.[1]||'1';if(assigned!==staff)continue;const shape=clef[2].match(/<sign>\s*([GFC])\s*<\/sign>/)?.[1],line=Number(clef[2].match(/<line>\s*(\d+)\s*<\/line>/)?.[1]);if(shape)found={shape,line:line||(shape==='F'?4:2)}}}if(found)return found}catch{}const pitches=notes.map(n=>n.pitchMidi).sort((a,b)=>a-b),median=pitches[Math.floor(pitches.length/2)]||60;return median<60?{shape:'F',line:4}:{shape:'G',line:2}};
const displayComposer=value=>String(value||'').split(/\r?\n/).find(line=>/^\s*composed by\b/i.test(line))?.trim()||'';
const corpusNotes=(id,raw)=>raw.map((n,i)=>({id:`${id}-${i}`,kind:'note',pitchMidi:n.p,spelling:n.s,durationRatio:n.d,onset:n.o,measure:n.m,beat:n.b,metricStrength:n.b===1?1:.5,structuralSalience:.5,structuralConfidence:.65,chordRole:'unknown'}));

const measureCache=new Map();
const sourceMeter=(source,streamId,targetMeasure)=>{try{const partId=streamId.split(':')[0],xml=readFileSync(musicxmlRoot+source,'utf8'),part=xml.match(new RegExp(`<part\\s+id="${partId}"[^>]*>([\\s\\S]*?)<\\/part>`))?.[1]||'';let meter={count:4,unit:4};for(const match of part.matchAll(/<measure\b[^>]*number="([^"]+)"[^>]*>([\s\S]*?)<\/measure>/g)){const number=Number(match[1]);if(Number.isFinite(number)&&number>targetMeasure)break;const count=Number(match[2].match(/<beats>\s*(\d+)\s*<\/beats>/)?.[1]),unit=Number(match[2].match(/<beat-type>\s*(\d+)\s*<\/beat-type>/)?.[1]);if(count&&unit)meter={count,unit}}return meter}catch{return{count:4,unit:4}}};
export const firstMeasureIsPickup=(body,attrs='')=>{
 const divisions=Number(body.match(/<divisions>\s*(\d+)\s*<\/divisions>/)?.[1]||1),beats=(body.match(/<beats>\s*([\d+]+)\s*<\/beats>/)?.[1]||'4').split('+').reduce((sum,x)=>sum+Number(x),0),beatType=Number(body.match(/<beat-type>\s*(\d+)\s*<\/beat-type>/)?.[1]||4),nominal=divisions*beats*4/beatType;
 let cursor=0,maximum=0;
 for(const token of body.matchAll(/<(note|backup|forward)\b[^>]*>([\s\S]*?)<\/\1>/g)){const kind=token[1],content=token[2],duration=Number(content.match(/<duration>\s*(\d+)\s*<\/duration>/)?.[1]||0);if(kind==='backup')cursor-=duration;else if(kind==='forward'){cursor+=duration;maximum=Math.max(maximum,cursor)}else if(!/<chord\b/.test(content)&&!/<grace\b/.test(content)){cursor+=duration;maximum=Math.max(maximum,cursor)}}
 return /\bimplicit="yes"/i.test(attrs)||(nominal>0&&maximum>0&&maximum<nominal-.001);
};
const sourceMeasures=(source,streamId)=>{const partId=streamId.split(':')[0],key=`${source}:${partId}`;if(measureCache.has(key))return measureCache.get(key);try{const xml=readFileSync(musicxmlRoot+source,'utf8'),part=xml.match(new RegExp(`<part\\s+id="${partId}"[^>]*>([\\s\\S]*?)<\\/part>`))?.[1]||'',matches=[...part.matchAll(/<measure\b([^>]*)>([\s\S]*?)<\/measure>/g)],firstAttrs=matches[0]?.[1]||'',firstDeclared=firstAttrs.match(/\bnumber="([^"]+)"/)?.[1]??'1',pickup=firstMeasureIsPickup(matches[0]?.[2]||'',firstAttrs),shift=pickup&&Number.isFinite(Number(firstDeclared))?Number(firstDeclared):0,values=matches.map((m,i)=>{const declared=m[1].match(/\bnumber="([^"]+)"/)?.[1]??String(i+1),numeric=Number(declared);return{ordinal:i+1,label:Number.isFinite(numeric)?String(numeric-shift):(i===0&&pickup?'0':declared)}});measureCache.set(key,values);return values}catch{return[]}};
export const displayMeasure=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:String(value)};
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
 const notes=prepareQueryNotes(query.events);
 if(notes.length)notes[0]._mode=query.mode;
 if(notes.length<4)return{exact:[],similar:[]};
 const contourMode=query.mode==='contour';
 const qg=qgrams(features(notes)).filter(g=>!contourMode||g.token.startsWith('c:'));
 const hits=new Map(),sql=database().prepare('SELECT work_id,pos FROM grams WHERE token=? LIMIT 3000');
 for(const gram of qg)for(const row of sql.all(gram.token)){const start=Math.max(0,Number(row.pos)-gram.pos),key=`${row.work_id}\u0000${start}`;hits.set(key,(hits.get(key)||0)+1)}
 const candidates=[...hits].sort((a,b)=>b[1]-a[1]).slice(0,350),get=database().prepare('SELECT * FROM works WHERE id=?'),yt=cache(),best=new Map();
 for(const [key,hitCount] of candidates){
  const [id,startText]=key.split('\u0000'),row=get.get(id);if(!row)continue;
  const all=JSON.parse(row.notes),start=+startText,margin=Math.max(3,Math.ceil(notes.length*.3)),windowStart=Math.max(0,start-margin),windowRaw=all.slice(windowStart,Math.min(all.length,start+notes.length+margin)),windowNotes=corpusNotes(id,windowRaw);
  if(windowNotes.length<Math.max(4,notes.length-1))continue;
  const localAlignment=contourMode?null:alignLocal(notes,windowNotes,query.mode);
  if(localAlignment&&localAlignment.coverage<.75)continue;
  const alignedPairs=localAlignment?localAlignment.path.filter(x=>x.queryIndex!==null&&x.candidateIndex!==null):notes.map((_,i)=>({queryIndex:i,candidateIndex:Math.min(windowNotes.length-1,start-windowStart+i),cost:0,type:'match'}));
  const alignedQuery=alignedPairs.map(x=>notes[x.queryIndex]),alignedCandidate=alignedPairs.map(x=>windowNotes[x.candidateIndex]),scores=score(alignedQuery,alignedCandidate),rhythmSpan=localAlignment?windowNotes.slice(localAlignment.start,localAlignment.end+1):alignedCandidate,rhythmDtw=query.mode==='melody_rhythm'?alignRhythmDtw(notes,rhythmSpan):null;
  if(rhythmDtw)scores.rhythm=rhythmDtw.similarity;
  // A contour result must match every U/D/S direction. Step/leap agreement ranks it higher.
  if(contourMode&&scores.contour<99.9)continue;
  const local=contourMode?.7*scores.interval+.3*scores.contour:query.mode==='melody_rhythm'?localAlignment.similarity*rhythmRankFactor(rhythmDtw.similarity):localAlignment.similarity;
  const noGaps=!localAlignment||localAlignment.path.every(x=>x.type==='match'||x.type==='substitution');
  const exact=contourMode?scores.interval>99.9:noGaps&&scores.interval>99.9&&scores.contour>99.9&&(query.mode==='melody'||scores.rhythm>98);
  const existing=best.get(id);if(existing&&existing.localSimilarity>=local)continue;
  const detectedStart=windowStart+(localAlignment?.start??start-windowStart),detectedEnd=windowStart+(localAlignment?.end??start-windowStart+notes.length-1),first=all[detectedStart],last=all[detectedEnd];if(!first||!last)continue;
  const m0=first.m,m1=last.m,excerptRaw=all.filter(n=>n.m>=m0&&n.m<=m1),excerptStart=all.findIndex(n=>n===excerptRaw[0]),excerpt=corpusNotes(id,excerptRaw);
  const alignment=(localAlignment?.path??alignedPairs).map(x=>({queryIndex:x.queryIndex,candidateIndex:x.candidateIndex===null?null:windowStart+x.candidateIndex-excerptStart,cost:x.cost,type:x.type}));
  const insertions=alignment.filter(x=>x.type==='insertion').length,deletions=alignment.filter(x=>x.type==='deletion').length;
  const alignmentEvidence=`장식음·추가음 ${insertions}개, 누락 대응 ${deletions}개를 허용한 유사도 ${Math.round(local)}점입니다.`,why=contourMode?[`입력한 U/D/S 진행 방향이 이 구간과 모두 일치합니다.`,`Step/Leap 세부 형태 일치도는 ${Math.round(scores.interval)}점입니다.`]:rhythmDtw?[`n-gram 후보를 local alignment로 다시 정렬해 실제 일치 구간을 찾았습니다.`,alignmentEvidence,`제한적 rhythm DTW 일치도는 ${Math.round(rhythmDtw.similarity)}점입니다.`]:[`n-gram 후보를 local alignment로 다시 정렬해 실제 일치 구간을 찾았습니다.`,alignmentEvidence];
  best.set(id,{kind:exact?'exact':'similar',ranking:clamp(local+.25*Math.min(20,hitCount)),localSimilarity:clamp(local),occurrenceImportance:clamp(55+row.role*35),scores:{...scores,meter:first.b===1?100:55,structural:Math.round(row.role*100)},startMeasure:m0,startBeat:first.b,endMeasure:m1,alignment,why,work:{workId:id,sourceId:row.source,streamId:row.stream_id,title:row.title,artist:row.composer||'Unknown',year:'',genre:'MusicXML',accent:'#52736a',notes:excerpt,melodyRoleScore:row.role,roleConfidence:row.role,analysisConfidence:.72,prominence:.65,youtubeId:youtubeId(yt,id,row.title)}});
 }
 const list=[...best.values()].sort((a,b)=>b.ranking-a.ranking).slice(0,limit);
 for(const item of list){
  item.work.artist=displayComposer(item.work.artist);item.work.keyFifths=sourceKey(item.work.sourceId);
  const originalStart=item.startMeasure,clef=sourceClef(item.work.sourceId,item.work.streamId,originalStart,item.work.notes),meter=sourceMeter(item.work.sourceId,item.work.streamId,originalStart),partName=sourcePartName(item.work.sourceId,item.work.streamId),labels=sourceMeasures(item.work.sourceId,item.work.streamId),label=n=>labels.find(x=>x.ordinal===n)?.label??String(n);
  item.work.clefShape=clef.shape;item.work.clefLine=clef.line;item.work.meter=`${meter.count}/${meter.unit}`;item.work.partName=partName;item.work.genre=`MusicXML · ${partName}`;
  item.startMeasure=displayMeasure(label(item.startMeasure));item.endMeasure=displayMeasure(label(item.endMeasure));
  for(const note of item.work.notes){note.measure=displayMeasure(label(note.measure));note.clefShape=clef.shape;note.clefLine=clef.line;note.meterCount=meter.count;note.meterUnit=meter.unit;note.partName=partName;note.keyFifths=item.work.keyFifths}
 }
 return{exact:list.filter(x=>x.kind==='exact'),similar:list.filter(x=>x.kind==='similar')};
}

export function getWork(id){
 const row=database().prepare('SELECT * FROM works WHERE id=?').get(id);if(!row)return null;
 const raw=JSON.parse(row.notes),notes=corpusNotes(row.id,raw),labels=sourceMeasures(row.source,row.stream_id),label=n=>labels.find(x=>x.ordinal===n)?.label??String(n),clef=sourceClef(row.source,row.stream_id,raw[0]?.m||1,notes),meter=sourceMeter(row.source,row.stream_id,raw[0]?.m||1),partName=sourcePartName(row.source,row.stream_id),keyFifths=sourceKey(row.source),pitchNames=new Map(),durations=new Map(),motifs=new Map(),measures=new Map();
 for(const note of notes){note.measure=displayMeasure(label(note.measure));note.clefShape=clef.shape;note.clefLine=clef.line;note.meterCount=meter.count;note.meterUnit=meter.unit;note.partName=partName;note.keyFifths=keyFifths}
 for(const n of raw){pitchNames.set(n.s,(pitchNames.get(n.s)||0)+1);durations.set(n.d,(durations.get(n.d)||0)+1);measures.set(label(n.m),(measures.get(label(n.m))||0)+1)}
 for(let i=0;i<raw.length-3;i++){const motif=raw.slice(i,i+4).map((n,j,a)=>j?n.p-a[j-1].p:0).slice(1).join(',');motifs.set(motif,(motifs.get(motif)||0)+1)}
 const top=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([label,count])=>({label:String(label),count}));let xml='';try{xml=readFileSync(musicxmlRoot+row.source,'utf8')}catch{}const yt=cache();
 return{workId:row.id,streamId:row.stream_id,partName,title:row.title,artist:displayComposer(row.composer),sourceId:row.source,keyFifths,clefShape:clef.shape,clefLine:clef.line,meter:`${meter.count}/${meter.unit}`,youtubeId:youtubeId(yt,row.id,row.title),notes,xml,stats:{pitches:top(pitchNames),rhythms:top(durations),motifs:rankedMotifs(raw),structure:{measures:measures.size,notes:raw.length,peakMeasures:top(measures).slice(0,5)}}};
}

export function searchApiPlugin(){return{name:'musicanote-search-api',configureServer(server){server.middlewares.use('/api/search/v2/melody',(req,res)=>{if(req.method!=='POST'){res.statusCode=405;return res.end()}let body='';req.on('data',x=>body+=x);req.on('end',()=>{try{if(!existsSync(dbPath))throw new Error('Search index is not built. Run pnpm index:sqlite.');res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(searchDatabase(JSON.parse(body).query,JSON.parse(body).limit||20)))}catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}))}})})}}}
export function workApiPlugin(){return{name:'musicanote-work-api',configureServer(server){server.middlewares.use('/api/work/',(req,res)=>{const id=decodeURIComponent((req.url||'').split('?')[0].replace(/^\//,'')),work=getWork(id);res.setHeader('Content-Type','application/json; charset=utf-8');if(!work){res.statusCode=404;return res.end(JSON.stringify({error:'Work not found'}))}res.end(JSON.stringify(work))})}}}
