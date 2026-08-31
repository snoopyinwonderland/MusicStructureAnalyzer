import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

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
const diatonicStep=(from,to)=>{const letters='CDEFGAB',a=letters.indexOf(String(from?.spelling||'')[0]?.toUpperCase()),b=letters.indexOf(String(to?.spelling||'')[0]?.toUpperCase());if(a<0||b<0)return false;const distance=(b-a+7)%7;return distance===1||distance===6};
export const intervalShape=(semitones,from,to)=>semitones===0?'S':`${Math.abs(semitones)<=2||Math.abs(semitones)===3&&diatonicStep(from,to)?'STEP':'LEAP'}_${semitones>0?'U':'D'}`;
const score=(q,c)=>{const qf=features(q),cf=features(c),direction=100-mean(qf.c.map((v,i)=>v==cf.c[i]?0:100));let interval=100-mean(qf.i.map((v,i)=>Math.min(100,Math.abs(v-(cf.i[i]??v+7))*14))),rhythm=100-mean(qf.r.map((v,i)=>Math.min(100,Math.abs(v-(cf.r[i]??v+1))*45))),pitch=100-mean(q.map((n,i)=>Math.min(100,Math.abs((n.pitchMidi-q[0].pitchMidi)-((c[i]?.pitchMidi??c[0].pitchMidi)-c[0].pitchMidi))*10)));if(q[0]?._mode==='contour'){const weights=qf.i.map((_,i)=>Number(q[i+1]?.contourShapeConfidence??1)),total=weights.reduce((a,b)=>a+b,0)||1,specific=100-weights.reduce((sum,weight,i)=>sum+(intervalShape(qf.i[i],q[i],q[i+1])===intervalShape(cf.i[i]??-qf.i[i],c[i],c[i+1])?0:100*weight),0)/total;interval=specific;pitch=specific;rhythm=direction}return{pitch:clamp(pitch),interval:clamp(interval),contour:clamp(direction),rhythm:clamp(rhythm)}};

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
 if(mode==='melody_rhythm')return importance*(.42*intervalCost+.28*directionCost+.12*shapeCost+.18*rhythmCost);
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

