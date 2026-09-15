import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { seedWindows } from './seed-windows.mjs';
import { analyzePhraseBoundaries, comparePhraseBoundaries } from './phrase-boundaries.mjs';
import { attachBreathSymbols } from './phrase-breath-symbols.mjs';
import { analyzeBoundaryHarmony } from './boundary-harmony.mjs';
import { musicXmlHarmonyStreams } from './musicxml-harmony-events.mjs';

const dbPath=process.env.MUSICANOTE_SEARCH_DB||fileURLToPath(new URL('../data/search-index-v2/search.sqlite',import.meta.url));
const meterContextPath=process.env.MUSICANOTE_METER_CONTEXT_DB||fileURLToPath(new URL('../data/search-index-v2/meter-context.sqlite',import.meta.url));
const youtubePath=fileURLToPath(new URL('../data/youtube-matches.json',import.meta.url));
let db;
const harmonyStreamCache=new Map(),harmonyStreamCacheLimit=128;
const database=()=>{if(!db){db=new DatabaseSync(dbPath,{readOnly:true});db.exec('PRAGMA query_only=ON; PRAGMA cache_size=-262144; PRAGMA mmap_size=4294967296; PRAGMA temp_store=MEMORY')}return db};
export function createWeightedLru(maxWeight){
 const values=new Map();let weight=0;
 return{get(key){if(!values.has(key))return;const entry=values.get(key);values.delete(key);values.set(key,entry);return entry.value},set(key,value,itemWeight=1){const size=Math.max(1,Number(itemWeight)||1),prior=values.get(key);if(prior){weight-=prior.weight;values.delete(key)}if(size>maxWeight)return;values.set(key,{value,weight:size});weight+=size;while(weight>maxWeight&&values.size){const oldest=values.keys().next().value,entry=values.get(oldest);values.delete(oldest);weight-=entry.weight}},clear(){values.clear();weight=0},stats(){return{entries:values.size,weight}}};
}
const parsedWorkCache=createWeightedLru(Math.max(16,Number(process.env.MUSICANOTE_PARSED_CACHE_MB)||128)*1024*1024);let parsedWorkCacheVersion=0;
const ensureParsedWorkCache=()=>{const version=statSync(dbPath).mtimeMs;if(parsedWorkCacheVersion!==version){parsedWorkCache.clear();parsedWorkCacheVersion=version}};
let corpusStatsCache;
export const corpusStats=()=>corpusStatsCache??=(row=>({works:Number(row.works),streams:Number(row.streams)}))(database().prepare('SELECT count(DISTINCT source) works,count(*) streams FROM works').get());
const clamp=n=>Math.max(0,Math.min(100,n));
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const quantize=n=>Math.round(n*8)/8;
export const optionalPositiveNumber=value=>value===null||value===undefined||String(value).trim()===''?NaN:Number(value);
const token=(kind,values)=>`${kind}:${values.join(',')}`;
const features=notes=>{const p=notes.map(n=>n.pitchMidi),d=notes.map(n=>n.durationRatio),i=p.slice(1).map((v,x)=>v-p[x]);return{i,c:i.map(Math.sign),r:d.map(v=>quantize(v/(d.find(x=>x>0)||1)))}};
const qgrams=f=>[...Object.entries(f).flatMap(([kind,values])=>values.slice(0,Math.max(0,values.length-2)).map((_,pos)=>({token:token(kind,values.slice(pos,pos+3)),pos}))),...f.i.slice(0,Math.max(0,f.i.length-4)).map((_,pos)=>({token:token('i5',f.i.slice(pos,pos+5)),pos}))];
export function motifImportance(role,occurrences,motifLength,workLength){
 const streamShare=clamp(100*Number(occurrences||0)*Number(motifLength||0)/Math.max(1,Number(workLength||0)));
 const repetition=clamp(100*Math.log2(1+Number(occurrences||0))/Math.log2(9));
 return clamp(.5*(55+45*clamp(Number(role||0)*100)/100)+.35*repetition+.15*streamShare);
}
export function diversifyCandidates(entries,limit=900,perWork=3){
 const buckets=new Map();for(const entry of [...entries].sort((a,b)=>b[1]-a[1])){const id=entry[0].split('\u0000')[0],bucket=buckets.get(id)||[];if(bucket.length<perWork){bucket.push(entry);buckets.set(id,bucket)}}
 const output=[];for(let round=0;round<perWork&&output.length<limit;round++)for(const bucket of buckets.values()){if(bucket[round])output.push(bucket[round]);if(output.length===limit)break}return output;
}
export function intervalRetrievalBonus(matched,total){
 const coverage=total?Math.min(1,Number(matched||0)/total):0;
 if(coverage>=.999)return 10000;
 // Long queries should degrade continuously: one changed/added note may break
 // several overlapping grams, but must not erase an otherwise strong seed.
 return total>=4&&coverage>=.6?1000*coverage*coverage:0;
}
export function retrievalRowLimit(kind,total,rarityRank=99,robust=true){
 const count=Math.max(0,Number(total)||0);
 if(kind==='i5')return Math.min(count,rarityRank<2?18000:6000);
 // Long, discriminative queries use a bounded two-tier posting scan. Most
 // interval 3-grams stop at 16k; only the rarest seed in each query half is
 // allowed to reach 50k. This covers a single changed note splitting the
 // surviving evidence without materializing every very common posting list.
 if(kind==='i')return Math.min(count,robust?(rarityRank<0?100000:rarityRank<2?50000:16000):rarityRank<2?16000:4000);
 return Math.min(count,3000);
}
export function splitIntervalSeedBonus(positions,queryLength){
 const unique=[...new Set(positions)].sort((a,b)=>a-b),span=unique.length>1?unique.at(-1)-unique[0]:0,required=Math.max(3,Math.ceil(Math.max(1,queryLength-4)*.6));
 return unique.length>=2&&span>=required?650+50*Math.min(3,unique.length-2):0;
}
const diatonicStep=(from,to)=>{const letters='CDEFGAB',a=letters.indexOf(String(from?.spelling||'')[0]?.toUpperCase()),b=letters.indexOf(String(to?.spelling||'')[0]?.toUpperCase());if(a<0||b<0)return false;const distance=(b-a+7)%7;return distance===1||distance===6};
export const intervalShape=(semitones,from,to)=>semitones===0?'S':`${Math.abs(semitones)<=2||Math.abs(semitones)===3&&diatonicStep(from,to)?'STEP':'LEAP'}_${semitones>0?'U':'D'}`;
export const transpositionResidualScore=(q,c)=>{const offsets=q.map((note,i)=>(c[i]?.pitchMidi??note.pitchMidi)-note.pitchMidi).sort((a,b)=>a-b),offset=offsets[Math.floor(offsets.length/2)]||0;return clamp(100-mean(q.map((note,i)=>Math.min(100,Math.abs(((c[i]?.pitchMidi??note.pitchMidi)-note.pitchMidi)-offset)*14))))};
export const score=(q,c)=>{const qf=features(q),cf=features(c),direction=100-mean(qf.c.map((v,i)=>v==cf.c[i]?0:100)),edgeInterval=100-mean(qf.i.map((v,i)=>Math.min(100,Math.abs(v-(cf.i[i]??v+7))*14))),noteResidual=transpositionResidualScore(q,c);let interval=.6*edgeInterval+.4*noteResidual,rhythm=100-mean(qf.r.map((v,i)=>Math.min(100,Math.abs(v-(cf.r[i]??v+1))*45))),pitch=noteResidual;if(q[0]?._mode==='contour'){const weights=qf.i.map((_,i)=>Number(q[i+1]?.contourShapeConfidence??1)),total=weights.reduce((a,b)=>a+b,0)||1,specific=100-weights.reduce((sum,weight,i)=>sum+(intervalShape(qf.i[i],q[i],q[i+1])===intervalShape(cf.i[i]??-qf.i[i],c[i],c[i+1])?0:100*weight),0)/total;interval=specific;pitch=specific;rhythm=direction}return{pitch:clamp(pitch),interval:clamp(interval),contour:clamp(direction),rhythm:clamp(rhythm)}};
export function queryDiscrimination(notes){
 const counts=new Map();for(const note of notes)counts.set(note.pitchMidi,(counts.get(note.pitchMidi)||0)+1);
 const n=Math.max(1,notes.length),dominance=Math.max(0,...counts.values())/n,uniqueRatio=counts.size/n,intervals=features(notes).i,repeatRatio=intervals.filter(value=>value===0).length/Math.max(1,intervals.length),specificity=clamp(100*(.45*uniqueRatio+.35*(1-dominance)+.2*(1-repeatRatio))),lowInformation=notes.length>=6&&(dominance>=.45||repeatRatio>=.45||counts.size<=Math.max(2,Math.floor(notes.length*.25)));
 return{specificity,dominance,uniqueRatio,repeatRatio,lowInformation};
}
export function pitchEqualitySimilarity(query,candidate){
 if(query.length!==candidate.length||query.length<2)return 0;let matches=0,total=0;
 for(let i=0;i<query.length;i++)for(let j=i+1;j<query.length;j++){matches+=Number((query[i].pitchMidi===query[j].pitchMidi)===(candidate[i].pitchMidi===candidate[j].pitchMidi));total++}
 return 100*matches/Math.max(1,total);
}

const direction=n=>Math.sign(n);
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:1};
export const parseMeter=meter=>{const match=String(meter||'4/4').match(/^(\d+)\/(\d+)$/),count=Number(match?.[1])||4,unit=Number(match?.[2])||4;return{count,unit,quarterLength:count*4/unit}};
const close=(a,b,tolerance=1e-6)=>Math.abs(a-b)<tolerance;
export function metricWeightAt(position,meter='4/4'){
 const {count,unit}=parseMeter(meter),eighthPosition=1+(position-1)*2;
 if(close(position,1))return 1;
 if(unit===8&&count>=6&&count%3===0){const withinCompoundBeat=(eighthPosition-1)%3;if(close(withinCompoundBeat,0)){const group=Math.round((eighthPosition-1)/3);return count===12&&group===2 ? .72 : .68}return close(withinCompoundBeat,1)||close(withinCompoundBeat,2) ? .34 : .15}
 if(unit===8&&(count===5||count===7)){const groups=count===5?[2,3]:[2,2,3];let cursor=1;for(let i=1;i<groups.length;i++){cursor+=groups[i-1];if(close(eighthPosition,cursor))return .7}return Number.isInteger(eighthPosition)?.32:.15}
 if(unit===4){if(count===2)return close(position,2) ? .5 : Number.isInteger(position) ? .4 : .2;if(count===3)return Number.isInteger(position) ? .45 : .2;if(count===4)return close(position,3) ? .65 : Number.isInteger(position) ? .45 : .2;if(count===5)return close(position,4) ? .7 : Number.isInteger(position) ? .4 : .18;if(count===7)return close(position,3)||close(position,5) ? .68 : Number.isInteger(position) ? .38 : .16}
 return Number.isInteger(eighthPosition) ? .35 : .15;
}
export function annotateStructural(notes,meter='4/4',candidate=false){
 const typical=median(notes.map(note=>Number(note.durationRatio)||.25)),length=parseMeter(meter).quarterLength;
 return notes.map((note,index)=>{
  const previous=notes[index-1],next=notes[index+1],left=previous?note.pitchMidi-previous.pitchMidi:0,right=next?next.pitchMidi-note.pitchMidi:0;
  const passingShape=Boolean(previous&&next&&Math.sign(left)===Math.sign(right)&&Math.abs(left)<=2&&Math.abs(right)<=2);
  const neighborShape=Boolean(previous&&next&&previous.pitchMidi===next.pitchMidi&&Math.abs(left)<=2);
  const position=candidate?(Number(note.beat)||1):(Number(note.onset)||0)%length+1,metricWeight=metricWeightAt(position,meter);
  const duration=Number(note.durationRatio)||0,long=duration>=typical*1.5,short=duration<=typical*.6,weakBeat=metricWeight<.5,tied=Boolean(note.tieStart||note.tieStop||note.tieEndMeasure),extreme=Boolean(previous&&next&&(note.pitchMidi>previous.pitchMidi&&note.pitchMidi>next.pitchMidi||note.pitchMidi<previous.pitchMidi&&note.pitchMidi<next.pitchMidi));
  const onset=Number(note.onset)||0,previousEnd=previous?(Number(previous.onset)||0)+(Number(previous.durationRatio)||0):onset,nextOnset=next?(Number(next.onset)||0):onset+duration,restBefore=Math.max(0,onset-previousEnd),restAfter=Math.max(0,nextOnset-onset-duration),restThreshold=Math.min(.5,Math.max(.125,typical*.5)),restBoundaryBefore=restBefore>=restThreshold,restBoundaryAfter=restAfter>=restThreshold;
  // Phrase evidence is directional. A tied event that sustains to a rest is
  // strong closing evidence, but the continuation never becomes a new attack
  // merely because it crosses a barline or lands on a strong beat.
  const tieContinuation=Boolean(note.tieStop&&!note.tieStart),crossesBarline=Boolean(note.tieEndMeasure&&Number(note.tieEndMeasure)>Number(note.measure)),newAttack=!tieContinuation;
  const phraseOpeningConfidence=clamp(100*((index===0?.15:0)+(restBoundaryBefore?.62:0)+(restBoundaryBefore&&newAttack?.18:0)-(tieContinuation?.75:0)))/100;
  const phraseClosingConfidence=clamp(100*((index===notes.length-1?.15:0)+(restBoundaryAfter?.58:0)+(restBoundaryAfter&&long?.14:0)+(restBoundaryAfter&&crossesBarline?.13:0)))/100;
  const phraseStart=newAttack&&phraseOpeningConfidence>=.55,phraseEnd=phraseClosingConfidence>=.55,boundary=phraseStart||phraseEnd,boundaryWeight=.48*Math.max(phraseOpeningConfidence,phraseClosingConfidence);
  // A contrapuntal shape alone is not enough to demote a note. At least one
  // surface cue (short value or weak metric position) must support the label.
  const passing=passingShape&&(short||weakBeat),neighbor=neighborShape&&(short||weakBeat),auxiliarySignals=Number(passing||neighbor)+Number(short)+Number(weakBeat),auxiliaryConfidence=auxiliarySignals/3;
  let weight=.3+.3*metricWeight+(long?.2:0)+(tied?.16:0)+boundaryWeight+(extreme?.08:0)-(passing?.18*auxiliaryConfidence:0)-(neighbor?.16*auxiliaryConfidence:0)-(short&&weakBeat&&!boundary?.1:0)-(note.cue?.45:0);
  weight=Math.max(.12,Math.min(1,weight));
  return{...note,metricWeight,isShort:short,isLong:long,isTied:tied,isAttack:newAttack,crossesBarline,weakBeat,restBefore,restAfter,phraseOpeningConfidence,phraseClosingConfidence,phraseStart,phraseEnd,auxiliaryConfidence,structuralWeight:weight,structuralRole:note.cue?'cue':passing?'passing':neighbor?'neighbor':weight>=.68||boundary&&weight>=.6?'pillar':'surface'};
 });
}
const transitionCost=(query,candidate,i,j,mode)=>{
 if(i===0)return 0;
 const qi=query[i].pitchMidi-query[i-1].pitchMidi,ci=j?candidate[j].pitchMidi-candidate[j-1].pitchMidi:99;
 const directionCost=direction(qi)===direction(ci)?0:1,shapeCost=intervalShape(qi,query[i-1],query[i])===intervalShape(ci,candidate[j-1],candidate[j])?0:.32,intervalCost=Math.min(1,Math.abs(qi-ci)/7);
 const qRatio=query[i].durationRatio/(query[i-1].durationRatio||1),cRatio=j?candidate[j].durationRatio/(candidate[j-1].durationRatio||1):4,rhythmCost=Math.min(1,Math.abs(Math.log2(Math.max(.0625,qRatio)/Math.max(.0625,cRatio)))/2);
 if(mode==='contour')return directionCost?1:shapeCost*Number(query[i]?.contourShapeConfidence??1);
 const importance=.45+.55*Math.min(Number(query[i]?.structuralWeight??1),Number(candidate[j]?.structuralWeight??1));
 if(mode==='melody_rhythm')return importance*(.48*intervalCost+.3*directionCost+.14*shapeCost+.08*rhythmCost);
 return importance*(.58*intervalCost+.3*directionCost+.12*shapeCost);
};

// Semi-global Smith-Waterman-style alignment: the complete query is aligned to
// the best local candidate span, while candidate prefix/suffix notes are free.
export function alignLocal(query,candidate,mode='melody'){
 const n=query.length,m=candidate.length,insertCostAt=j=>{const w=Number(candidate[j]?.structuralWeight??.8),aux=candidate[j]?.structuralRole==='passing'||candidate[j]?.structuralRole==='neighbor';return aux?.18+.22*w:.32+.36*w},deleteCostAt=i=>.24+.38*Number(query[i]?.structuralWeight??.8);
 const dp=Array.from({length:n+1},()=>Array(m+1).fill(Infinity)),back=Array.from({length:n+1},()=>Array(m+1).fill(null));
 for(let j=0;j<=m;j++)dp[0][j]=0;
 for(let i=1;i<=n;i++){const cost=deleteCostAt(i-1);dp[i][0]=dp[i-1][0]+cost;back[i][0]={i:i-1,j:0,type:'deletion',cost}}
 for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){
  const substitution=transitionCost(query,candidate,i-1,j-1,mode),insertCost=insertCostAt(j-1),deleteCost=deleteCostAt(i-1),choices=[{value:dp[i-1][j-1]+substitution,i:i-1,j:j-1,type:substitution<.18?'match':'substitution',cost:substitution},{value:dp[i][j-1]+insertCost,i,j:j-1,type:'insertion',cost:insertCost},{value:dp[i-1][j]+deleteCost,i:i-1,j,type:'deletion',cost:deleteCost}],best=choices.sort((a,b)=>a.value-b.value)[0];
  dp[i][j]=best.value;back[i][j]=best;
 }
 let end=0;for(let j=1;j<=m;j++)if(dp[n][j]<dp[n][end])end=j;
 const path=[];let i=n,j=end;
 while(i>0){const step=back[i][j];if(!step)break;path.push({queryIndex:step.type==='insertion'?null:i-1,candidateIndex:step.type==='deletion'?null:j-1,cost:step.cost,type:step.type});i=step.i;j=step.j}
 path.reverse();
 const mapped=path.filter(x=>x.queryIndex!==null&&x.candidateIndex!==null),start=mapped.length?Math.min(...mapped.map(x=>x.candidateIndex)):0,finish=mapped.length?Math.max(...mapped.map(x=>x.candidateIndex)):0,coverage=mapped.length/Math.max(1,n),normalized=dp[n][end]/Math.max(1,n);
 return{path,start,end:finish,coverage,cost:dp[n][end],similarity:clamp(100*Math.exp(-normalized/.48)*coverage)};
}

const structuralReduction=notes=>{
 let selected=notes.filter(note=>Number(note.structuralWeight)>=.68);
 if(selected.length<3)selected=[...notes].sort((a,b)=>Number(b.structuralWeight)-Number(a.structuralWeight)).slice(0,Math.min(3,notes.length)).sort((a,b)=>Number(a.onset??a.beat)-Number(b.onset??b.beat));
 return selected.map(note=>({...note,structuralWeight:1}));
};
export function compareStructural(query,candidate){
 const q=structuralReduction(query),c=structuralReduction(candidate);
 if(q.length<3||c.length<3)return{similarity:0,bonus:0,queryPillars:q.length,candidatePillars:c.length,confidence:0};
 const alignment=alignLocal(q,c,'melody'),confidence=Math.min(1,q.length/5,c.length/5)*alignment.coverage,similarity=alignment.similarity;
 const bonus=Math.min(12,confidence*(similarity>=92?10:similarity>=82?6:similarity>=70?3:similarity>=60?1:0));
 return{similarity,bonus,queryPillars:q.length,candidatePillars:c.length,confidence};
}
// A second, deliberately compact representation of a melody.  It keeps notes
// carried by the meter or by clear structural cues and lets surface ornaments
// disappear without turning arbitrary, widely-spaced notes into a melody.
export function metricalSkeleton(notes,meter='4/4',candidate=false){
 const annotated=annotateStructural(notes,meter,candidate);
 let selected=annotated.filter(note=>note.isAttack!==false&&(Number(note.metricWeight)>=.62||Number(note.structuralWeight)>=.72)&&!['passing','neighbor','cue'].includes(note.structuralRole));
 if(selected.length<3)selected=annotated.filter(note=>note.isAttack!==false&&!['passing','neighbor','cue'].includes(note.structuralRole)).sort((a,b)=>Number(b.structuralWeight)-Number(a.structuralWeight)).slice(0,Math.min(4,annotated.length)).sort((a,b)=>Number(a.onset??a.beat)-Number(b.onset??b.beat));
 return selected.map(note=>({...note,structuralWeight:1}));
}
export function metricalSkeletonEvidence(query,candidate,queryMeter='4/4',candidateMeter=queryMeter){
 const q=metricalSkeleton(query,queryMeter,false),c=metricalSkeleton(candidate,candidateMeter,true);
 if(q.length<3||c.length<3)return{similarity:0,pillarPitch:0,interval:0,contour:0,queryNotes:q.length,candidateNotes:c.length,coverage:0,strongCoverage:0};
 const alignment=alignLocal(q,c,'melody'),pairs=alignment.path.filter(step=>step.queryIndex!==null&&step.candidateIndex!==null),alignedQ=pairs.map(step=>q[step.queryIndex]),alignedC=pairs.map(step=>c[step.candidateIndex]),scores=score(alignedQ,alignedC),pillarPitch=transpositionResidualScore(alignedQ,alignedC),important=q.filter(note=>Number(note.metricWeight)>=.62||Number(note.structuralWeight)>=.72),matchedImportant=new Set(pairs.filter(step=>{const note=q[step.queryIndex];return Number(note.metricWeight)>=.62||Number(note.structuralWeight)>=.72}).map(step=>step.queryIndex)),strongCoverage=matchedImportant.size/Math.max(1,important.length),similarity=clamp(.45*alignment.similarity+.4*pillarPitch+.1*scores.interval+.05*scores.contour);
 return{similarity,pillarPitch,interval:scores.interval,contour:scores.contour,queryNotes:q.length,candidateNotes:c.length,coverage:alignment.coverage,strongCoverage};
}
export function sparseAlignmentAllowed(path,candidate,explicitStructural=false){
 if(explicitStructural)return true;
 const skipped=(path||[]).filter(step=>step.type==='insertion'&&step.candidateIndex!==null);
 if(!skipped.length)return true;
 // A single skipped pillar is strong evidence of a different melody.
 if(skipped.length===1){const note=candidate[skipped[0].candidateIndex];return note?.structuralRole!=='pillar'}
 // Determine which skipped notes are explainable as auxiliary ornaments.
 const isExplained=step=>{const note=candidate[step.candidateIndex];if(note?.structuralRole==='cue')return true;const signals=Number(['passing','neighbor'].includes(note?.structuralRole))+Number(Boolean(note?.isShort))+Number(Boolean(note?.weakBeat));return signals>=2};
 const explained=skipped.filter(isExplained).length;
 if(explained/skipped.length<.8)return false;
 // Even when individual notes are explainable, three or more consecutive
 // unexplained skips indicate a genuinely different melody passage.
 const indices=skipped.map(s=>s.candidateIndex).sort((a,b)=>a-b);
 let run=1;for(let k=1;k<indices.length;k++){if(indices[k]===indices[k-1]+1){run++;if(run>=3){let anyUnexplained=false;for(let r=k-run+1;r<=k;r++){const step=skipped.find(s=>s.candidateIndex===indices[r]);if(step&&!isExplained(step)){anyUnexplained=true;break}}if(anyUnexplained)return false}}else run=1}
 return true;
}