export function resultAdmissionAllowed(mode,intervalExact,local,scores,structuralSimilarity){
 if(mode==='contour'||intervalExact)return true;
 const ordinary=local>=55&&scores.interval>=65&&(mode!=='melody_rhythm'||scores.rhythm>=55);
 const structuralException=local>=50&&scores.interval>=60&&structuralSimilarity>=82&&(mode!=='melody_rhythm'||scores.rhythm>=45);
 return ordinary||structuralException;
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
// When the complete transposition-invariant interval sequence is present, a
// long tied pillar must not erase the melodic evidence. Rhythm still orders
// exact melodic occurrences, but is a bounded penalty instead of a hard gate.
export const exactIntervalRhythmFactor=similarity=>.84+.16*clamp(similarity)/100;
export function metricalEvidence(query,candidate,pairs,queryMeter='4/4',candidateMeter=queryMeter){
 const length=parseMeter(queryMeter).quarterLength,important=pairs.filter(pair=>pair.queryIndex!==null&&pair.candidateIndex!==null&&metricWeightAt((Number(query[pair.queryIndex].onset)||0)%length+1,queryMeter)>=.65);
 if(!important.length)return{score:50,adjustment:0,matches:0,conflicts:0};
 let matches=0,conflicts=0;
 for(const pair of important){const queryPosition=(Number(query[pair.queryIndex].onset)||0)%length+1,candidatePosition=Number(candidate[pair.candidateIndex].beat)||1,metricMatch=Math.abs(metricWeightAt(queryPosition,queryMeter)-metricWeightAt(candidatePosition,candidateMeter))<=.2,melodicMatch=Number(pair.cost||0)<.18;if(metricMatch&&melodicMatch)matches++;else conflicts++}
 const matchRatio=matches/important.length,conflictRatio=conflicts/important.length;
 return{score:clamp(50+50*matchRatio-35*conflictRatio),adjustment:6*matchRatio-14*conflictRatio,matches,conflicts};
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
export const normalizeYoutubeTitle=title=>String(title||'').replace(/\.musicxml(?:\.xml)?$|\.xml$/i,'').replace(/^\s*\d+\.?\s*/,'').replace(youtubeArrangement,' ').replace(/[,_]+/g,' ').replace(/\s+/g,' ').trim().replace(/\s+(?:and|&)\s*$/i,'').trim().toLocaleLowerCase('en-US');
export const youtubeId=(all,id,title)=>{const works=all?.works||all||{},item=works[id]||works[title]||works[normalizeYoutubeTitle(title)]||Object.values(works).find(x=>x?.workId===id);return item?.youtubeId||item?.videoId};
const musicxmlRoot='K:/Music Analysis/musicxml/';
const keyCache=new Map();
const sourceKey=source=>{if(keyCache.has(source))return keyCache.get(source);try{const xml=readFileSync(musicxmlRoot+source,'utf8'),match=xml.match(/<fifths>\s*(-?\d+)\s*<\/fifths>/);const value=match?Number(match[1]):0;keyCache.set(source,value);return value}catch{return 0}};
const sourceClef=(source,streamId,targetMeasure,notes)=>{try{const [partId,staff='1']=streamId.split(':'),xml=readFileSync(musicxmlRoot+source,'utf8'),part=xml.match(new RegExp(`<part\\s+id="${partId}"[^>]*>([\\s\\S]*?)<\\/part>`))?.[1]||'';let found=null;for(const match of part.matchAll(/<measure\b[^>]*number="([^"]+)"[^>]*>([\s\S]*?)<\/measure>/g)){const number=Number(match[1]);if(Number.isFinite(number)&&number>targetMeasure)break;for(const clef of match[2].matchAll(/<clef\b([^>]*)>([\s\S]*?)<\/clef>/g)){const assigned=clef[1].match(/number="(\d+)"/)?.[1]||'1';if(assigned!==staff)continue;const shape=clef[2].match(/<sign>\s*([GFC])\s*<\/sign>/)?.[1],line=Number(clef[2].match(/<line>\s*(\d+)\s*<\/line>/)?.[1]);if(shape)found={shape,line:line||(shape==='F'?4:2)}}}if(found)return found}catch{}const pitches=notes.map(n=>n.pitchMidi).sort((a,b)=>a-b),median=pitches[Math.floor(pitches.length/2)]||60;return median<60?{shape:'F',line:4}:{shape:'G',line:2}};
const displayComposer=value=>String(value||'').split(/\r?\n/).find(line=>/^\s*composed by\b/i.test(line))?.trim()||'';
const corpusNotes=(id,raw)=>raw.map((n,i)=>({id:`${id}-${i}`,kind:'note',pitchMidi:n.p,spelling:n.s,durationRatio:n.d,onset:n.o,cue:Boolean(n.u),tieStart:Boolean(n.ts),tieStop:Boolean(n.te),tieEndMeasure:n.tm,measure:n.m,beat:n.b,metricStrength:n.b===1?1:.5,structuralSalience:.5,structuralConfidence:.65,chordRole:'unknown'}));

const measureCache=new Map();
const meterCache=new Map();
const sourceMeter=(source,streamId,targetMeasure)=>{const cacheKey=`${source}:${streamId.split(':')[0]}:${targetMeasure}`;if(meterCache.has(cacheKey))return meterCache.get(cacheKey);try{const partId=streamId.split(':')[0],xml=readFileSync(musicxmlRoot+source,'utf8'),part=xml.match(new RegExp(`<part\\s+id="${partId}"[^>]*>([\\s\\S]*?)<\\/part>`))?.[1]||'';let meter={count:4,unit:4};for(const match of part.matchAll(/<measure\b[^>]*number="([^"]+)"[^>]*>([\s\S]*?)<\/measure>/g)){const number=Number(match[1]);if(Number.isFinite(number)&&number>targetMeasure)break;const beatsText=match[2].match(/<beats>\s*([\d+]+)\s*<\/beats>/)?.[1],count=beatsText?.split('+').reduce((sum,value)=>sum+Number(value),0),unit=Number(match[2].match(/<beat-type>\s*(\d+)\s*<\/beat-type>/)?.[1]);if(count&&unit)meter={count,unit}}meterCache.set(cacheKey,meter);return meter}catch{const meter={count:4,unit:4};meterCache.set(cacheKey,meter);return meter}};
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
 const notes=annotateStructural(prepareQueryNotes(query.events),query.meter,false);
 if(notes.length)notes[0]._mode=query.mode;
 if(notes.length<4)return{exact:[],similar:[]};
 const contourMode=query.mode==='contour';
 const qg=qgrams(features(notes)).filter(g=>!contourMode||g.token.startsWith('c:'));
 const hits=new Map(),sql=database().prepare('SELECT work_id,pos FROM grams WHERE token=? LIMIT 3000');
 for(const gram of qg)for(const row of sql.all(gram.token)){const start=Math.max(0,Number(row.pos)-gram.pos),key=`${row.work_id}\u0000${start}`;hits.set(key,(hits.get(key)||0)+1)}
 const allowed=query.scopeWorkIds?.length?new Set(query.scopeWorkIds):null,candidates=[...hits].filter(([key])=>!allowed||allowed.has(key.split('\u0000')[0])).sort((a,b)=>b[1]-a[1]).slice(0,query.absoluteExactOnly?1200:350),get=database().prepare('SELECT * FROM works WHERE id=?'),yt=cache(),best=new Map(),spanCache=new Map();
 for(const [key,hitCount] of candidates){
  const [id,startText]=key.split('\u0000');if(allowed&&!allowed.has(id))continue;const row=get.get(id);if(!row)continue;
  const all=JSON.parse(row.notes),allNotes=corpusNotes(id,all);let spans=spanCache.get(id);if(!spans){
   const meterAt=index=>{const info=sourceMeter(row.source,row.stream_id,all[index]?.m||1);return`${info.count}/${info.unit}`},annotatedByMeter=new Map(),annotated=meter=>{if(!annotatedByMeter.has(meter))annotatedByMeter.set(meter,annotateStructural(allNotes,meter,true));return annotatedByMeter.get(meter)},choose=matches=>matches.map(span=>{const meter=meterAt(span.start),evidence=phraseAlignmentEvidence(notes,annotated(meter),span);return{...span,phraseEvidence:evidence}}).sort((a,b)=>b.phraseEvidence.score-a.phraseEvidence.score||a.phraseEvidence.conflicts-b.phraseEvidence.conflicts||a.start-b.start)[0]??null;
   spans={interval:choose(findAbsoluteExactMatches(notes,allNotes,false)),rhythm:query.mode==='melody_rhythm'?choose(findAbsoluteExactMatches(notes,allNotes,true)):null};spanCache.set(id,spans)
  }
  const requiredSpan=query.absoluteExactOnly?(query.mode==='melody_rhythm'?spans.rhythm:spans.interval):null;if(query.absoluteExactOnly&&!requiredSpan)continue;
  const intervalExact=Boolean(spans.interval),selectedSpan=requiredSpan??spans.interval,start=selectedSpan?.start??+startText,candidateMeterInfo=sourceMeter(row.source,row.stream_id,all[start]?.m||1),candidateMeter=`${candidateMeterInfo.count}/${candidateMeterInfo.unit}`,margin=selectedSpan?0:Math.max(3,Math.ceil(notes.length*.3)),windowStart=Math.max(0,start-margin),windowRaw=all.slice(windowStart,selectedSpan?selectedSpan.end+1:Math.min(all.length,start+notes.length+margin)),windowNotes=annotateStructural(corpusNotes(id,windowRaw),candidateMeter,true);
  if(windowNotes.length<Math.max(4,notes.length-1))continue;
  const localAlignment=contourMode?null:selectedSpan?{path:notes.map((_,index)=>({queryIndex:index,candidateIndex:index,cost:0,type:'match'})),start:0,end:notes.length-1,coverage:1,cost:0,similarity:100}:alignLocal(notes,windowNotes,query.mode);
  if(localAlignment&&localAlignment.coverage<.75)continue;
  const explicitStructural=row.stream_id.endsWith(':structural');if(!sparseAlignmentAllowed(localAlignment?.path,windowNotes,explicitStructural))continue;
  // Reject if too many candidate notes are skipped relative to the aligned span.
  if(localAlignment&&!intervalExact){const spanLen=localAlignment.end-localAlignment.start+1,matched=localAlignment.path.filter(x=>x.queryIndex!==null&&x.candidateIndex!==null).length;if(spanLen>0&&matched/spanLen<.6)continue}
  const alignedPairs=localAlignment?localAlignment.path.filter(x=>x.queryIndex!==null&&x.candidateIndex!==null):notes.map((_,i)=>({queryIndex:i,candidateIndex:Math.min(windowNotes.length-1,start-windowStart+i),cost:0,type:'match'}));
  const alignedQuery=alignedPairs.map(x=>notes[x.queryIndex]),alignedCandidate=alignedPairs.map(x=>windowNotes[x.candidateIndex]),scores=score(alignedQuery,alignedCandidate),rhythmSpan=localAlignment?windowNotes.slice(localAlignment.start,localAlignment.end+1):alignedCandidate,rhythmDtw=query.mode==='melody_rhythm'?alignRhythmDtw(notes,rhythmSpan):null;
  if(intervalExact){scores.pitch=100;scores.interval=100;scores.contour=100}
  if(requiredSpan&&rhythmDtw)scores.rhythm=100;
  if(rhythmDtw)scores.rhythm=intervalExact&&!requiredSpan?rhythmShapeSimilarity(notes,rhythmSpan):rhythmDtw.similarity;
  // A contour result must match every U/D/S direction. Step/leap agreement ranks it higher.
  if(contourMode&&scores.contour<99.9)continue;
  const structuralContext=selectedSpan?annotateStructural(corpusNotes(id,all.slice(Math.max(0,selectedSpan.start-notes.length),Math.min(all.length,selectedSpan.end+notes.length+1))),candidateMeter,true):rhythmSpan;
  const metric=contourMode?{score:50,adjustment:0}:metricalEvidence(notes,windowNotes,alignedPairs,query.meter,candidateMeter),structural=contourMode?{similarity:0,bonus:0,queryPillars:0,candidatePillars:0,confidence:0}:compareStructural(notes,structuralContext),rhythmFactor=intervalExact?exactIntervalRhythmFactor(scores.rhythm):rhythmRankFactor(rhythmDtw?.similarity??100),baseLocal=contourMode?.7*scores.interval+.3*scores.contour:query.mode==='melody_rhythm'?localAlignment.similarity*rhythmFactor:localAlignment.similarity,effectiveMetricAdjustment=intervalExact?Math.max(-4,metric.adjustment):metric.adjustment,structuralBonus=Math.min(intervalExact?3:12,structural.bonus),local=requiredSpan?100:clamp(baseLocal+effectiveMetricAdjustment+structuralBonus);
  if(!resultAdmissionAllowed(query.mode,intervalExact,local,scores,structural.similarity))continue;
  if(!intervalExact&&!contourMode&&query.startsOnDownbeat&&metric.matches===0&&structural.similarity<50&&local<65)continue;
  const noGaps=!localAlignment||localAlignment.path.every(x=>x.type==='match'||x.type==='substitution');
  const exact=requiredSpan?true:contourMode?scores.interval>99.9:noGaps&&scores.interval>99.9&&scores.contour>99.9&&(query.mode==='melody'||scores.rhythm>98);
  const existing=best.get(id);if(existing&&existing.localSimilarity>=local)continue;
  const detectedStart=windowStart+(localAlignment?.start??start-windowStart),detectedEnd=windowStart+(localAlignment?.end??start-windowStart+notes.length-1),first=all[detectedStart],last=all[detectedEnd];if(!first||!last)continue;
  const m0=first.m,m1=last.m,excerptRaw=all.filter(n=>n.m>=m0&&n.m<=m1),excerptStart=all.findIndex(n=>n===excerptRaw[0]),excerpt=corpusNotes(id,excerptRaw);
  const alignment=(localAlignment?.path??alignedPairs).map(x=>({queryIndex:x.queryIndex,candidateIndex:x.candidateIndex===null?null:windowStart+x.candidateIndex-excerptStart,cost:x.cost,type:x.type}));
  const insertions=alignment.filter(x=>x.type==='insertion').length,deletions=alignment.filter(x=>x.type==='deletion').length;
  const alignmentEvidence=`장식음·추가음 ${insertions}개, 누락 대응 ${deletions}개를 허용한 유사도 ${Math.round(local)}점입니다.`,why=requiredSpan?[query.mode==='melody_rhythm'?'조옮김을 허용한 음정열과 내부 쉼표를 포함한 IOI·음가가 모두 완전히 일치합니다.':'조옮김을 허용한 연속 음정열이 완전히 일치합니다.']:intervalExact?[`조옮김을 허용한 연속 음정열이 완전히 일치합니다.`,`길게 유지되거나 타이된 기둥음의 리듬 차이는 제한된 감점으로 반영했습니다.`]:explicitStructural?[`원본 MusicXML의 일반 크기 음표만 기둥선으로 사용하고 cue 음표는 표면 장식층으로 분리했습니다.`,alignmentEvidence]:contourMode?[`입력한 U/D/S 진행 방향이 이 구간과 모두 일치합니다.`,`Step/Leap 세부 형태 일치도는 ${Math.round(scores.interval)}점입니다.`]:rhythmDtw?[`n-gram 후보를 local alignment로 다시 정렬해 실제 일치 구간을 찾았습니다.`,alignmentEvidence,`제한적 rhythm DTW 일치도는 ${Math.round(rhythmDtw.similarity)}점입니다.`]:[`n-gram 후보를 local alignment로 다시 정렬해 실제 일치 구간을 찾았습니다.`,alignmentEvidence];
  const retrievalBonus=(intervalExact ? .05 : .25)*Math.min(20,hitCount),phraseScore=Number(selectedSpan?.phraseEvidence?.score??50),phraseAdjustment=selectedSpan?Math.max(-8,Math.min(4,(phraseScore-65)*.12)):0;
  best.set(id,{kind:exact?'exact':'similar',ranking:clamp(local+retrievalBonus+phraseAdjustment),localSimilarity:clamp(local),occurrenceImportance:clamp(55+row.role*35),scores:{...scores,meter:Math.round(metric.score),structural:Math.round(structural.similarity),phrase:Math.round(phraseScore)},startMeasure:m0,startBeat:first.b,endMeasure:m1,alignment,why:[...why,selectedSpan?`쉼표·새 attack·타이 종결을 비교한 프레이즈 문맥 일치도는 ${Math.round(phraseScore)}점입니다.`:'프레이즈 문맥은 유사 정렬 구간의 보조 근거로만 사용했습니다.',metric.matches?`Query의 중요 박과 후보 downbeat가 ${metric.matches}곳에서 선율적으로 일치합니다.`:'Query의 중요 박과 대응하는 downbeat 일치가 없어 순위를 보정했습니다.',structural.bonus>0?`경과음·보조음을 축약한 기둥선 ${structural.queryPillars}음과 후보 ${structural.candidatePillars}음이 ${Math.round(structural.similarity)}점으로 일치했습니다.`:'기둥선 차이는 큰 벌점으로 사용하지 않았습니다.'],work:{workId:id,sourceId:row.source,streamId:row.stream_id,title:row.title,artist:row.composer||'Unknown',year:'',genre:'MusicXML',accent:'#52736a',notes:excerpt,melodyRoleScore:row.role,roleConfidence:row.role,analysisConfidence:.72,prominence:.65,youtubeId:youtubeId(yt,id,row.title)}});
 }
 const list=[...best.values()].sort((a,b)=>b.ranking-a.ranking).slice(0,limit);
 for(const item of list){
  item.work.artist=displayComposer(item.work.artist);item.work.keyFifths=sourceKey(item.work.sourceId);
  const originalStart=item.startMeasure,clef=sourceClef(item.work.sourceId,item.work.streamId,originalStart,item.work.notes),meter=sourceMeter(item.work.sourceId,item.work.streamId,originalStart),basePartName=sourcePartName(item.work.sourceId,item.work.streamId),partName=item.work.streamId.endsWith(':structural')?`${basePartName} · structural melody`:basePartName,labels=sourceMeasures(item.work.sourceId,item.work.streamId),label=n=>labels.find(x=>x.ordinal===n)?.label??String(n);
  item.work.clefShape=clef.shape;item.work.clefLine=clef.line;item.work.meter=`${meter.count}/${meter.unit}`;item.work.partName=partName;item.work.genre=`MusicXML · ${partName}`;
  item.startMeasure=displayMeasure(label(item.startMeasure));item.endMeasure=displayMeasure(label(item.endMeasure));
  for(const note of item.work.notes){note.measure=displayMeasure(label(note.measure));note.clefShape=clef.shape;note.clefLine=clef.line;note.meterCount=meter.count;note.meterUnit=meter.unit;note.partName=partName;note.keyFifths=item.work.keyFifths}
 }
 return{exact:list.filter(x=>x.kind==='exact'),similar:list.filter(x=>x.kind==='similar')};
}

export function getWork(id){
 const row=database().prepare('SELECT * FROM works WHERE id=?').get(id);if(!row)return null;
 const raw=JSON.parse(row.notes),notes=corpusNotes(row.id,raw),labels=sourceMeasures(row.source,row.stream_id),label=n=>labels.find(x=>x.ordinal===n)?.label??String(n),clef=sourceClef(row.source,row.stream_id,raw[0]?.m||1,notes),meter=sourceMeter(row.source,row.stream_id,raw[0]?.m||1),basePartName=sourcePartName(row.source,row.stream_id),partName=row.stream_id.endsWith(':structural')?`${basePartName} · structural melody`:basePartName,keyFifths=sourceKey(row.source),pitchNames=new Map(),durations=new Map(),motifs=new Map(),measures=new Map();
 for(const note of notes){note.measure=displayMeasure(label(note.measure));note.clefShape=clef.shape;note.clefLine=clef.line;note.meterCount=meter.count;note.meterUnit=meter.unit;note.partName=partName;note.keyFifths=keyFifths}
 for(const n of raw){pitchNames.set(n.s,(pitchNames.get(n.s)||0)+1);durations.set(n.d,(durations.get(n.d)||0)+1);measures.set(label(n.m),(measures.get(label(n.m))||0)+1)}
 for(let i=0;i<raw.length-3;i++){const motif=raw.slice(i,i+4).map((n,j,a)=>j?n.p-a[j-1].p:0).slice(1).join(',');motifs.set(motif,(motifs.get(motif)||0)+1)}
 const top=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([label,count])=>({label:String(label),count}));let xml='';try{xml=readFileSync(musicxmlRoot+row.source,'utf8')}catch{}const yt=cache();
 return{workId:row.id,streamId:row.stream_id,partName,title:row.title,artist:displayComposer(row.composer),sourceId:row.source,keyFifths,clefShape:clef.shape,clefLine:clef.line,meter:`${meter.count}/${meter.unit}`,youtubeId:youtubeId(yt,row.id,row.title),notes,xml,stats:{pitches:top(pitchNames),rhythms:top(durations),motifs:rankedMotifs(raw),structure:{measures:measures.size,notes:raw.length,peakMeasures:top(measures).slice(0,5)}}};
}

export function searchCatalog(text,limit=12){
 const query=String(text||'').trim();if(query.length<2)return[];const store=database(),hasFts=Boolean(store.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='works_fts'").get());let rows=[];
 if(hasFts){const terms=query.normalize('NFKC').split(/\s+/).filter(Boolean).map(term=>`"${term.replaceAll('"','""')}"*`).join(' AND ');try{rows=store.prepare('SELECT w.id,w.title,w.composer,w.source,w.stream_id,w.role,bm25(works_fts,0,5,4,3,2,1) rank FROM works_fts JOIN works w ON w.id=works_fts.id WHERE works_fts MATCH ? ORDER BY rank,w.role DESC LIMIT ?').all(terms,Math.max(limit*4,40))}catch{rows=[]}}
 if(!rows.length){const pattern=`%${query.toLocaleLowerCase('en-US').replace(/[\\%_]/g,value=>`\\${value}`)}%`;rows=store.prepare("SELECT id,title,composer,source,stream_id,role,0 rank FROM works WHERE lower(title) LIKE ? ESCAPE '\\' OR lower(normalized_title) LIKE ? ESCAPE '\\' OR lower(composer) LIKE ? ESCAPE '\\' OR lower(source) LIKE ? ESCAPE '\\' ORDER BY role DESC,title LIMIT ?").all(pattern,pattern,pattern,pattern,Math.max(limit*4,40))}
 const seen=new Set(),items=[];for(const row of rows){const key=normalizeYoutubeTitle(row.title);if(seen.has(key))continue;seen.add(key);items.push({workId:row.id,title:row.title,composer:displayComposer(row.composer||''),source:row.source,partName:sourcePartName(row.source,row.stream_id)});if(items.length>=limit)break}return items;
}

export function searchApiPlugin(){return{name:'musicanote-search-api',configureServer(server){server.middlewares.use('/api/search/v2/melody',(req,res)=>{if(req.method!=='POST'){res.statusCode=405;return res.end()}let body='';req.on('data',x=>body+=x);req.on('end',()=>{try{if(!existsSync(dbPath))throw new Error('Search index is not built. Run pnpm index:sqlite.');res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(searchDatabase(JSON.parse(body).query,JSON.parse(body).limit||20)))}catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}))}})})}}}
export function workApiPlugin(){return{name:'musicanote-work-api',configureServer(server){server.middlewares.use('/api/work/',(req,res)=>{const id=decodeURIComponent((req.url||'').split('?')[0].replace(/^\//,'')),work=getWork(id);res.setHeader('Content-Type','application/json; charset=utf-8');if(!work){res.statusCode=404;return res.end(JSON.stringify({error:'Work not found'}))}res.end(JSON.stringify(work))})}}}
let youtubeWorker=null;
export function youtubeBackfillPlugin(){return{name:'musicanote-youtube-backfill',configureServer(server){server.middlewares.use('/api/youtube/backfill/start',(req,res)=>{res.setHeader('Content-Type','application/json; charset=utf-8');if(req.method!=='POST'){res.statusCode=405;return res.end(JSON.stringify({error:'Method not allowed'}))}let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{let title='';try{title=JSON.parse(body||'{}').title||''}catch{}const configured=Boolean(process.env.YOUTUBE_API_KEY);if(!configured)return res.end(JSON.stringify({started:false,configured:false,reason:'YOUTUBE_API_KEY is not set'}));if(youtubeWorker&&!youtubeWorker.killed)return res.end(JSON.stringify({started:false,configured:true,running:true}));const script=fileURLToPath(new URL('../scripts/youtube-backfill.mjs',import.meta.url)),args=[script];if(title)args.push('--priority-title',title);youtubeWorker=spawn(process.execPath,args,{cwd:fileURLToPath(new URL('..',import.meta.url)),env:process.env,stdio:'ignore',windowsHide:true});youtubeWorker.once('exit',()=>{youtubeWorker=null});res.end(JSON.stringify({started:true,configured:true,running:true,priorityTitle:title||null}))})})}}}
export function catalogSearchPlugin(){return{name:'musicanote-catalog-search',configureServer(server){server.middlewares.use('/api/catalog/search',(req,res)=>{res.setHeader('Content-Type','application/json; charset=utf-8');if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({error:'Method not allowed'}))}try{const url=new URL(req.url||'','http://localhost'),query=url.searchParams.get('q')||'';res.end(JSON.stringify({items:searchCatalog(query)}))}catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}))}})}}}