export function resultAdmissionAllowed(mode,intervalExact,local,scores,structuralSimilarity,queryLength=0){
 if(mode==='contour'||intervalExact)return true;
 const ordinary=local>=55&&scores.interval>=65&&(mode!=='melody_rhythm'||scores.rhythm>=55);
 const structuralException=local>=50&&scores.interval>=60&&structuralSimilarity>=82&&(mode!=='melody_rhythm'||scores.rhythm>=45);
 // Preserve a long, unmistakable transposition-equivalent melody even when a
 // changed tail or one extra note depresses rhythm DTW. Rhythm still lowers
 // its ranking; this only prevents premature removal from the result set.
 const longMelodyException=mode==='melody_rhythm'&&queryLength>=8&&local>=68&&scores.interval>=90&&scores.contour>=85&&scores.rhythm>=35;
 return ordinary||structuralException||longMelodyException;
}

export const prepareQueryNotes=events=>{
 const notes=[];let onset=0;
 for(const event of events||[]){const duration=Number(event.durationRatio)||0;if(event.kind==='note'&&event.pitchMidi!=null){const prior=notes.at(-1);if(event.tieGroup&&prior?.tieGroup===event.tieGroup&&prior.pitchMidi===event.pitchMidi)prior.durationRatio+=duration;else notes.push({...event,onset});}onset+=duration}
 return notes;
};
const rhythmValues=events=>events.map((event,index)=>{const next=events[index+1];return next&&Number.isFinite(next.onset)&&Number.isFinite(event.onset)?Math.max(1/64,next.onset-event.onset):Math.max(1/64,Number(event.durationRatio)||0)});
export function rhythmShapeSimilarity(query,candidate){
 const describe=events=>{const values=rhythmValues(events),sorted=[...values].sort((a,b)=>a-b),middle=(sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2)||1,ratios=values.map(value=>Math.min(2,value/middle));return{ratios,classes:ratios.map(value=>value<.75?'short':value>1.5?'long':'normal')}};
 const q=describe(query),c=describe(candidate);if(q.ratios.length!==c.ratios.length||!q.ratios.length)return 0;
 const categorical=100-mean(q.classes.map((value,index)=>value===c.classes[index]?0:(value==='normal'||c.classes[index]==='normal')?55:100)),continuous=100-mean(q.ratios.map((value,index)=>Math.min(100,60*Math.abs(Math.log2(Math.max(.125,value)/Math.max(.125,c.ratios[index]))))));
 return clamp(.5*categorical+.5*continuous);
}
export function findAbsoluteExact(query,candidate,includeRhythm=false){
 return findAbsoluteExactMatches(query,candidate,includeRhythm)[0]??null;
}
export function findAbsoluteExactMatches(query,candidate,includeRhythm=false){
 if(!query.length||candidate.length<query.length)return [];
 const qRhythm=includeRhythm?rhythmValues(query):[];
 const matches=[];
 for(let start=0;start<=candidate.length-query.length;start++){
  const window=candidate.slice(start,start+query.length);
  const transposition=window[0].pitchMidi-query[0].pitchMidi;
  if(!query.every((note,index)=>note.pitchMidi+transposition===window[index].pitchMidi))continue;
  if(includeRhythm){const cRhythm=rhythmValues(window);if(!qRhythm.every((value,index)=>Math.abs(value-cRhythm[index])<1e-6))continue}
  matches.push({start,end:start+query.length-1});
 }
 return matches;
}

// Compare phrase roles without assuming a fixed phrase length or a 4/4 meter.
// Internal boundaries carry most weight; endpoints are deliberately weak.
export function phraseAlignmentEvidence(query,candidate,span){
 const window=candidate.slice(span.start,span.end+1);if(!query.length||window.length!==query.length)return{score:0,conflicts:0};
 let value=70,conflicts=0;
 for(let i=1;i<query.length-1;i++)for(const role of ['phraseOpeningConfidence','phraseClosingConfidence']){
  const expected=Number(query[i][role]||0)>=.55,actual=Number(window[i][role]||0)>=.55;
  if(expected===actual){if(expected)value+=8}else{value-=expected?12:6;conflicts++}
 }
 const first=window[0],last=window.at(-1),qFirst=query[0];
 if(Number(first?.phraseOpeningConfidence)>=.55)value+=15;
 if(Number(last?.phraseClosingConfidence)>=.55)value+=10;
 // A closing sustain is not a plausible motif onset when the query begins
 // with a new attack. This is evidence-based, not tied to any work or pitch.
 if(qFirst?.isAttack!==false&&Number(first?.phraseClosingConfidence)>.6&&Number(first?.phraseOpeningConfidence)<.3){value-=35;conflicts++;}
 return{score:clamp(value),conflicts};
}
// About 9% timing variation is treated as equivalent. Beyond that dead zone,
// the quadratic term keeps small changes gentle and makes large changes costly.
const durationDistance=(queryDuration,candidateDuration)=>{const error=Math.abs(Math.log2(Math.max(.03125,queryDuration)/Math.max(.03125,candidateDuration))),excess=Math.max(0,error-.125);return Math.min(1.5,excess+1.35*excess*excess)};
export const rhythmRankFactor=similarity=>similarity>=85?1:similarity>=65?.82+.18*(similarity-65)/20:similarity>=45?.45+.37*(similarity-45)/20:.2+.25*Math.max(0,similarity)/45;
export function calibratedResultRanking(exact,local,scores,mode,adjustment=0){
 if(exact)return 100;
 const surface=mode==='melody_rhythm'?.75*scores.interval+.25*scores.rhythm:mode==='contour'?.7*scores.contour+.3*scores.interval:mode==='rhythm'?scores.rhythm:.85*scores.interval+.15*scores.contour;
 return clamp(Math.min(97,.55*local+.45*surface+Math.max(-3,Math.min(1,adjustment))));
}
// When the complete transposition-invariant interval sequence is present, a
// long tied pillar must not erase the melodic evidence. Rhythm still orders
// exact melodic occurrences, but is a bounded penalty instead of a hard gate.
export const exactIntervalRhythmFactor=similarity=>.84+.16*clamp(similarity)/100;
export function metricalEvidence(query,candidate,pairs,queryMeter='4/4',candidateMeter=queryMeter){
 const length=parseMeter(queryMeter).quarterLength,aligned=pairs.filter(pair=>pair.queryIndex!==null&&pair.candidateIndex!==null),important=aligned.filter(pair=>metricWeightAt((Number(query[pair.queryIndex].onset)||0)%length+1,queryMeter)>=.65);
 if(!important.length)return{score:50,adjustment:0,matches:0,conflicts:0,overAccents:0};
 let matches=0,conflicts=0;
 for(const pair of important){const queryPosition=(Number(query[pair.queryIndex].onset)||0)%length+1,candidatePosition=Number(candidate[pair.candidateIndex].beat)||1,metricMatch=Math.abs(metricWeightAt(queryPosition,queryMeter)-metricWeightAt(candidatePosition,candidateMeter))<=.2,melodicMatch=Number(pair.cost||0)<.18;if(metricMatch&&melodicMatch)matches++;else conflicts++}
 // A sparse line with one note on every bar's downbeat must not receive 100
 // merely because the query's strong notes also align there. Count weak query
 // notes promoted to a strong candidate beat as metric over-accenting.
 const overAccents=aligned.filter(pair=>{const queryPosition=(Number(query[pair.queryIndex].onset)||0)%length+1,candidatePosition=Number(candidate[pair.candidateIndex].beat)||1;return metricWeightAt(queryPosition,queryMeter)<.5&&metricWeightAt(candidatePosition,candidateMeter)>=.65}).length;
 const matchRatio=matches/important.length,conflictRatio=conflicts/important.length,overAccentRatio=overAccents/Math.max(1,aligned.length);
 return{score:clamp(50+50*matchRatio-35*conflictRatio-45*overAccentRatio),adjustment:6*matchRatio-14*conflictRatio-8*overAccentRatio,matches,conflicts,overAccents};
}

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
const youtubeArrangement=/\b(?:piano\s+(?:solo|duet|trio|quartet|quintet)|melody|violin|viola|cello|contrabass|duet|trio|quartet|string\s+orchestra)\b/gi;
export const repairMetadataText=value=>{
 const original=String(value||'').replace(/Claude-Michel\s+Sch(?:[\p{Script=Han}\uFFFD]|Ã.|Â.)+berg/gu,'Claude-Michel Schönberg').replace(/Sch[\p{Script=Han}\uFFFD]+berg/gu,'Schönberg');if(!original||[...original].some(char=>char.codePointAt(0)>255))return original;
 // A real Latin accent is already valid Unicode. Do not reward an accidental
 // Shift-JIS/GB decode merely because it produces CJK characters.
 const latinAccents=original.match(/[\u00c0-\u024f]/gu)||[];
 if(latinAccents.length&&latinAccents.length<=Math.max(2,original.length*.15)&&!/[ÃÂÐÑ\x00-\x1f\x7f-\x9f]/u.test(original))return original;
 const quality=text=>{let hangul=0,kana=0,han=0,controls=0;for(const char of text){const code=char.codePointAt(0);if(code>=0xAC00&&code<=0xD7A3)hangul++;else if(code>=0x3040&&code<=0x30FF)kana++;else if(code>=0x3400&&code<=0x9FFF)han++;else if(code<32&&!['\t','\r','\n'].includes(char))controls++}const suspiciousMixedScript=kana&&kana*2<=han?15*kana:0,mixedHangulHan=!kana?12*Math.min(hangul,han):0;return 10*hangul+8*kana+4*han-20*controls-suspiciousMixedScript-mixedHangulHan};
 const bytes=Uint8Array.from([...original],char=>char.codePointAt(0)),candidates=[];for(const encoding of ['utf-8','euc-kr','shift_jis','gb18030','big5'])try{const candidate=new TextDecoder(encoding,{fatal:true}).decode(bytes);if(!candidate.includes('\uFFFD'))candidates.push(candidate)}catch{}
 const repaired=candidates.sort((a,b)=>quality(b)-quality(a))[0];return repairMetadataInXml(repaired&&quality(repaired)>quality(original)&&quality(repaired)>0?repaired:original)
};
export const normalizeYoutubeTitle=title=>repairMetadataText(title).replace(/\.musicxml(?:\.xml)?$|\.xml$/i,'').replace(/^\s*\d+\.?\s*/,'').replace(youtubeArrangement,' ').replace(/[,_]+/g,' ').replace(/\s+/g,' ').trim().replace(/\s+(?:and|&)\s*$/i,'').trim().toLocaleLowerCase('en-US');
export const youtubeId=(all,id,title)=>{const works=all?.works||all||{},item=works[id]||works[title]||works[normalizeYoutubeTitle(title)]||Object.values(works).find(x=>x?.workId===id);return item?.youtubeId||item?.videoId};
const musicxmlRoot=process.env.MUSICANOTE_MUSICXML_ROOT||'K:/Music Analysis/musicxml/';
const pdmxXmlRoot=process.env.MUSICANOTE_PDMX_XML_ROOT||'U:/MusicSearch-PDMX/xml/';
const kysingXmlRoot=process.env.MUSICANOTE_KYSING_XML_ROOT||'U:/KYSing_MusicXML/';
const xmlCache=new Map(),xmlCacheLimit=64;
export const repairMetadataInXml=xml=>String(xml||'').replace(/Claude-Michel\s+Sch(?:[\p{Script=Han}\uFFFD]|Ã.|Â.)+berg/gu,'Claude-Michel Schönberg').replace(/Sch[\p{Script=Han}\uFFFD]+berg/gu,'Schönberg');
export const expandEmptyMeasures=xml=>xml.replace(/<measure(?=[\s/>])([^>]*?)\/\s*>/g,'<measure$1></measure>');
const sourceXml=source=>{if(xmlCache.has(source)){const value=xmlCache.get(source);xmlCache.delete(source);xmlCache.set(source,value);return value}const value=expandEmptyMeasures(repairMetadataInXml(readFileSync(source.startsWith('kysing/')?`${kysingXmlRoot}${source.slice(7)}`:source.toLowerCase().endsWith('.mxl')?`${pdmxXmlRoot}${source.replace(/\.mxl$/i,'.xml')}`:`${musicxmlRoot}${source}`,'utf8')));xmlCache.set(source,value);if(xmlCache.size>xmlCacheLimit)xmlCache.delete(xmlCache.keys().next().value);return value};
const escapeRegex=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const instrumentTranslations=new Map([
 ['降B調小號','B-flat Trumpet'],['降B调小号','B-flat Trumpet'],['小號','Trumpet'],['小号','Trumpet'],
 ['長笛','Flute'],['长笛','Flute'],['單簧管','Clarinet'],['单簧管','Clarinet'],['雙簧管','Oboe'],['双簧管','Oboe'],
 ['低音管','Bassoon'],['圓號','French Horn'],['圆号','French Horn'],['長號','Trombone'],['长号','Trombone'],['大號','Tuba'],['大号','Tuba'],
 ['小提琴','Violin'],['中提琴','Viola'],['大提琴','Cello'],['低音提琴','Double Bass'],['鋼琴','Piano'],['钢琴','Piano'],
 ['打擊樂','Percussion'],['打击乐','Percussion'],
 ['グランドピアノ','Grand Piano'],['ピアノ','Piano']
]);
export const translateInstrumentName=value=>instrumentTranslations.get(String(value||'').trim())||String(value||'').trim();
const translateInstrumentNamesInXml=xml=>xml.replace(/<(part-name|part-abbreviation|instrument-name)(\b[^>]*)>([^<]+)<\/\1>/g,(whole,tag,attrs,name)=>`<${tag}${attrs}>${translateInstrumentName(name)}</${tag}>`);
export const reflowRestrictedPreview=xml=>xml.replace(/<print\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/print>)/g,(whole,attrs)=>/\bnew-(?:page|system)=["']yes["']/.test(attrs)?'':whole);
export const restrictedPreviewXml=(xml,streamId,ordinalStart,ordinalEnd,margin=2,reflow=false)=>{
 const partId=streamId.split(':')[0],partMatch=xml.match(new RegExp(`<part\\s+id=["']${escapeRegex(partId)}["'][^>]*>([\\s\\S]*?)<\\/part>`));if(!partMatch)return'';
 const measures=[...partMatch[1].matchAll(/<measure(?=[\s>])[^>]*>[\s\S]*?<\/measure>/g)].map(match=>match[0]);if(!measures.length)return'';
 const first=Math.max(0,Math.max(1,ordinalStart)-1-margin),last=Math.min(measures.length-1,Math.max(ordinalStart,ordinalEnd)-1+margin),selected=measures.slice(first,last+1);
 if(first>0){
  const firstNoteIndex=selected[0].search(/<note\b/),beforeFirstNote=firstNoteIndex<0?selected[0]:selected[0].slice(0,firstNoteIndex);
  const history=measures.slice(0,first).join(''),attributeTags=['divisions','key','time','staves','clef','transpose'],inherited=attributeTags.map(tagName=>[...history.matchAll(new RegExp(`<${tagName}(?=[\\s>])[^>]*>[\\s\\S]*?<\\/${tagName}>`,'g'))].at(-1)?.[0]).filter(Boolean);
  const leadingAttributes=beforeFirstNote.match(/<attributes\b[^>]*>[\s\S]*?<\/attributes>/)?.[0];
  const missing=inherited.filter(node=>!new RegExp(`<${node.match(/^<(\w+)/)?.[1]}\\b`).test(leadingAttributes||''));
  if(missing.length)selected[0]=leadingAttributes?selected[0].replace(leadingAttributes,leadingAttributes.replace('</attributes>',`${missing.join('')}</attributes>`)):selected[0].replace(/(<measure(?=[\s>])[^>]*>)/,`$1<attributes>${missing.join('')}</attributes>`)
 }
 const scorePart=xml.match(new RegExp(`<score-part\\s+id=["']${escapeRegex(partId)}["'][^>]*>[\\s\\S]*?<\\/score-part>`))?.[0]||`<score-part id="${partId}"><part-name>${partId}</part-name></score-part>`,root=xml.match(/<score-partwise\b[^>]*>/)?.[0]||'<score-partwise version="4.0">';
 const preview=translateInstrumentNamesInXml(`<?xml version="1.0" encoding="UTF-8"?>${root}<part-list>${scorePart}</part-list><part id="${partId}">${selected.join('')}</part></score-partwise>`);
 return reflow?reflowRestrictedPreview(preview):preview
};
export const fullResearchScoreEnabled=(environment=process.env)=>environment.KYSING_FULL_SCORE_TEST_MODE==='1'||(environment.KYSING_FULL_SCORE_TEST_MODE!=='0'&&environment.NODE_ENV!=='production');
const keyCache=new Map();
const sourceKey=source=>{if(keyCache.has(source))return keyCache.get(source);try{const xml=sourceXml(source),match=xml.match(/<fifths>\s*(-?\d+)\s*<\/fifths>/);const value=match?Number(match[1]):0;keyCache.set(source,value);return value}catch{return 0}};
const sourceClef=(source,streamId,targetMeasure,notes)=>{try{const [partId,staff='1']=streamId.split(':'),xml=sourceXml(source),part=xml.match(new RegExp(`<part\\s+id="${partId}"[^>]*>([\\s\\S]*?)<\\/part>`))?.[1]||'';let found=null;for(const match of part.matchAll(/<measure(?=[\s>])[^>]*number="([^"]+)"[^>]*>([\s\S]*?)<\/measure>/g)){const number=Number(match[1]);if(Number.isFinite(number)&&number>targetMeasure)break;for(const clef of match[2].matchAll(/<clef\b([^>]*)>([\s\S]*?)<\/clef>/g)){const assigned=clef[1].match(/number="(\d+)"/)?.[1]||'1';if(assigned!==staff)continue;const shape=clef[2].match(/<sign>\s*([GFC])\s*<\/sign>/)?.[1],line=Number(clef[2].match(/<line>\s*(\d+)\s*<\/line>/)?.[1]);if(shape)found={shape,line:line||(shape==='F'?4:2)}}}if(found)return found}catch{}const pitches=notes.map(n=>n.pitchMidi).sort((a,b)=>a-b),median=pitches[Math.floor(pitches.length/2)]||60;return median<60?{shape:'F',line:4}:{shape:'G',line:2}};
const displayComposer=value=>{const lines=String(value||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean),credited=lines.find(line=>/^composed by\b/i.test(line));return credited||lines[0]||''};
const corpusNotes=(id,raw)=>raw.map((n,i)=>({id:`${id}-${i}`,kind:'note',pitchMidi:n.p,spelling:n.s,durationRatio:n.d,onset:n.o,cue:Boolean(n.u),tieStart:Boolean(n.ts),tieStop:Boolean(n.te),tieEndMeasure:n.tm,measure:n.m,beat:n.b,metricStrength:n.b===1?1:.5,structuralSalience:.5,structuralConfidence:.65,chordRole:'unknown'}));

const measureCache=new Map();
const meterCache=new Map();
let meterContextDb,meterContextGet,meterContextPut,meterContextDisabled=false;const pendingMeterContexts=new Map();
const meterContextDatabase=()=>{if(meterContextDisabled)return null;if(meterContextDb)return meterContextDb;try{meterContextDb=new DatabaseSync(meterContextPath);meterContextDb.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS contexts(key TEXT PRIMARY KEY,timeline TEXT NOT NULL)');const version=String(statSync(dbPath).mtimeMs),stored=meterContextDb.prepare('SELECT value FROM metadata WHERE key=?').get('searchDbMtime')?.value;if(stored!==version){meterContextDb.exec('DELETE FROM contexts');meterContextDb.prepare('INSERT OR REPLACE INTO metadata VALUES(?,?)').run('searchDbMtime',version)}meterContextGet=meterContextDb.prepare('SELECT timeline FROM contexts WHERE key=?');meterContextPut=meterContextDb.prepare('INSERT OR REPLACE INTO contexts VALUES(?,?)');return meterContextDb}catch{meterContextDisabled=true;return null}};
const flushMeterContexts=()=>{const store=meterContextDatabase();if(!store||!pendingMeterContexts.size)return 0;const started=performance.now();store.exec('BEGIN');try{for(const [key,timeline] of pendingMeterContexts)meterContextPut.run(key,JSON.stringify(timeline));store.exec('COMMIT');pendingMeterContexts.clear()}catch(error){try{store.exec('ROLLBACK')}catch{}throw error}return performance.now()-started};
export function parseMeterTimeline(part){
 return [...part.matchAll(/<measure(?=[\s>])[^>]*number=\x22([^\x22]+)\x22[^>]*>([\s\S]*?)<\/measure>/g)].map(match=>{
  const beats=match[2].match(/<beats>\s*([\d+]+)\s*<\/beats>/)?.[1],count=beats?.split('+').reduce((sum,value)=>sum+Number(value),0),unit=Number(match[2].match(/<beat-type>\s*(\d+)\s*<\/beat-type>/)?.[1]);
  return{number:Number(match[1]),meter:count&&unit?{count,unit}:null};
 });
}
export function meterFromTimeline(timeline,targetMeasure){let meter={count:4,unit:4};for(const entry of timeline){if(Number.isFinite(entry.number)&&entry.number>targetMeasure)break;if(entry.meter)meter=entry.meter}return meter}
const sourceMeter=(source,streamId,targetMeasure)=>{const partId=streamId.split(':')[0],key=`${source}:${partId}`;if(!meterCache.has(key)){try{const stored=meterContextDatabase()&&meterContextGet.get(key)?.timeline;if(stored)meterCache.set(key,JSON.parse(stored));else{const part=sourceXml(source).match(new RegExp('<part\\s+id=\\x22'+escapeRegex(partId)+'\\x22[^>]*>([\\s\\S]*?)<\\/part>'))?.[1]||'',timeline=parseMeterTimeline(part);meterCache.set(key,timeline);pendingMeterContexts.set(key,timeline)}if(meterCache.size>2048)meterCache.delete(meterCache.keys().next().value)}catch{return{count:4,unit:4}}}return meterFromTimeline(meterCache.get(key),targetMeasure)};
export const firstMeasureIsPickup=(body,attrs='')=>{
 const divisions=Number(body.match(/<divisions>\s*(\d+)\s*<\/divisions>/)?.[1]||1),beats=(body.match(/<beats>\s*([\d+]+)\s*<\/beats>/)?.[1]||'4').split('+').reduce((sum,x)=>sum+Number(x),0),beatType=Number(body.match(/<beat-type>\s*(\d+)\s*<\/beat-type>/)?.[1]||4),nominal=divisions*beats*4/beatType;
 let cursor=0,maximum=0;
 for(const token of body.matchAll(/<(note|backup|forward)\b[^>]*>([\s\S]*?)<\/\1>/g)){const kind=token[1],content=token[2],duration=Number(content.match(/<duration>\s*(\d+)\s*<\/duration>/)?.[1]||0);if(kind==='backup')cursor-=duration;else if(kind==='forward'){cursor+=duration;maximum=Math.max(maximum,cursor)}else if(!/<chord\b/.test(content)&&!/<grace\b/.test(content)){cursor+=duration;maximum=Math.max(maximum,cursor)}}
 return /\bimplicit="yes"/i.test(attrs)||(nominal>0&&maximum>0&&maximum<nominal-.001);
};
const sourceMeasures=(source,streamId)=>{const partId=streamId.split(':')[0],key=`${source}:${partId}`;if(measureCache.has(key))return measureCache.get(key);try{const xml=sourceXml(source),part=xml.match(new RegExp(`<part\\s+id="${partId}"[^>]*>([\\s\\S]*?)<\\/part>`))?.[1]||'',matches=[...part.matchAll(/<measure(?=[\s>])([^>]*)>([\s\S]*?)<\/measure>/g)],firstAttrs=matches[0]?.[1]||'',firstDeclared=firstAttrs.match(/\bnumber="([^"]+)"/)?.[1]??'1',pickup=firstMeasureIsPickup(matches[0]?.[2]||'',firstAttrs),shift=pickup&&Number.isFinite(Number(firstDeclared))?Number(firstDeclared):0,values=matches.map((m,i)=>{const declared=m[1].match(/\bnumber="([^"]+)"/)?.[1]??String(i+1),numeric=Number(declared);return{ordinal:i+1,label:Number.isFinite(numeric)?String(numeric-shift):(i===0&&pickup?'0':declared)}});measureCache.set(key,values);return values}catch{return[]}};
export const displayMeasure=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:String(value)};
const sourcePartName=(source,streamId)=>{try{const partId=streamId.split(':')[0],xml=sourceXml(source),block=xml.match(new RegExp(`<score-part\\s+id="${partId}"[^>]*>([\\s\\S]*?)<\\/score-part>`))?.[1]||'';return translateInstrumentName(block.match(/<part-name[^>]*>([\s\S]*?)<\/part-name>/)?.[1].replace(/<[^>]+>/g,'').trim()||partId)}catch{return streamId.split(':')[0]}};

export const rankedMotifs=raw=>{
 const groups=new Map();
 for(let length=6;length<=12;length++)for(let i=0;i<=raw.length-length;i++){
  const window=raw.slice(i,i+length),intervals=window.slice(1).map((n,j)=>n.p-window[j].p),key=intervals.join(','),span=window.reduce((sum,n)=>sum+Number(n.d||0),0),pitchCounts=new Map(),entry=groups.get(key)||{key,length,count:0,totalSpan:0,example:window,occurrences:[]};
  for(const note of window)pitchCounts.set(note.p,(pitchCounts.get(note.p)||0)+1);
  entry.uniquePitchCount=pitchCounts.size;entry.dominantPitchShare=Math.max(...pitchCounts.values())/length;entry.samePitchStepShare=intervals.filter(value=>value===0).length/Math.max(1,intervals.length);
  entry.count++;entry.totalSpan+=span;entry.occurrences.push({startIndex:i,startMeasure:window[0]?.m,endMeasure:window.at(-1)?.m,onset:window[0]?.o});groups.set(key,entry);
 }
 const repeated=[...groups.values()]
  .filter(x=>x.count>=2&&x.uniquePitchCount>=Math.min(4,Math.ceil(x.length*.6))&&x.dominantPitchShare<.5&&x.samePitchStepShare<=.34)
  .map(x=>{const diversity=.55*(x.uniquePitchCount/x.length)+.45*(1-x.samePitchStepShare),lengthWeight=x.length>=8&&x.length<=10?1.25:x.length>=11?1.08:.88;return{...x,score:x.count*(1+.18*(x.length-6))*Math.log2(2+x.totalSpan/x.count)*(.45+.55*diversity)*lengthWeight}})
  .sort((a,b)=>b.score-a.score||b.length-a.length);
 const chosen=[];
 for(const candidate of repeated){if(chosen.some(x=>x.length>candidate.length&&(`,${x.key},`).includes(`,${candidate.key},`)&&x.score>=candidate.score))continue;chosen.push(candidate);if(chosen.length===8)break}
 return chosen.map((x,motifIndex)=>({
  id:`motif-${motifIndex+1}`,label:`${x.length} notes`,intervals:x.key.split(',').map(Number),count:x.count,score:Number(x.score.toFixed(2)),
  startMeasure:x.example[0]?.m,endMeasure:x.example.at(-1)?.m,
  events:x.example.map((note,index)=>({id:`motif-${motifIndex+1}-note-${index+1}`,kind:'note',pitchMidi:note.p,spelling:note.s,durationRatio:Math.max(1/64,Number(note.d||1)),onset:Number(note.o||0)-(Number(x.example[0]?.o||0)),measure:1})),
  occurrences:x.occurrences
 }));
};

export function searchDatabase(query,limit=100){
 ensureParsedWorkCache();
 const profileEnabled=process.env.MUSICANOTE_PROFILE_SEARCH==='1',profileStart=performance.now(),profile={retrievalMs:0,decodeMs:0,exactScanMs:0,alignmentMs:0,occurrenceScanMs:0,windowPrepMs:0,scoreMs:0,meterLookupMs:0,meterPersistMs:0,metricScoringMs:0,candidateEvaluationMs:0,enrichmentMs:0,parsedCacheHits:0,parsedCacheMisses:0,parsedCacheBytes:0},profiled=(name,fn)=>{if(!profileEnabled)return fn();const started=performance.now();try{return fn()}finally{profile[name]+=performance.now()-started}};
 const queryEvents=query.includeRests===false?(query.events||[]).filter(event=>event.kind!=='rest'):query.events;
 const notes=annotateStructural(prepareQueryNotes(queryEvents),query.meter,false);
 profile.phraseContextMs=0;
 // This optional evidence layer cannot change retrieval, alignment or admission.
 // Melody-only/contour have no temporal boundary intent; strict exact is unchanged.
 const phraseContextEnabled=process.env.MUSICANOTE_PHRASE_CONTEXT!=='0'&&query.mode==='melody_rhythm'&&!query.absoluteExactOnly;
 const queryBoundaries=phraseContextEnabled?profiled('phraseContextMs',()=>analyzePhraseBoundaries(notes)):null;
 if(notes.length)notes[0]._mode=query.mode;
 if(notes.length<4)return{exact:[],similar:[]};
 const contourMode=query.mode==='contour',rhythmMode=query.mode==='rhythm',discrimination=queryDiscrimination(notes),robustIntervalRetrieval=!rhythmMode&&notes.length>=8&&!discrimination.lowInformation;
 const qg=qgrams(features(notes)).filter(g=>rhythmMode?g.token.startsWith('r:'):!contourMode||g.token.startsWith('c:'));
 const hits=new Map(),intervalHits=new Map(),intervalSeedEvidence=new Map(),interval4WorkEvidence=new Map(),rhythmSeedEvidence=new Map(),contourWorkEvidence=new Map(),interval3Seeds=new Map(),splitIntervalPositions=new Map(),intervalGramCount=qg.filter(gram=>gram.token.startsWith('i:')||gram.token.startsWith('i5:')).length,contourGramCount=qg.filter(gram=>gram.token.startsWith('c:')).length,store=database(),countSql=store.prepare('SELECT count(*) n FROM grams WHERE token=?'),sql=store.prepare('SELECT work_id,pos FROM grams WHERE token=? LIMIT ?');
 const tokenCounts=new Map(),counted=qg.map(gram=>{if(!tokenCounts.has(gram.token))tokenCounts.set(gram.token,Number(countSql.get(gram.token)?.n||0));return{...gram,total:tokenCounts.get(gram.token)}}),intervalRarity=new Map(counted.filter(gram=>gram.total>0&&(gram.token.startsWith('i:')||gram.token.startsWith('i5:'))).sort((a,b)=>a.total-b.total||a.pos-b.pos).map((gram,index)=>[gram,index])),shortIntervalGrams=counted.filter(gram=>gram.total>0&&gram.token.startsWith('i:')),splitPoint=Math.max(0,(notes.length-4)/2),rarest=values=>[...values].sort((a,b)=>a.total-b.total||a.pos-b.pos)[0],expandedIntervalGrams=new Set([shortIntervalGrams[0],shortIntervalGrams.at(-1),rarest(shortIntervalGrams.filter(gram=>gram.pos<=splitPoint)),rarest(shortIntervalGrams.filter(gram=>gram.pos>splitPoint))].filter(Boolean)),rowLimits=new Map();
 for(const gram of counted){const kind=gram.token.split(':',1)[0],edgeIntervalGram=gram===shortIntervalGrams[0]||gram===shortIntervalGrams.at(-1),rarityRank=edgeIntervalGram?-1:expandedIntervalGrams.has(gram)?0:intervalRarity.get(gram);rowLimits.set(gram,retrievalRowLimit(kind,gram.total,rarityRank,robustIntervalRetrieval))}
 const tokenLimits=new Map();for(const gram of counted)tokenLimits.set(gram.token,Math.max(tokenLimits.get(gram.token)||0,rowLimits.get(gram)));const postingsByToken=new Map([...tokenLimits].map(([token,limit])=>[token,sql.all(token,limit)]));
 for(const gram of counted){const rows=postingsByToken.get(gram.token).slice(0,rowLimits.get(gram)),contourWorks=new Set();if(gram.token.startsWith('i:'))interval3Seeds.set(gram.pos,rows.map(row=>`${row.work_id}\u0000${Math.max(0,Number(row.pos)-gram.pos)}`));for(const row of rows){const start=Math.max(0,Number(row.pos)-gram.pos),key=`${row.work_id}\u0000${start}`,isLongInterval=gram.token.startsWith('i5:'),isShortInterval=gram.token.startsWith('i:'),isInterval=isLongInterval||isShortInterval,isRhythm=gram.token.startsWith('r:'),isContour=gram.token.startsWith('c:'),weight=isLongInterval?50:isInterval?3:1;hits.set(key,(hits.get(key)||0)+weight);if(isInterval){intervalHits.set(key,(intervalHits.get(key)||0)+1);intervalSeedEvidence.set(key,(intervalSeedEvidence.get(key)||0)+weight);if(isShortInterval){const positions=splitIntervalPositions.get(key)||new Set();positions.add(gram.pos);splitIntervalPositions.set(key,positions)}}if(isRhythm)rhythmSeedEvidence.set(key,(rhythmSeedEvidence.get(key)||0)+1);if(isContour)contourWorks.add(row.work_id)}for(const id of contourWorks)contourWorkEvidence.set(id,(contourWorkEvidence.get(id)||0)+1)}
 for(const [key,positions] of splitIntervalPositions){const bonus=splitIntervalSeedBonus(positions,notes.length);if(bonus){hits.set(key,(hits.get(key)||0)+bonus);intervalSeedEvidence.set(key,(intervalSeedEvidence.get(key)||0)+bonus)}}
 // The intersection of adjacent interval 3-grams is an interval 4-gram seed.
 // It survives cases where a changed middle pitch destroys every 5-gram but
 // leaves a five-note run intact on one side of the edit.
 for(let pos=0;pos<notes.length-4;pos++){const left=interval3Seeds.get(pos),right=interval3Seeds.get(pos+1);if(!left||!right)continue;const rightKeys=new Set(right);for(const key of new Set(left))if(rightKeys.has(key)){const id=key.split('\u0000')[0];hits.set(key,(hits.get(key)||0)+20);intervalSeedEvidence.set(key,(intervalSeedEvidence.get(key)||0)+20);interval4WorkEvidence.set(id,(interval4WorkEvidence.get(id)||0)+20)}}
 const allowed=query.scopeWorkIds?.length?new Set(query.scopeWorkIds):null,excludedWorks=new Set(query.excludeWorkIds||[]),excludedTitle=normalizeYoutubeTitle(query.excludeTitle||''),candidateEntries=[...hits].filter(([key])=>{const id=key.split('\u0000')[0];return(!allowed||allowed.has(id))&&!excludedWorks.has(id)}).map(([key,evidence])=>[key,evidence+intervalRetrievalBonus(intervalHits.get(key),intervalGramCount)]),candidateLimit=query.absoluteExactOnly?1800:notes.length>=8?1400:350,startsPerWork=notes.length>=8?8:3,seedCandidates=diversifyCandidates(candidateEntries,candidateLimit,startsPerWork),workEvidence=new Map();
 for(const [key,evidence] of candidateEntries){const id=key.split('\u0000')[0];workEvidence.set(id,Math.max(workEvidence.get(id)||0,evidence))}
 const rankedWorks=(entries,limit)=>{const values=new Map();for(const [key,evidence] of entries){const id=key.split('\u0000')[0];if(!allowed||allowed.has(id))values.set(id,Math.max(values.get(id)||0,evidence))}return[...values].sort((a,b)=>b[1]-a[1]).slice(0,limit)},metricalSeedWorks=new Map([...contourWorkEvidence].filter(([,evidence])=>evidence>=Math.max(3,Math.ceil(contourGramCount*.75)))),fullScanWorks=new Map(notes.length>=8?[...rankedWorks(metricalSeedWorks,40),...rankedWorks(workEvidence,100),...rankedWorks(intervalSeedEvidence,80),...rankedWorks(interval4WorkEvidence,60),...rankedWorks(rhythmSeedEvidence,60)]:[]),fullScanCandidates=[...fullScanWorks].map(([id,evidence])=>[`${id}\u0000*`,evidence]),deepSeedBuckets=new Map();
 for(const entry of [...candidateEntries].sort((a,b)=>b[1]-a[1])){const id=entry[0].split('\u0000')[0];if(!fullScanWorks.has(id))continue;const bucket=deepSeedBuckets.get(id)||[];if(bucket.length<4){bucket.push(entry);deepSeedBuckets.set(id,bucket)}}
 const deepSeedCandidates=[...deepSeedBuckets.values()].flat(),candidates=[...(process.env.MUSICANOTE_SEED_WINDOWS === '1' && !contourMode ? fullScanCandidates.flatMap(([key,evidence])=>{const id=key.split('\u0000')[0],windows=seedWindows(candidateEntries.filter(([k])=>k.split('\u0000')[0]===id),notes.length);return windows.length?windows.map(w=>[`${id}\u0000w${w.start}:${w.end}`,w.evidence]):[[key,evidence]]}):fullScanCandidates),...deepSeedCandidates,...seedCandidates],get=database().prepare('SELECT * FROM works WHERE id=?'),yt=cache(),best=new Map(),spanCache=new Map(),candidateOccurrences=new Map(),requestWorks=new Map(),evaluatedCandidates=new Set();
 if(profileEnabled)profile.retrievalMs=performance.now()-profileStart;const candidateEvaluationStarted=performance.now();
 for(const [candidateKey,evidence] of candidates)if(evidence>=Math.max(1,Math.ceil(qg.length*.5))){const workId=candidateKey.split('\u0000')[0];candidateOccurrences.set(workId,(candidateOccurrences.get(workId)||0)+1)}
 for(const [key,hitCount] of candidates){
  const [id,startText]=key.split('\u0000');if(allowed&&!allowed.has(id))continue;if(evaluatedCandidates.has(key))continue;evaluatedCandidates.add(key);
  let prepared=requestWorks.get(id);if(!prepared){prepared=parsedWorkCache.get(id);if(prepared)profile.parsedCacheHits++;else{profile.parsedCacheMisses++;prepared=profiled('decodeMs',()=>{const rawRow=get.get(id);if(!rawRow)return null;const encoded=rawRow.notes,all=JSON.parse(encoded),row={...rawRow,notes:undefined},value={row,all,allNotes:corpusNotes(id,all)};if(startText==='*')parsedWorkCache.set(id,value,encoded.length*4);return value})}if(!prepared)continue;requestWorks.set(id,prepared)}
  const {row,all,allNotes}=prepared;if(excludedTitle&&normalizeYoutubeTitle(row.title)===excludedTitle)continue;let spans=spanCache.get(id),spanStarted=profileEnabled&&!spans?performance.now():0;if(!spans){
   const meterAt=index=>{const info=sourceMeter(row.source,row.stream_id,all[index]?.m||1);return`${info.count}/${info.unit}`},annotatedByMeter=new Map(),annotated=meter=>{if(!annotatedByMeter.has(meter))annotatedByMeter.set(meter,annotateStructural(allNotes,meter,true));return annotatedByMeter.get(meter)},choose=matches=>matches.map(span=>{const meter=meterAt(span.start),evidence=phraseAlignmentEvidence(notes,annotated(meter),span);return{...span,phraseEvidence:evidence}}).sort((a,b)=>b.phraseEvidence.score-a.phraseEvidence.score||a.phraseEvidence.conflicts-b.phraseEvidence.conflicts||a.start-b.start)[0]??null;
   const intervalMatches=rhythmMode?[]:findAbsoluteExactMatches(notes,allNotes,false),rhythmMatches=query.mode==='melody_rhythm'?findAbsoluteExactMatches(notes,allNotes,true):[];
   spans={interval:choose(intervalMatches),rhythm:query.mode==='melody_rhythm'?choose(rhythmMatches):null,intervalMatches,rhythmMatches,intervalCount:intervalMatches.length,rhythmCount:rhythmMatches.length};spanCache.set(id,spans)
  }
  if(spanStarted)profile.exactScanMs+=performance.now()-spanStarted;
  const requiredSpan=query.absoluteExactOnly?(query.mode==='melody_rhythm'?spans.rhythm:spans.interval):query.exactIntervalOnly?spans.interval:null;if((query.absoluteExactOnly||query.exactIntervalOnly)&&!requiredSpan)continue;
  const intervalExact=Boolean(spans.interval),selectedSpan=requiredSpan??spans.interval,fullScan=startText==='*'&&!selectedSpan,seedWindow=startText.startsWith('w')?startText.slice(1).split(':').map(Number):null,start=selectedSpan?.start??(fullScan?0:seedWindow?seedWindow[0]:+startText),candidateMeter=query.meter==='unknown'?'4/4':query.meter,margin=selectedSpan?0:Math.max(3,Math.ceil(notes.length*.3)),windowStart=fullScan?0:seedWindow&&!selectedSpan?seedWindow[0]:Math.max(0,start-margin),windowRaw=fullScan?all:all.slice(windowStart,selectedSpan?selectedSpan.end+1:Math.min(all.length,seedWindow?seedWindow[1]:start+notes.length+margin)),windowNotes=profiled('windowPrepMs',()=>annotateStructural(corpusNotes(id,windowRaw),candidateMeter,true));
  if(windowNotes.length<Math.max(4,notes.length-1))continue;
  const rhythmStart=Math.max(0,start-windowStart),rhythmLength=Math.min(notes.length,Math.max(0,windowNotes.length-rhythmStart));
  const localAlignment=contourMode?null:rhythmMode?{path:Array.from({length:rhythmLength},(_,index)=>({queryIndex:index,candidateIndex:rhythmStart+index,cost:0,type:'match'})),start:rhythmStart,end:rhythmStart+rhythmLength-1,coverage:rhythmLength/notes.length,cost:0,similarity:100}:selectedSpan?{path:notes.map((_,index)=>({queryIndex:index,candidateIndex:index,cost:0,type:'match'})),start:0,end:notes.length-1,coverage:1,cost:0,similarity:100}:profiled('alignmentMs',()=>alignLocal(notes,windowNotes,query.mode));
  if(localAlignment&&localAlignment.coverage<.75)continue;
  const explicitStructural=row.stream_id.endsWith(':structural');if(!sparseAlignmentAllowed(localAlignment?.path,windowNotes,explicitStructural))continue;
  // Reject if too many candidate notes are skipped relative to the aligned span.
  if(localAlignment&&!intervalExact){const spanLen=localAlignment.end-localAlignment.start+1,matched=localAlignment.path.filter(x=>x.queryIndex!==null&&x.candidateIndex!==null).length;if(spanLen>0&&matched/spanLen<.6)continue}
  const alignedPairs=localAlignment?localAlignment.path.filter(x=>x.queryIndex!==null&&x.candidateIndex!==null):notes.map((_,i)=>({queryIndex:i,candidateIndex:Math.min(windowNotes.length-1,start-windowStart+i),cost:0,type:'match'}));
  const alignedQuery=alignedPairs.map(x=>notes[x.queryIndex]),alignedCandidate=alignedPairs.map(x=>windowNotes[x.candidateIndex]),scores=profiled('scoreMs',()=>score(alignedQuery,alignedCandidate)),rhythmSpan=localAlignment?windowNotes.slice(localAlignment.start,localAlignment.end+1):alignedCandidate,rhythmDtw=query.mode==='melody_rhythm'||rhythmMode?alignRhythmDtw(notes,rhythmSpan):null,equality=pitchEqualitySimilarity(alignedQuery,alignedCandidate),alignmentGaps=localAlignment?.path.filter(step=>step.type==='insertion'||step.type==='deletion').length||0;
  if(intervalExact){scores.pitch=100;scores.interval=100;scores.contour=100}
  if(requiredSpan&&rhythmDtw)scores.rhythm=100;
  if(rhythmDtw)scores.rhythm=intervalExact&&!requiredSpan?rhythmShapeSimilarity(notes,rhythmSpan):rhythmDtw.similarity;
  const completeAlignment=alignedPairs.length===notes.length&&alignmentGaps===0,pitchExact=completeAlignment&&alignedQuery.every((note,index)=>note.pitchMidi===alignedCandidate[index]?.pitchMidi),rhythmExact=completeAlignment&&rhythmShapeSimilarity(notes,rhythmSpan)>=99.9;
  if(query.exactPitchOnly&&!pitchExact)continue;
  if(query.exactRhythmOnly&&!rhythmExact)continue;
  if(rhythmMode){scores.pitch=0;scores.interval=0;scores.contour=0}
  // A contour result must match every U/D/S direction. Step/leap agreement ranks it higher.
  if(contourMode&&scores.contour<99.9)continue;
  const structuralContext=selectedSpan?annotateStructural(corpusNotes(id,all.slice(Math.max(0,selectedSpan.start-notes.length),Math.min(all.length,selectedSpan.end+notes.length+1))),candidateMeter,true):rhythmSpan;
  const scoringMeterInfo=profiled('meterLookupMs',()=>sourceMeter(row.source,row.stream_id,all[start]?.m||1)),scoringMeter=`${scoringMeterInfo.count}/${scoringMeterInfo.unit}`,metric=contourMode||rhythmMode?{score:50,adjustment:0}:profiled('metricScoringMs',()=>metricalEvidence(notes,windowNotes,alignedPairs,query.meter,scoringMeter)),structural=contourMode||rhythmMode?{similarity:0,bonus:0,queryPillars:0,candidatePillars:0,confidence:0}:compareStructural(notes,structuralContext),skeleton=contourMode||rhythmMode?{similarity:0,pillarPitch:0,interval:0,contour:0,queryNotes:0,candidateNotes:0,coverage:0,strongCoverage:0}:metricalSkeletonEvidence(notes,rhythmSpan,query.meter,scoringMeter),melodicAlignment=.7*(localAlignment?.similarity??0)+.3*scores.interval,baseLocal=rhythmMode?(rhythmDtw?.similarity??0):contourMode?.7*scores.interval+.3*scores.contour:query.mode==='melody_rhythm'?.88*melodicAlignment+.12*(rhythmDtw?.similarity??100):melodicAlignment,metricMultiplier=query.downbeatWeightBoost?4:1,effectiveMetricAdjustment=Math.max(intervalExact?-4*metricMultiplier:-5*metricMultiplier,Math.min(4*metricMultiplier,metric.adjustment*metricMultiplier)),structuralBonus=Math.min(intervalExact?3:10,structural.bonus),skeletonBonus=skeleton.similarity>=90?6:skeleton.similarity>=84?3:0,local=requiredSpan?100:clamp(baseLocal+effectiveMetricAdjustment+structuralBonus+skeletonBonus);
  // This is a narrow recall exception, not a result-filling fallback. Every
  // independent signal must clear its own floor before a skeleton-only seed
  // may enter the result set.
  const skeletonException=notes.length>=8&&skeleton.coverage>=.8&&skeleton.strongCoverage>=.85&&skeleton.similarity>=86&&skeleton.pillarPitch>=84&&skeleton.contour>=88&&metric.score>=55&&(query.mode!=='melody_rhythm'||scores.rhythm>=35);
  if(!contourMode&&discrimination.lowInformation&&!intervalExact&&(localAlignment.coverage<.92||alignmentGaps>1||scores.pitch<82||equality<88||metric.score<60||(query.mode==='melody_rhythm'&&scores.rhythm<78)))continue;
  if(!(rhythmMode?local>=72:resultAdmissionAllowed(query.mode,intervalExact,local,scores,structural.similarity,notes.length))&&!skeletonException)continue;
  if(!intervalExact&&!contourMode&&query.startsOnDownbeat&&metric.matches===0&&structural.similarity<50&&local<65)continue;
  const noGaps=!localAlignment||localAlignment.path.every(x=>x.type==='match'||x.type==='substitution');
  const exact=requiredSpan?true:rhythmMode?rhythmExact:contourMode?scores.interval>99.9:noGaps&&scores.interval>99.9&&scores.contour>99.9&&(query.mode==='melody'||scores.rhythm>98);
  const existing=best.get(id);if(existing&&existing.localSimilarity>=local)continue;
  let phraseContext;
  if(phraseContextEnabled){
   prepared.phraseBoundaries??=profiled('phraseContextMs',()=>analyzePhraseBoundaries(allNotes));
   phraseContext=profiled('phraseContextMs',()=>comparePhraseBoundaries(queryBoundaries,prepared.phraseBoundaries,alignedPairs.map(pair=>({...pair,candidateIndex:windowStart+pair.candidateIndex}))));
  }
  const detectedStart=windowStart+(localAlignment?.start??start-windowStart),detectedEnd=windowStart+(localAlignment?.end??start-windowStart+notes.length-1),first=all[detectedStart],last=all[detectedEnd];if(!first||!last)continue;
  const m0=first.m,m1=last.m,excerptRaw=all.filter(n=>n.m>=m0&&n.m<=m1),excerptStart=all.findIndex(n=>n===excerptRaw[0]),excerpt=corpusNotes(id,excerptRaw);
  const alignment=(localAlignment?.path??alignedPairs).map(x=>({queryIndex:x.queryIndex,candidateIndex:x.candidateIndex===null?null:windowStart+x.candidateIndex-excerptStart,cost:x.cost,type:x.type}));
  const insertions=alignment.filter(x=>x.type==='insertion').length,deletions=alignment.filter(x=>x.type==='deletion').length;
  const alignmentEvidence=`정렬 과정에서 삽입 ${insertions}개와 누락 ${deletions}개를 허용한 유사도는 ${Math.round(local)}점입니다.`,why=requiredSpan?[query.mode==='melody_rhythm'?'조옮김을 허용한 음정 진행과 쉼표를 포함한 IOI·음가가 모두 완전히 일치합니다.':'조옮김을 허용한 음정 진행이 완전히 일치합니다.']:intervalExact?[`조옮김을 허용한 음정 진행이 완전히 일치합니다.`,`길게 유지되거나 타이로 연결된 기둥음의 리듬 차이는 제한된 감점으로 반영했습니다.`]:explicitStructural?[`원본 MusicXML의 일반 크기 음표만 기둥음으로 사용하고 cue 음표와 장식층을 분리했습니다.`,alignmentEvidence]:contourMode?[`입력한 U/D/S 진행 방향이 이 구간과 일치합니다.`,`Step/Leap 세부 형태 일치도는 ${Math.round(scores.interval)}점입니다.`]:rhythmDtw?[`n-gram 후보를 local alignment로 다시 정렬해 실제 일치 구간을 찾았습니다.`,alignmentEvidence,`제한형 rhythm DTW 일치도는 ${Math.round(rhythmDtw.similarity)}점입니다.`]:[`n-gram 후보를 local alignment로 다시 정렬해 실제 일치 구간을 찾았습니다.`,alignmentEvidence];
  const retrievalBonus=(intervalExact ? .05 : .25)*Math.min(20,hitCount),phraseScore=Number(selectedSpan?.phraseEvidence?.score??50),phraseAdjustment=selectedSpan?Math.max(-8,Math.min(4,(phraseScore-65)*.12)):0;
  if(phraseContext)why.push(phraseContext.applicable?`국소 경계 근거 ${phraseContext.support}곳 일치·${phraseContext.conflicts}곳 충돌로 최종 순위를 ${phraseContext.adjustment.toFixed(2)}점 보정했습니다. 확정 프레이즈 분석이나 정확도 확률은 아닙니다.`:'비교할 확실한 국소 경계 근거가 없어 새 문맥 보정은 적용하지 않았습니다.');
  const strictOccurrences=profiled('occurrenceScanMs',()=>findAbsoluteExactMatches(rhythmSpan,allNotes,true)),occurrenceCount=Math.max(1,strictOccurrences.length),occurrenceMeasures=[...new Set(strictOccurrences.map(span=>all[span.start]?.m).filter(Number.isFinite))],importance=motifImportance(row.role,occurrenceCount,notes.length,all.length),streamRoleAdjustment=-12*(1-Number(row.role||0));
  const matchFeatures=features(rhythmSpan),matchSignature=JSON.stringify({intervals:matchFeatures.i,rhythm:matchFeatures.r}),rankingAdjustment=retrievalBonus+phraseAdjustment+streamRoleAdjustment+(phraseContext?.adjustment||0),ranking=calibratedResultRanking(exact,local,scores,query.mode,rankingAdjustment);
  best.set(id,{kind:exact?'exact':'similar',ranking,...(phraseContext?{phraseContext}:{}),localSimilarity:clamp(local),occurrenceImportance:importance,occurrenceCount,occurrenceMeasures,_matchSignature:matchSignature,scores:{...scores,meter:Math.round(metric.score),structural:Math.round(structural.similarity),skeleton:Math.round(skeleton.similarity),pillarPitch:Math.round(skeleton.pillarPitch),specificity:Math.round(discrimination.specificity),repeatPattern:Math.round(equality),phrase:Math.round(phraseScore)},startMeasure:m0,startBeat:first.b,endMeasure:m1,alignment,why:[...why,discrimination.lowInformation?`반복음이 많은 Query이므로 반복 위치 ${Math.round(equality)}점, 리듬·강박·전체 대응률의 엄격한 하한을 적용했습니다.`:`Query 선율 정보량은 ${Math.round(discrimination.specificity)}점입니다.`,`박자·프레이즈 단서로 축약한 기둥음은 ${Math.round(skeleton.strongCoverage*100)}% 대응했고, 조옮김 후 음높이 일치도는 ${Math.round(skeleton.pillarPitch)}점입니다.`,selectedSpan?`음표·attack·쉼표 종결을 비교한 프레이즈 문맥 일치도는 ${Math.round(phraseScore)}점입니다.`:'프레이즈 문맥은 유사 정렬 구간의 보조 근거로만 사용했습니다.',metric.matches?`Query의 중요 박과 후보 downbeat가 ${metric.matches}곳에서 유효하게 일치합니다.`:'Query의 중요 박과 대응하는 downbeat 일치가 없어 순위를 보정했습니다.',metric.overAccents?`Query의 약박 음 ${metric.overAccents}개가 후보의 강박에 과도하게 대응해 Downbeat Weight를 감점했습니다.`:'Query 약박을 후보 강박으로 과도하게 끌어올린 대응은 없습니다.',structural.bonus>0?`장식음을 축약한 기둥음 ${structural.queryPillars}개와 후보 ${structural.candidatePillars}개가 ${Math.round(structural.similarity)}점으로 일치했습니다.`:'기둥음 차이는 가산점으로 사용하지 않았습니다.',`같은 음정·리듬은 해당 파트에서 ${occurrenceCount}회 확인되며 반복·점유 비중 중요도는 ${Math.round(importance)}점입니다.`,`파트·staff·voice의 melody-role ${Math.round(Number(row.role||0)*100)}점을 최종 정렬에 반영했습니다.`],work:{workId:id,sourceId:row.source,streamId:row.stream_id,title:repairMetadataText(row.title),artist:repairMetadataText(row.composer)||'Unknown',year:'',genre:'MusicXML',accent:'#52736a',notes:excerpt,melodyRoleScore:row.role,roleConfidence:row.role,analysisConfidence:.72,prominence:.65,youtubeId:youtubeId(yt,id,row.title),accessPolicy:row.access_policy||'public-domain',fullScoreAvailable:(row.access_policy||'public-domain')!=='research-preview'}});
 }
 if(profileEnabled)profile.candidateEvaluationMs=performance.now()-candidateEvaluationStarted;const enrichmentStarted=performance.now();
 const grouped=new Map();for(const item of [...best.values()].sort((a,b)=>b.ranking-a.ranking)){const key=`${item.work.sourceId}\u0000${item._matchSignature}`,part={streamId:item.work.streamId,count:item.occurrenceCount,measures:item.occurrenceMeasures};if(grouped.has(key)){grouped.get(key).partOccurrences.push(part)}else{item.partOccurrences=[part];grouped.set(key,item)}}
 const list=[...grouped.values()].slice(0,limit);
 for(const item of list){
  item.work.artist=displayComposer(item.work.artist);item.work.keyFifths=sourceKey(item.work.sourceId);
  const originalStart=item.startMeasure,clef=sourceClef(item.work.sourceId,item.work.streamId,originalStart,item.work.notes),meter=sourceMeter(item.work.sourceId,item.work.streamId,originalStart),basePartName=sourcePartName(item.work.sourceId,item.work.streamId),partName=item.work.streamId.endsWith(':structural')?`${basePartName} · structural melody`:basePartName,labels=sourceMeasures(item.work.sourceId,item.work.streamId),label=n=>labels.find(x=>x.ordinal===n)?.label??String(n);
  item.work.clefShape=clef.shape;item.work.clefLine=clef.line;item.work.meter=`${meter.count}/${meter.unit}`;item.work.partName=partName;item.work.genre=`MusicXML · ${partName}`;
  item.startMeasure=displayMeasure(label(item.startMeasure));item.endMeasure=displayMeasure(label(item.endMeasure));
  item.occurrenceMeasures=(item.occurrenceMeasures||[]).map(measure=>displayMeasure(label(measure)));
  const parts=new Map();for(const occurrence of item.partOccurrences||[]){const occurrenceLabels=sourceMeasures(item.work.sourceId,occurrence.streamId),occurrenceLabel=n=>occurrenceLabels.find(x=>x.ordinal===n)?.label??String(n),partBase=sourcePartName(item.work.sourceId,occurrence.streamId),partName=occurrence.streamId.endsWith(':structural')?`${partBase} · structural melody`:partBase,measures=occurrence.measures.map(measure=>displayMeasure(occurrenceLabel(measure))),prior=parts.get(partName);if(prior){prior.count=Math.max(prior.count,occurrence.count);prior.measures=[...new Set([...prior.measures,...measures])]}else parts.set(partName,{partName,streamId:occurrence.streamId,count:occurrence.count,measures})}item.partOccurrences=[...parts.values()];delete item._matchSignature;
  for(const note of item.work.notes){note.measureOrdinal=note.measure;note.measure=displayMeasure(label(note.measure));note.clefShape=clef.shape;note.clefLine=clef.line;note.meterCount=meter.count;note.meterUnit=meter.unit;note.partName=partName;note.keyFifths=item.work.keyFifths}
 }
 const result={exact:list.filter(x=>x.kind==='exact'),similar:list.filter(x=>x.kind==='similar')};profile.meterPersistMs=flushMeterContexts();if(profileEnabled){profile.enrichmentMs=performance.now()-enrichmentStarted;profile.parsedCacheBytes=parsedWorkCache.stats().weight;result.profile={...Object.fromEntries(Object.entries(profile).map(([key,value])=>[key,Math.round(value)])),totalMs:Math.round(performance.now()-profileStart),candidateKeys:candidates.length,uniqueWorksEvaluated:requestWorks.size,results:list.length}}return result;
}

export function getWork(id,options={}){
 const row=database().prepare('SELECT * FROM works WHERE id=?').get(id);if(!row)return null;
 const raw=JSON.parse(row.notes),notes=corpusNotes(row.id,raw),labels=sourceMeasures(row.source,row.stream_id),label=n=>labels.find(x=>x.ordinal===n)?.label??String(n),clef=sourceClef(row.source,row.stream_id,raw[0]?.m||1,notes),meter=sourceMeter(row.source,row.stream_id,raw[0]?.m||1),basePartName=sourcePartName(row.source,row.stream_id),partName=row.stream_id.endsWith(':structural')?`${basePartName} · structural melody`:basePartName,keyFifths=sourceKey(row.source),pitchNames=new Map(),durations=new Map(),motifs=new Map(),measures=new Map();
 for(const note of notes){note.measureOrdinal=note.measure;note.measure=displayMeasure(label(note.measure));note.clefShape=clef.shape;note.clefLine=clef.line;note.meterCount=meter.count;note.meterUnit=meter.unit;note.partName=partName;note.keyFifths=keyFifths}
 attachBreathSymbols(notes,sourceXml(row.source),row.stream_id).forEach((note,index)=>{notes[index].breathSymbols=note.breathSymbols});
 for(const n of raw){pitchNames.set(n.s,(pitchNames.get(n.s)||0)+1);durations.set(n.d,(durations.get(n.d)||0)+1);measures.set(label(n.m),(measures.get(label(n.m))||0)+1)}
 for(let i=0;i<raw.length-3;i++){const motif=raw.slice(i,i+4).map((n,j,a)=>j?n.p-a[j-1].p:0).slice(1).join(',');motifs.set(motif,(motifs.get(motif)||0)+1)}
 const top=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([label,count])=>({label:String(label),count}));
 let xml='';try{xml=sourceXml(row.source)}catch{}
 const yt=cache(),accessPolicy=row.access_policy||'public-domain';
 const requestedOnsets=String(options.targets||'').split(',').filter(value=>value.trim().length>0).map(value=>Number(value.split(':')[0])).filter(Number.isFinite);
 const hasSearchRange=requestedOnsets.length>0||Number(options.ordinalStart)>0||Number(options.start)>0;
 let ordinalStart=optionalPositiveNumber(options.ordinalStart),ordinalEnd=optionalPositiveNumber(options.ordinalEnd);
 if(!Number.isFinite(ordinalStart)){const first=requestedOnsets.length?raw.find(note=>Math.abs(note.o-requestedOnsets[0])<1e-6):raw.find(note=>String(label(note.m))===String(options.start));ordinalStart=first?.m||1}
 if(!Number.isFinite(ordinalEnd)){const last=requestedOnsets.length?[...raw].reverse().find(note=>Math.abs(note.o-requestedOnsets.at(-1))<1e-6):[...raw].reverse().find(note=>String(label(note.m))===String(options.end));ordinalEnd=last?.m||ordinalStart}
 const excerptRequested=String(options.excerpt||'')==='1',fullResearchDetail=accessPolicy==='research-preview'&&!excerptRequested&&fullResearchScoreEnabled(),restrictedPreviewActive=accessPolicy==='research-preview'&&!excerptRequested&&!fullResearchDetail;
 if(accessPolicy==='research-preview'){
  if(excerptRequested)xml=hasSearchRange?restrictedPreviewXml(xml,row.stream_id,ordinalStart,ordinalEnd,0):'';
  else if(restrictedPreviewActive)xml=hasSearchRange?restrictedPreviewXml(xml,row.stream_id,ordinalStart,ordinalEnd,10,true):'';
 }else if(excerptRequested&&hasSearchRange){
  xml=restrictedPreviewXml(xml,row.stream_id,ordinalStart,ordinalEnd,0);
 }
 xml=translateInstrumentNamesInXml(xml);
 let sourceMetadata={};try{sourceMetadata=JSON.parse(row.source_metadata||'{}')}catch{}
 const previewOrdinalStart=excerptRequested&&hasSearchRange?Math.max(1,ordinalStart):restrictedPreviewActive&&hasSearchRange?Math.max(1,Math.max(1,ordinalStart)-10):undefined;
 const phraseAnalysis=analyzePhraseBoundaries(notes);let harmonyStreams=harmonyStreamCache.get(row.source);if(!harmonyStreams){harmonyStreams=musicXmlHarmonyStreams(sourceXml(row.source));harmonyStreamCache.set(row.source,harmonyStreams);if(harmonyStreamCache.size>harmonyStreamCacheLimit)harmonyStreamCache.delete(harmonyStreamCache.keys().next().value)}const boundaryHarmony=analyzeBoundaryHarmony({melodyNotes:raw,boundaries:phraseAnalysis.boundaries,streams:harmonyStreams,keyFifths,meter:`${meter.count}/${meter.unit}`});
 return{workId:row.id,streamId:row.stream_id,partName,title:repairMetadataText(row.title),artist:displayComposer(repairMetadataText(row.composer)),sourceId:row.source,accessPolicy,fullScoreAvailable:accessPolicy!=='research-preview'||fullResearchDetail,restrictedPreviewActive,previewOrdinalStart,excerptPrepared:excerptRequested&&hasSearchRange,sourceMetadata,keyFifths,clefShape:clef.shape,clefLine:clef.line,meter:`${meter.count}/${meter.unit}`,youtubeId:youtubeId(yt,row.id,row.title),notes,xml,phraseAnalysis,boundaryHarmony,stats:{pitches:top(pitchNames),rhythms:top(durations),motifs:rankedMotifs(raw),structure:{measures:measures.size,notes:raw.length,peakMeasures:top(measures).slice(0,5)}}};
}

const catalogTokens=text=>String(text||'').normalize('NFKC').toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu)||[];
export const catalogTitleMatches=(title,text)=>{const wanted=catalogTokens(text),available=catalogTokens(title);return wanted.every(term=>available.some(word=>term.length===1?word===term:word.startsWith(term)))};
export function searchCatalog(text,limit=12){
 const query=String(text||'').trim(),queryTokens=catalogTokens(query);if(!queryTokens.length||query.length<2)return[];const store=database(),hasFts=Boolean(store.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='works_fts'").get());let rows=[];
 if(hasFts){const terms=queryTokens.map(term=>`"${term.replaceAll('"','""')}"*`).join(' AND ');try{rows=store.prepare('SELECT w.id,w.title,w.composer,w.source,w.stream_id,w.role,w.access_policy,bm25(works_fts,0,5,4,3,2,1) rank FROM works_fts JOIN works w ON w.id=works_fts.id WHERE works_fts MATCH ? ORDER BY rank,w.role DESC LIMIT ?').all(terms,Math.max(limit*100,1000))}catch{rows=[]}}
 if(rows.length){const titleRows=rows.filter(row=>catalogTitleMatches(row.title,query));if(titleRows.length)rows=titleRows}
 if(!rows.length){const escaped=queryTokens.map(term=>`%${term.replace(/[\\%_]/g,value=>`\\${value}`)}%`),clause=queryTokens.map(()=>"(lower(title) LIKE ? ESCAPE '\\' OR lower(normalized_title) LIKE ? ESCAPE '\\')").join(' AND '),params=escaped.flatMap(pattern=>[pattern,pattern]);rows=store.prepare(`SELECT id,title,composer,source,stream_id,role,access_policy,0 rank FROM works WHERE ${clause} ORDER BY role DESC,title LIMIT ?`).all(...params,Math.max(limit*20,240)).filter(row=>catalogTitleMatches(row.title,query))}
 if(!rows.length){const escaped=queryTokens.map(term=>`%${term.replace(/[\\%_]/g,value=>`\\${value}`)}%`),haystack="lower(coalesce(title,'')||' '||coalesce(normalized_title,'')||' '||coalesce(composer,'')||' '||coalesce(source,''))",clause=queryTokens.map(()=>`${haystack} LIKE ? ESCAPE '\\'`).join(' AND ');rows=store.prepare(`SELECT id,title,composer,source,stream_id,role,access_policy,0 rank FROM works WHERE ${clause} ORDER BY role DESC,title LIMIT ?`).all(...escaped,Math.max(limit*8,80))}
 const seen=new Set(),items=[];for(const row of rows){const source=String(row.source||row.id);if(seen.has(source))continue;seen.add(source);const title=repairMetadataText(row.title);items.push({workId:row.id,title,composer:displayComposer(repairMetadataText(row.composer||'')),source:row.source,partName:sourcePartName(row.source,row.stream_id)});if(items.length>=limit)break}return items;
}

export function searchApiPlugin(){return{name:'musicanote-search-api',configureServer(server){server.middlewares.use('/api/search/v2/melody',(req,res)=>{if(req.method!=='POST'){res.statusCode=405;return res.end()}let body='';req.on('data',x=>body+=x);req.on('end',()=>{try{if(!existsSync(dbPath))throw new Error('Search index is not built. Run pnpm index:sqlite.');const payload=JSON.parse(body),limit=Math.max(1,Math.min(200,Number(payload.limit)||100));res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(searchDatabase(payload.query,limit)))}catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}))}})})}}}
export function corpusStatsApiPlugin(){return{name:'musicanote-corpus-stats-api',configureServer(server){server.middlewares.use('/api/search/v2/stats',(req,res)=>{res.setHeader('Content-Type','application/json; charset=utf-8');if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({error:'Method not allowed'}))}try{res.end(JSON.stringify(corpusStats()))}catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}))}})}}}
export function workApiPlugin(){return{name:'musicanote-work-api',configureServer(server){server.middlewares.use('/api/work/',(req,res)=>{const url=new URL(req.url||'','http://localhost'),id=decodeURIComponent(url.pathname.replace(/^\//,'')),work=getWork(id,{start:url.searchParams.get('start'),end:url.searchParams.get('end'),targets:url.searchParams.get('targets'),ordinalStart:url.searchParams.get('ordinalStart'),ordinalEnd:url.searchParams.get('ordinalEnd'),excerpt:url.searchParams.get('excerpt')});res.setHeader('Content-Type','application/json; charset=utf-8');if(!work){res.statusCode=404;return res.end(JSON.stringify({error:'Work not found'}))}res.end(JSON.stringify(work))})}}}
let youtubeWorker=null;
export function youtubeBackfillPlugin(){return{name:'musicanote-youtube-backfill',configureServer(server){server.middlewares.use('/api/youtube/backfill/start',(req,res)=>{res.setHeader('Content-Type','application/json; charset=utf-8');if(req.method!=='POST'){res.statusCode=405;return res.end(JSON.stringify({error:'Method not allowed'}))}let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{let title='';try{title=JSON.parse(body||'{}').title||''}catch{}const configured=Boolean(process.env.YOUTUBE_API_KEY);if(!configured)return res.end(JSON.stringify({started:false,configured:false,reason:'YOUTUBE_API_KEY is not set'}));if(youtubeWorker&&!youtubeWorker.killed)return res.end(JSON.stringify({started:false,configured:true,running:true}));const script=fileURLToPath(new URL('../scripts/youtube-backfill.mjs',import.meta.url)),args=[script];if(title)args.push('--priority-title',title);youtubeWorker=spawn(process.execPath,args,{cwd:fileURLToPath(new URL('..',import.meta.url)),env:process.env,stdio:'ignore',windowsHide:true});youtubeWorker.once('exit',()=>{youtubeWorker=null});res.end(JSON.stringify({started:true,configured:true,running:true,priorityTitle:title||null}))})})}}}
export function catalogSearchPlugin(){return{name:'musicanote-catalog-search',configureServer(server){server.middlewares.use('/api/catalog/search',(req,res)=>{res.setHeader('Content-Type','application/json; charset=utf-8');if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({error:'Method not allowed'}))}try{const url=new URL(req.url||'','http://localhost'),query=url.searchParams.get('q')||'',limit=Math.max(1,Math.min(50,Number(url.searchParams.get('limit'))||12)),offset=Math.max(0,Number(url.searchParams.get('offset'))||0),all=searchCatalog(query,offset+limit+1),items=all.slice(offset,offset+limit);res.end(JSON.stringify({items,offset,limit,hasMore:all.length>offset+limit}))}catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}))}})}}}
