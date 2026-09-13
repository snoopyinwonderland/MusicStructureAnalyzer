// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pause, Play, Search } from 'lucide-react';
import type { CorpusNote, MatchResult, Query, QueryEvent } from '../types';
import { collapseTies, featureVector } from '../search/features';
import { pitchName } from '../music/pitch';
import { schedulePhrase, type ScheduledPlayback } from '../music/audioPlayback';
import { FullXmlNotation, type MotifSpanMarker, type PhraseSpanMarker } from './FullXmlNotation';
import { SearchExcerpt } from './SearchExcerpt';
import { Notation } from './Notation';

type Stat = { label: string; count: number; score?: number };
type PhraseCue = { name: string; strength: number; evidence?: Record<string, unknown> };
type PhraseBoundary = { index: number; strength: number; supported: boolean; reliable: boolean; state: 'boundary'|'continuous'|'unknown'; continuity: number; cues: PhraseCue[] };
type MotifRelation={length:number;signatureKey:string;previousIndex:number;currentIndex:number;distanceInAttacks:number;closeContinuation:boolean};
type MotifCell={startIndex:number;endIndex:number;attackCount:number;rhythmFamily:string;rhythmVariant:string;normalizedPickupDurations?:number[];terminalDurationRatio?:number};
type PhraseAnalysis = { version: string; calibrated: false; label: string; boundaries: PhraseBoundary[]; motifRelations?:MotifRelation[]; motifCells?:MotifCell[] };
type BoundaryHarmonyRecord={boundaryIndex:number;harmonyProgression:{display:string;romanDisplay?:string;preparationRoman?:string|null;arrivalRoman?:string|null;afterBoundaryRoman?:string|null};selectedKey?:{label:string;score:number}|null;selectedCadence?:{type:string;strength:number}|null;cadenceHypotheses?:Array<{type:string;strength:number;against?:string[]}>;status:string};
type BoundaryHarmonyAnalysis={version:string;calibrated:false;scope:string;records:BoundaryHarmonyRecord[];limitations:string[]};
type Work = { workId: string; sourceId?: string; streamId: string; partName: string; title: string; artist?: string; youtubeId?: string; xml: string; notes: CorpusNote[]; stats: any; phraseAnalysis?: PhraseAnalysis; boundaryHarmony?:BoundaryHarmonyAnalysis; accessPolicy?: string; fullScoreAvailable?: boolean; restrictedPreviewActive?: boolean; previewOrdinalStart?: number; keyFifths?: number; clefShape?: 'G'|'F'|'C'; clefLine?: number; meter?: string };
type StoredState = { events?: QueryEvent[]; results?: { exact?: MatchResult[]; similar?: MatchResult[] } };

const Bars = ({ title, items }: { title: string; items: Stat[] }) => <section className="analysis-block"><h3>{title}</h3>{items.map((item, index) => <div className="stat-row" key={item.label}><span>{index + 1}. {item.label}</span><i style={{ width: `${100 * (item.score ?? item.count) / (items[0]?.score ?? items[0]?.count ?? 1)}%` }} /><b>{item.count}</b></div>)}</section>;

function resultHref(result:MatchResult){
  const targets=result.alignment.filter(step=>step.candidateIndex!==null&&step.type!=='insertion').map(step=>result.work.notes[step.candidateIndex!]).filter(Boolean).map(note=>`${note.onset}:${note.pitchMidi}`).join(',');
  const query=new URLSearchParams({workId:result.work.workId,start:String(result.startMeasure),end:String(result.endMeasure),source:'search'});if(targets)query.set('targets',targets);return `/score?${query}`;
}

export function motifSearchEstimate(noteCount:number,learned?:number|null){
  const fallback=Math.min(45,18+Math.max(0,noteCount)*.7),value=Number(learned);
  return Math.ceil(Math.min(120,Math.max(2,Number.isFinite(value)&&value>0?value:fallback)));
}

const motifEtaKey=(noteCount:number)=>`musicanote-search-eta:melody_rhythm:${noteCount<8?'short':noteCount<16?'medium':'long'}:corpus`;

function MotifCard({motif,work}:{motif:any;work:Work}){
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[results,setResults]=useState<MatchResult[]>([]),[error,setError]=useState('');
  const query=useMemo<Query>(()=>({version:1,mode:'melody_rhythm',meter:work.meter||'4/4',startsOnDownbeat:false,keyFifths:work.keyFifths,clefShape:work.clefShape,clefLine:work.clefLine,partName:work.partName,events:motif.events||[]}),[motif,work]);
  const noteCount=(motif.events||[]).filter((event:QueryEvent)=>event.kind==='note').length,etaKey=motifEtaKey(noteCount);
  const [estimatedSeconds,setEstimatedSeconds]=useState(()=>motifSearchEstimate(noteCount,typeof localStorage==='undefined'?null:Number(localStorage.getItem(etaKey)))),[remainingSeconds,setRemainingSeconds]=useState<number|null>(null);
  const countdown=useRef<number|null>(null);
  useEffect(()=>()=>{if(countdown.current!==null)clearInterval(countdown.current)},[]);
  const search=async()=>{if(open){setOpen(false);return}setOpen(true);if(results.length||loading)return;const started=performance.now(),estimate=estimatedSeconds;setRemainingSeconds(estimate);countdown.current=window.setInterval(()=>setRemainingSeconds(Math.max(0,Math.ceil(estimate-(performance.now()-started)/1000))),250);setLoading(true);setError('');try{const effectiveQuery={...query,excludeWorkIds:[work.workId],excludeTitle:work.title},response=await fetch('/api/search/v2/melody',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:effectiveQuery,limit:24})}),data=await response.json();if(!response.ok)throw new Error(data.error||'Search failed');setResults([...(data.exact||[]),...(data.similar||[])].slice(0,6))}catch(reason){setError(reason instanceof Error?reason.message:'검색에 실패했습니다.')}finally{const actual=Math.max(1,(performance.now()-started)/1000),learned=Math.max(2,Math.min(120,.65*estimate+.35*actual));localStorage.setItem(etaKey,learned.toFixed(1));setEstimatedSeconds(motifSearchEstimate(noteCount,learned));if(countdown.current!==null)clearInterval(countdown.current);countdown.current=null;setRemainingSeconds(null);setLoading(false)}};
  return <article className="motif-card"><div className="motif-card-head"><div><b>{motif.label}</b><span>{motif.count}회 · m.{motif.startMeasure}{motif.endMeasure!==motif.startMeasure?`–${motif.endMeasure}`:''}</span></div><div className="motif-search-action"><small>{loading?(remainingSeconds===0?'검색 결과 정리 중…':`검색 중 · 약 ${remainingSeconds??estimatedSeconds}초 남음`):`예상 검색 시간 · 약 ${estimatedSeconds}초`}</small><button type="button" onClick={search}><Search/>{open?'닫기':'비슷한 Motif'}</button></div></div><Notation query={query}/>{open&&<div className="motif-similar-results">{loading&&<p>현재 악보와 같은 제목의 판본을 제외하고 검색하는 중…</p>}{error&&<p className="motif-error">{error}</p>}{!loading&&!error&&!results.length&&<p>다른 작품에서 충분히 비슷한 motif를 찾지 못했습니다.</p>}{results.map((result,index)=><a href={resultHref(result)} key={result.work.workId+`-${index}`}><span>{index+1}</span><div><b>{result.work.title}</b><small>{result.work.artist} · {result.work.partName||result.work.streamId} · m.{result.startMeasure}–{result.endMeasure}</small></div><strong>{Math.round(result.ranking??result.localSimilarity)}%</strong></a>)}</div>}</article>
}

const MotifAnalysis=({work}:{work:Work})=><section className="analysis-block motif-analysis"><h3>주요 Motif</h3><p>반복·길이·음가를 함께 고려한 후보입니다. 악보 아래 버튼으로 다른 작품의 유사 구간을 찾을 수 있습니다.</p>{(work.stats.motifs||[]).map((motif:any)=><MotifCard key={motif.id||motif.label} motif={motif} work={work}/>)}</section>;
const restored = (): StoredState => { try { return JSON.parse(sessionStorage.getItem('musicanote-search-state') || '{}') } catch { return {} } };
const same = (a: number | undefined, b: number | undefined) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a! - b!) < 1e-6;

function storedTargets(id: string, start: number, end: number) {
  const state = restored(), results = [...(state.results?.exact || []), ...(state.results?.similar || [])];
  const match = results.find(item => item.work.workId === id && Number(item.startMeasure) === start && Number(item.endMeasure) === end);
  if (!match) return [];
  return match.alignment.filter(step => step.candidateIndex !== null && step.type !== 'insertion').map(step => match.work.notes[step.candidateIndex!]).filter(Boolean);
}

function locate(work: Work, start: number, end: number, encoded: string | null) {
  const requested = encoded ? encoded.split(',').map(value => { const [onset, pitchMidi] = value.split(':').map(Number); return { onset, pitchMidi } }) : storedTargets(work.workId, start, end);
  if (requested.length) {
    const found: CorpusNote[] = [], used = new Set<number>();
    for (const target of requested) {
      const index = work.notes.findIndex((note, noteIndex) => !used.has(noteIndex) && note.pitchMidi === target.pitchMidi && same(note.onset, target.onset));
      if (index >= 0) { used.add(index); found.push(work.notes[index]) }
    }
    if (found.length === requested.length) return found;
  }
  const state = restored(), query = collapseTies(state.events || []).filter(note => note.kind === 'note'), pool = work.notes.filter(note => Number(note.measure) >= start && Number(note.measure) <= end);
  if (!query.length) return pool;
  let best = pool.slice(0, query.length), bestCost = Infinity;
  for (let offset = 0; offset <= pool.length - query.length; offset++) {
    const candidate = pool.slice(offset, offset + query.length); let cost = 0;
    for (let index = 1; index < query.length; index++) {
      const queryInterval = query[index].pitchMidi! - query[index - 1].pitchMidi!, candidateInterval = candidate[index].pitchMidi - candidate[index - 1].pitchMidi;
      cost += (Math.sign(queryInterval) === Math.sign(candidateInterval) ? 0 : 8) + Math.abs(Math.abs(queryInterval) - Math.abs(candidateInterval));
    }
    if (cost < bestCost) { bestCost = cost; best = candidate }
  }
  return best;
}

export function playbackMatchRange(playbackNotes:CorpusNote[],matches:CorpusNote[]){
  const indexes=matches.map(match=>playbackNotes.findIndex(note=>note.pitchMidi===match.pitchMidi&&same(note.onset,match.onset))).filter(index=>index>=0);
  return indexes.length?{first:Math.min(...indexes),last:Math.max(...indexes)}:null;
}

export function jumpByMeasures(playbackNotes:CorpusNote[],position:number,delta:number){
  if(!playbackNotes.length)return 0;
  const measureKey=(note:CorpusNote)=>Number(note.measureOrdinal??note.measure);
  const measures=[...new Set(playbackNotes.map(measureKey).filter(Number.isFinite))].sort((a,b)=>a-b);
  const current=measureKey(playbackNotes[Math.max(0,Math.min(playbackNotes.length-1,position))]),currentIndex=Math.max(0,measures.indexOf(current));
  const target=measures[Math.max(0,Math.min(measures.length-1,currentIndex+delta))];
  const index=playbackNotes.findIndex(note=>measureKey(note)===target);
  return index>=0?index:position;
}

export function buildPhraseSpans(notes:CorpusNote[],boundaries:PhraseBoundary[]):PhraseSpanMarker[]{
  if(!notes.length)return[];
  const internal=[...new Set(boundaries.filter(boundary=>boundary.supported&&boundary.index>0&&boundary.index<notes.length-1).map(boundary=>boundary.index))].sort((a,b)=>a-b),starts=[0,...internal];
  const shownPitch=(note:CorpusNote)=>note.spelling||pitchName(note.pitchMidi);
  return starts.map((startIndex,index)=>{const nextStartIndex=starts[index+1],endIndex=(nextStartIndex??notes.length)-1,startNote=notes[startIndex],endNote=notes[endIndex],nextStartNote=nextStartIndex===undefined?null:notes[nextStartIndex],nextMeasure=Number(nextStartNote?.measure),nextBeat=Number(nextStartNote?.beat),endMeasure=nextStartNote&&Number.isFinite(nextMeasure)&&Number.isFinite(nextBeat)&&nextBeat<=1+1e-6&&nextMeasure>Number(startNote.measure)?nextMeasure-1:Number(endNote.measure);return{phraseNumber:index+1,startIndex,endIndex,startNote,endNote,sharedStart:false,sharedEnd:false,startMeasure:Number(startNote.measure),endMeasure,startPitch:shownPitch(startNote),endPitch:shownPitch(endNote),startDisplay:notePitchAndValue(startNote),endDisplay:notePitchAndValue(endNote)}});
}

export function noteValueLabel(note:CorpusNote){
  const duration=Number(note.durationRatio),names:Array<[number,string]>=[[.25,'16분음표'],[.5,'8분음표'],[.75,'점8분음표'],[1,'4분음표'],[1.5,'점4분음표'],[2,'2분음표'],[3,'점2분음표'],[4,'온음표']],matched=names.find(([value])=>Math.abs(duration-value)<1e-6)?.[1];
  const base=matched||`${Number.isFinite(duration)?duration:'?'}박`,tied=Number(note.tieEndMeasure)>Number(note.measure);
  return tied?`${base}·타이 지속`:base;
}

export function notePitchAndValue(note:CorpusNote){return `${note.spelling||pitchName(note.pitchMidi)}(${noteValueLabel(note)})`}

export function phraseRangeLabel(span:PhraseSpanMarker){
  const measures=span.startMeasure===span.endMeasure?`${span.startMeasure}마디`:`${span.startMeasure}–${span.endMeasure}마디`;
  return `Phrase ${span.phraseNumber} · ${measures} · ${span.startDisplay||span.startPitch} → ${span.endDisplay||span.endPitch}`;
}

export function motifSimilarityEvidence(left:CorpusNote[],right:CorpusNote[]){
  const a=featureVector(left),b=featureVector(right),mean=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0,numberScore=(x:number[],y:number[],scale:number)=>100-mean(x.slice(0,Math.min(x.length,y.length)).map((value,index)=>Math.min(100,Math.abs(value-y[index])*scale))),interval=Math.max(0,numberScore(a.intervals,b.intervals,14)),contour=100-mean(a.contour.slice(0,Math.min(a.contour.length,b.contour.length)).map((value,index)=>value===b.contour[index]?0:100)),rhythm=Math.max(0,numberScore(a.durations,b.durations,45)),coverage=100*Math.min(left.length,right.length)/Math.max(1,left.length,right.length),similarity=.45*interval+.25*contour+.2*rhythm+.1*coverage;
  return{similarity:Math.round(similarity),interval:Math.round(interval),contour:Math.round(contour),rhythm:Math.round(rhythm),coverage:Math.round(coverage)};
}

export function buildMotifSpans(notes:CorpusNote[],relations:MotifRelation[]=[],phraseSpans:PhraseSpanMarker[]=[],motifCells:MotifCell[]=[]):MotifSpanMarker[]{
  type Candidate={startIndex:number;endIndex:number;priority:number;source:'relation'|'cycle'|'projected'|'parallel-cell'|'rhythmic-theme-cell';familyKey?:string;variantKey?:string};
  const candidates=new Map<number,Candidate>();
  const add=(candidate:Candidate)=>{const prior=candidates.get(candidate.startIndex);if(!prior||candidate.priority>prior.priority)candidates.set(candidate.startIndex,candidate)};
  const cycleEnd=(start:number,exclusiveOnset:number)=>{let end:number|null=null;for(let index=start;index<notes.length;index++){const note=notes[index];if(Number(note.onset)>=exclusiveOnset)break;if(note?.isAttack!==false&&!note?.tieStop)end=index}return end};
  const attackEnd=(start:number,length:number)=>{let remaining=length,end=start;for(let index=start;index<notes.length&&remaining>0;index++){const note=notes[index];if(note?.isAttack!==false&&!note?.tieStop){remaining--;end=index}}return remaining===0?end:null};
  const attackCount=(candidate:Candidate)=>notes.slice(candidate.startIndex,candidate.endIndex+1).filter(note=>note.isAttack!==false&&!note.tieStop).length;
  for(const cell of motifCells){if(cell.startIndex>=0&&cell.endIndex>=cell.startIndex&&cell.endIndex<notes.length)add({startIndex:cell.startIndex,endIndex:cell.endIndex,priority:6,source:'rhythmic-theme-cell',familyKey:cell.rhythmFamily,variantKey:cell.rhythmVariant})}
  const validRelations=relations.filter(relation=>relation.signatureKey);
  for(const relation of validRelations.filter(relation=>relation.closeContinuation)){
    const previousOnset=Number(notes[relation.previousIndex]?.onset),currentOnset=Number(notes[relation.currentIndex]?.onset),cycleDuration=currentOnset-previousOnset;
    if(!Number.isFinite(cycleDuration)||cycleDuration<=0)continue;
    for(const [startIndex,exclusiveOnset] of [[relation.previousIndex,currentOnset],[relation.currentIndex,currentOnset+cycleDuration]] as const){
      const endIndex=cycleEnd(startIndex,exclusiveOnset);if(endIndex!==null)add({startIndex,endIndex,priority:4,source:'cycle'});
    }
  }
  for(const relation of validRelations){
    const prototype=candidates.get(relation.previousIndex),length=prototype?attackCount(prototype):relation.length,priority=prototype?3:1;
    if(!prototype){const endIndex=attackEnd(relation.previousIndex,relation.length);if(endIndex!==null)add({startIndex:relation.previousIndex,endIndex,priority:1,source:'relation'})}
    const endIndex=attackEnd(relation.currentIndex,length);if(endIndex!==null)add({startIndex:relation.currentIndex,endIndex,priority,source:prototype?'projected':'relation'});
  }
  const byDisplacement=new Map<number,MotifRelation[]>();for(const relation of validRelations){const displacement=relation.currentIndex-relation.previousIndex,items=byDisplacement.get(displacement)||[];items.push(relation);byDisplacement.set(displacement,items)}
  for(const [displacement,items] of byDisplacement){items.sort((a,b)=>a.previousIndex-b.previousIndex);for(let index=1;index<items.length;index++){
    const left=items[index-1],right=items[index],cellDistance=right.previousIndex-left.previousIndex;if(cellDistance<=0||right.currentIndex-left.currentIndex!==cellDistance||cellDistance>Math.max(left.length,right.length)*2)continue;
    for(const [start,exclusive] of [[left.previousIndex,right.previousIndex],[left.currentIndex,right.currentIndex]] as const){const endIndex=cycleEnd(start,Number(notes[exclusive]?.onset));if(endIndex!==null)add({startIndex:start,endIndex,priority:5,source:'parallel-cell'})}
    const establishedPrototype=candidates.get(right.previousIndex),cellLength=establishedPrototype?.source==='cycle'?attackCount(establishedPrototype):Math.max(left.length,right.length);
    for(const start of [right.previousIndex,right.currentIndex]){const endIndex=attackEnd(start,cellLength);if(endIndex!==null)add({startIndex:start,endIndex,priority:5,source:'parallel-cell'})}
  }}
  const recurrent=[...candidates.values()].sort((a,b)=>a.startIndex-b.startIndex||a.endIndex-b.endIndex);
  const families:Array<{number:number;base:Candidate;variants:Candidate[];familyKey?:string}>=[];
  return recurrent.map((candidate,motifNumber)=>{
    const segment=notes.slice(candidate.startIndex,candidate.endIndex+1);let family=candidate.familyKey?families.find(item=>item.familyKey===candidate.familyKey):families.map(item=>({item,evidence:motifSimilarityEvidence(notes.slice(item.base.startIndex,item.base.endIndex+1),segment)})).filter(match=>match.evidence.similarity>=80).sort((a,b)=>b.evidence.similarity-a.evidence.similarity)[0]?.item;
    if(!family){family={number:families.length+1,base:candidate,variants:[candidate],familyKey:candidate.familyKey};families.push(family)}
    let variantIndex=candidate.variantKey?family.variants.findIndex(variant=>variant.variantKey===candidate.variantKey):family.variants.findIndex(variant=>{const evidence=motifSimilarityEvidence(notes.slice(variant.startIndex,variant.endIndex+1),segment);return evidence.interval>=99&&evidence.contour>=99&&evidence.coverage>=98});if(variantIndex<0){variantIndex=family.variants.length;family.variants.push(candidate)}
    const similarity=motifSimilarityEvidence(notes.slice(family.base.startIndex,family.base.endIndex+1),segment),label=`Motif ${family.number}${'′'.repeat(variantIndex)}`;
    return{motifNumber:motifNumber+1,familyNumber:family.number,variantIndex,label,startIndex:candidate.startIndex,endIndex:candidate.endIndex,startNote:notes[candidate.startIndex],endNote:notes[candidate.endIndex],similarity};
  });
}

export const usesCampaniaAnalysisFont=(value:string|undefined|null)=>Boolean(value&&value.trim().toLowerCase()!=='unknown');
const campaniaValue=(value:string|undefined|null,fallback='판정 보류')=>!value?fallback:usesCampaniaAnalysisFont(value)?<span className="campania-analysis-value">{value}</span>:<span>{value}</span>;

export function harmonyRomanParts(record?:BoundaryHarmonyRecord){
  const progression=record?.harmonyProgression;
  if(!progression)return{preparation:null,arrival:null,afterBoundary:null};
  if(progression.preparationRoman||progression.arrivalRoman||progression.afterBoundaryRoman)return{preparation:progression.preparationRoman||null,arrival:progression.arrivalRoman||null,afterBoundary:progression.afterBoundaryRoman||null};
  const [before='',after='']=(progression.romanDisplay||'').split('|').map(value=>value.trim()),parts=before.split('→').map(value=>value.trim()).filter(Boolean);
  return{preparation:parts.length>1?parts[0]:null,arrival:parts.at(-1)||null,afterBoundary:after||null};
}

export function phraseEndingBoundaryIndex(phraseNumber:number,boundaries:PhraseBoundary[]){
  return boundaries.filter(boundary=>boundary.supported)[phraseNumber-1]?.index??null;
}

const cueNames:Record<string,string>={
  'observed-gap':'실제 시간 공백','pitch-discontinuity':'음정 도약 변화','ioi-discontinuity':'리듬 간격 변화','repeated-motif-start':'반복 모티프 시작','observed-continuity':'시간적 연속','tie-continuation':'타이 지속','repeated-passage-internal-continuation':'반복 구간 내부 연속성','thematic-cell-internal-continuation':'주제 Motif 내부 연속성','thematic-cell-phrase-restart':'주제 Motif 재시작',
};

function MotifReviewPanel({span}:{span:MotifSpanMarker}){
  const measures=Number(span.startNote.measure)===Number(span.endNote.measure)?`${span.startNote.measure}마디`:`${span.startNote.measure}–${span.endNote.measure}마디`,start=notePitchAndValue(span.startNote),end=notePitchAndValue(span.endNote);
  return <section className="phrase-review motif-review analysis-block"><div className="phrase-review-head"><div><h3>{span.label} 상세</h3><p>Motif Analysis Layer 후보 · Phrase와 별도</p></div><span>{span.variantIndex?'변형/재등장':'기준형'}</span></div><div className="phrase-selected-range"><strong>{span.label} · {measures}</strong><dl><div><dt>시작음</dt><dd>{start}</dd></div><div><dt>마지막 음</dt><dd>{end}</dd></div><div><dt>가족 기준 유사도</dt><dd>{span.similarity.similarity}/100</dd></div><div><dt>음정 진행</dt><dd>{span.similarity.interval}/100</dd></div><div><dt>윤곽</dt><dd>{span.similarity.contour}/100</dd></div><div><dt>리듬</dt><dd>{span.similarity.rhythm}/100</dd></div></dl><p>조옮김에 무관한 음정·윤곽과 정규화된 음가를 음악 검색과 같은 계열의 증거로 비교했습니다. 점수는 미보정 유사도이며 확정 Motif 판정이 아닙니다.</p></div></section>;
}

function PhraseReviewPanel({work,boundaryIndex,onSelect}:{work:Work;boundaryIndex:number|null;onSelect:(index:number)=>void}){
  const [comment,setComment]=useState(''),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
  const candidates=(work.phraseAnalysis?.boundaries||[]).filter(boundary=>boundary.supported),spans=buildPhraseSpans(work.notes,candidates),boundary=boundaryIndex===null?null:work.phraseAnalysis?.boundaries[boundaryIndex]||null,note=boundary?work.notes[boundary.index]:null,boundaryOrder=candidates.findIndex(candidate=>candidate.index===boundaryIndex),phrase=boundaryOrder>=0?spans[boundaryOrder]:null,nextPhrase=boundaryOrder>=0?spans[boundaryOrder+1]:null,harmony=work.boundaryHarmony?.records.find(record=>record.boundaryIndex===boundaryIndex),cadence=harmony?.selectedCadence;
  useEffect(()=>{setComment('');setMessage('')},[work.workId,boundaryIndex]);
  const save=async(verdict:'accepted'|'rejected'|'ambiguous')=>{if(!boundary||!note)return;setSaving(true);setMessage('');try{const response=await fetch('/api/analysis/phrase-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workId:work.workId,sourceId:work.sourceId,streamId:work.streamId,analyzerVersion:work.phraseAnalysis?.version,boundaryIndex:boundary.index,noteId:note.id,onset:note.onset,measure:note.measure,measureOrdinal:note.measureOrdinal,beat:note.beat,verdict,comment,candidate:{strength:boundary.strength,state:boundary.state,cues:boundary.cues},analysisContext:{boundaryHarmony:harmony||null}})}),data=await response.json();if(!response.ok)throw new Error(data.error||'저장 실패');setMessage('리뷰를 별도 Annotation 데이터로 저장했습니다.')}catch(error){setMessage(error instanceof Error?error.message:'저장 실패')}finally{setSaving(false)}};
  const roman=harmonyRomanParts(harmony);
  const cadenceSummary=(index:number)=>{const record=work.boundaryHarmony?.records.find(item=>item.boundaryIndex===candidates[index]?.index);return record?.selectedCadence?.type||'Cadence 보류'};
  return <section className="phrase-review analysis-block"><div className="phrase-review-head"><div><h3>Phrase 구간 검토</h3><p>자동 추정 구간 {spans.length}개 · 경계 후보 {candidates.length}개</p></div><span>{work.boundaryHarmony?'경계 화성 v0.2':'화성 분석 대기'}</span></div><p className="phrase-range-legend">색 띠 하나가 한 Phrase입니다. 점선 보라색 띠는 Phrase와 별개인 Motif 반복입니다. `P2 시작`은 P2 첫 음 직전의 경계입니다.</p>{!candidates.length?<p className="phrase-empty">현재 임계값을 넘는 경계 후보가 없습니다. 이것도 중요한 평가 결과입니다.</p>:<><label className="phrase-candidate-select">프레이즈<select value={boundaryIndex??''} onChange={event=>onSelect(Number(event.target.value))}>{candidates.map((candidate,index)=>{const summary=spans[index];return <option key={candidate.index} value={candidate.index}>{summary?`${phraseRangeLabel(summary)} · ${cadenceSummary(index)}`:`Phrase ${index+1}`}</option>})}{spans.length>candidates.length&&<option disabled>{phraseRangeLabel(spans.at(-1)!)} · 마지막 구간</option>}</select></label>{boundary&&note&&phrase&&<div className="phrase-evidence"><div className="phrase-selected-range"><strong>{phraseRangeLabel(phrase)}</strong><p>아래 화성은 Phrase의 시작부터 끝까지가 아니라, 이 Phrase가 끝나는 경계 주변의 진행입니다.</p><dl><div><dt>시작음</dt><dd>{phrase.startDisplay||phrase.startPitch}</dd></div><div><dt>마지막 음</dt><dd>{phrase.endDisplay||phrase.endPitch}</dd></div><div><dt>경계 직전 진행</dt><dd className="harmony-sequence">{roman.preparation&&campaniaValue(roman.preparation)}{roman.preparation&&roman.arrival&&<i>→</i>}{campaniaValue(roman.arrival)}</dd></div><div><dt>종결 화음</dt><dd>{campaniaValue(roman.arrival)}</dd></div><div><dt>다음 Phrase 시작</dt><dd>{campaniaValue(roman.afterBoundary)}</dd></div></dl>{nextPhrase&&<p>다음 구간: {phraseRangeLabel(nextPhrase)}</p>}</div>{harmony&&<div className="boundary-harmony-summary"><div><span>조성 후보</span><strong>{harmony.selectedKey?.label||'판정 보류'}</strong></div><div><span>Cadence 후보</span><strong>{cadence?.type||'판정 보류'}</strong></div><small>{cadence?`근거 강도 ${Math.round(cadence.strength*100)} / 100 · 미보정`:'종지 문법을 확정할 근거가 부족합니다.'}</small></div>}<small className="phrase-boundary-coordinate">다음 Phrase 첫 음 직전 · {note.measure}마디 {note.beat}박</small><span>경계 증거 강도 {Math.round(boundary.strength*100)} / 100</span><ul>{boundary.cues.map((cue,index)=><li key={`${cue.name}-${index}`}><b>{cueNames[cue.name]||cue.name}</b><em>{Math.round(cue.strength*100)}</em></li>)}</ul><p>가사·대문자는 사용하지 않았습니다. 화성과 Cadence는 경계 전후의 제한된 창에서 만든 미보정 가설이며 확정 정답이 아닙니다.</p><textarea value={comment} onChange={event=>setComment(event.target.value)} placeholder="왜 맞거나 틀렸는지, 어느 방향으로 고쳐야 하는지 메모"/><div className="phrase-review-actions"><button type="button" disabled={saving} onClick={()=>save('accepted')}>경계 맞음</button><button type="button" disabled={saving} onClick={()=>save('rejected')}>경계 아님</button><button type="button" disabled={saving} onClick={()=>save('ambiguous')}>판단 보류<br/><small>Can't Judge</small></button></div>{message&&<output>{message}</output>}</div>}</>}</section>;
}

export function FullScorePage() {
  const params = new URLSearchParams(location.search), id = params.get('workId') || '', browse = params.get('browse') === '1', searchEntry=params.get('source')==='search', start = Number(params.get('start')), end = Number(params.get('end')), encodedTargets = params.get('targets');
  const [work, setWork] = useState<Work | null>(null), [playing, setPlaying] = useState(false), [activePlaybackIndex,setActivePlaybackIndex]=useState<number|null>(null), [playbackPosition,setPlaybackPosition]=useState(0), [renderedPlaybackRange,setRenderedPlaybackRange]=useState<{first:number|null;last:number|null;complete:boolean}>({first:null,last:null,complete:false}), [phraseEnabled,setPhraseEnabled]=useState(true),[selectedPhraseBoundary,setSelectedPhraseBoundary]=useState<number|null>(null),[selectedMotifNumber,setSelectedMotifNumber]=useState<number|null>(null),[flashingPhraseNumber,setFlashingPhraseNumber]=useState<number|null>(null),[phraseFlashToken,setPhraseFlashToken]=useState(0), timers = useRef<number[]>([]), playbackPositionManuallySet=useRef(false), playingRef=useRef(false),renderCompleteRef=useRef(false);
  const audio = useRef<ScheduledPlayback | null>(null);
  useEffect(() => { const controller=new AbortController(),query=new URLSearchParams({start:String(start),end:String(end)});if(encodedTargets)query.set('targets',encodedTargets);setWork(null);if(browse)window.scrollTo({top:0,behavior:'auto'});fetch(`/api/work/${encodeURIComponent(id)}?${query}`,{signal:controller.signal}).then(response => response.json()).then(setWork).catch(error=>{if(error?.name!=='AbortError')console.error('Score loading failed',error)});return()=>controller.abort() }, [id,start,end,encodedTargets,browse]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); audio.current?.stop() }, []);
  const matches = useMemo(() => work && !browse ? locate(work, start, end, encodedTargets) : [], [work, browse, start, end, encodedTargets]);
  const restricted=Boolean(work?.restrictedPreviewActive),ordinalOffset=Math.max(0,(work?.previewOrdinalStart||1)-1);
  const visibleNotes=useMemo(()=>{if(!work)return[];if(!restricted)return work.notes;const count=(work.xml.match(/<measure\b/g)||[]).length,first=work.previewOrdinalStart||1,last=first+Math.max(0,count-1);return work.notes.filter(note=>(note.measureOrdinal||0)>=first&&(note.measureOrdinal||0)<=last)},[work,restricted]);
  const playbackNotes=useMemo(()=>collapseTies(visibleNotes),[visibleNotes]);
  const supportedPhraseBoundaries=useMemo(()=>(work?.phraseAnalysis?.boundaries||[]).filter(boundary=>boundary.supported),[work]);
  const phraseMarkers=useMemo(()=>{if(!work)return[];const visible=new Set(visibleNotes);return supportedPhraseBoundaries.filter(boundary=>visible.has(work.notes[boundary.index])).map(boundary=>{const order=supportedPhraseBoundaries.indexOf(boundary);return{note:work.notes[boundary.index],boundaryIndex:boundary.index,strength:boundary.strength,beforePhrase:order+1,afterPhrase:order+2}})},[work,visibleNotes,supportedPhraseBoundaries]);
  const phraseSpans=useMemo(()=>buildPhraseSpans(visibleNotes,phraseMarkers.map(marker=>({index:visibleNotes.indexOf(marker.note),supported:true} as PhraseBoundary))),[visibleNotes,phraseMarkers]);
  const motifSpans=useMemo(()=>work&&!restricted?buildMotifSpans(work.notes,work.phraseAnalysis?.motifRelations||[],buildPhraseSpans(work.notes,supportedPhraseBoundaries),work.phraseAnalysis?.motifCells||[]):[],[work,restricted,supportedPhraseBoundaries]);
  const selectedMotif=motifSpans.find(span=>span.motifNumber===selectedMotifNumber)||null;
  useEffect(()=>{if(!phraseEnabled){setSelectedPhraseBoundary(null);setSelectedMotifNumber(null);return}if(selectedMotifNumber===null&&!supportedPhraseBoundaries.some(boundary=>boundary.index===selectedPhraseBoundary))setSelectedPhraseBoundary(supportedPhraseBoundaries[0]?.index??null)},[phraseEnabled,supportedPhraseBoundaries,selectedPhraseBoundary,selectedMotifNumber]);
  const flashPhrase=useCallback((phraseNumber:number)=>{setFlashingPhraseNumber(phraseNumber);setPhraseFlashToken(token=>token+1)},[]);
  const selectPhraseBoundary=useCallback((boundaryIndex:number)=>{setSelectedMotifNumber(null);setSelectedPhraseBoundary(boundaryIndex);const order=supportedPhraseBoundaries.findIndex(boundary=>boundary.index===boundaryIndex);if(order>=0)flashPhrase(order+1)},[supportedPhraseBoundaries,flashPhrase]);
  const selectPhrase=useCallback((phraseNumber:number)=>{setSelectedMotifNumber(null);flashPhrase(phraseNumber);const endingBoundaryIndex=phraseEndingBoundaryIndex(phraseNumber,supportedPhraseBoundaries);if(endingBoundaryIndex!==null)setSelectedPhraseBoundary(endingBoundaryIndex)},[supportedPhraseBoundaries,flashPhrase]);
  const selectMotif=useCallback((motifNumber:number)=>{setSelectedMotifNumber(motifNumber)},[]);
  const playbackMatch=useMemo(()=>searchEntry?playbackMatchRange(playbackNotes,matches):null,[searchEntry,playbackNotes,matches]);
  useEffect(()=>{playbackPositionManuallySet.current=false;renderCompleteRef.current=false;setPlaybackPosition(playbackMatch?.first??0);setRenderedPlaybackRange({first:null,last:null,complete:false})},[id,work?.streamId,playbackMatch?.first]);
  useEffect(()=>{playingRef.current=playing},[playing]);
  const updateRenderedPlaybackRange=useCallback((range:{first:number|null;last:number|null;complete:boolean})=>{renderCompleteRef.current=range.complete;setRenderedPlaybackRange(range);if(playbackPositionManuallySet.current||playingRef.current)return;if(range.complete)setPlaybackPosition(0);else if(searchEntry&&playbackMatch)setPlaybackPosition(playbackMatch.first);else if(range.first!==null)setPlaybackPosition(range.first)},[searchEntry,playbackMatch]);
  const stopPlayback=()=>{playingRef.current=false;timers.current.forEach(clearTimeout);timers.current=[];audio.current?.stop();audio.current=null};
  const beginPlayback = (from:number) => {
    stopPlayback();
    const safe=Math.max(0,Math.min(playbackNotes.length-1,from));
    const sounding=playbackNotes.slice(safe);if(!sounding.length)return;
    playingRef.current=true;setPlaying(true);setPlaybackPosition(safe);setActivePlaybackIndex(safe);let at=0;
    audio.current=schedulePhrase(sounding);
    sounding.forEach((note,index)=>{const absolute=safe+index;timers.current.push(window.setTimeout(()=>{setPlaybackPosition(absolute);setActivePlaybackIndex(absolute)},at+60));at+=625*note.durationRatio});
    timers.current.push(window.setTimeout(()=>{stopPlayback();setPlaying(false);setActivePlaybackIndex(null);setPlaybackPosition(renderCompleteRef.current?0:(playbackMatch?.first??safe))},at+100));
  };
  const play = () => {
    if(playing){stopPlayback();setPlaying(false);setActivePlaybackIndex(null);return}
    beginPlayback(playbackPosition);
  };
  const seek=(position:number)=>{playbackPositionManuallySet.current=true;const resume=playing;stopPlayback();setPlaying(false);setPlaybackPosition(position);setActivePlaybackIndex(position);if(resume)beginPlayback(position)};
  const jumpMeasure=(delta:number)=>seek(jumpByMeasures(playbackNotes,playbackPosition,delta));
  const scroll = () => {const target=document.querySelector('.score-main>.xml-score:not(.xml-excerpt) [data-target-start="true"]');if(!target)return;const rect=target.getBoundingClientRect(),offset=Math.max(110,window.innerHeight*.2);window.scrollTo({top:Math.max(0,window.scrollY+rect.top-offset),behavior:'smooth'})};
  const markerLeft=playbackMatch&&playbackNotes.length>1?100*playbackMatch.first/(playbackNotes.length-1):null,markerWidth=playbackMatch&&playbackNotes.length>1?Math.max(2,100*(playbackMatch.last-playbackMatch.first+1)/(playbackNotes.length-1)):0;
  return <main className="score-page">
    <div className="score-toolbar">
      <button className="back-button" onClick={() => history.back()}><ArrowLeft /> {browse?'카탈로그로 돌아가기':'검색 결과로 돌아가기'}</button>
      <span className="range-badge">{restricted?'검색 파트 제한 미리보기':browse?'전체 악보 탐색':work?.accessPolicy==='research-preview'?`테스트용 전체 악보 · 검색 일치 마디 ${start}–${end}`:`검색 일치 구간 · 마디 ${start}–${end}`}</span>
      <button type="button" className={`phrase-layer-toggle ${phraseEnabled?'active':''}`} aria-pressed={phraseEnabled} onClick={()=>setPhraseEnabled(value=>!value)}><i/>{phraseEnabled?'구조 분석 켜짐':'구조 분석 꺼짐'}</button>
      {work&&<div className="score-transport"><label title="드래그하여 재생 시작 위치 이동"><span>재생 위치{!renderedPlaybackRange.complete&&renderedPlaybackRange.first!==null?' · 렌더링 연동':''}</span><div className="score-range-wrap">{markerLeft!==null&&<i className="score-match-marker" style={{left:`${markerLeft}%`,width:`${markerWidth}%`}} title="검색 일치 구간" aria-label="검색 일치 구간"/>}<input type="range" min="0" max={Math.max(0,playbackNotes.length-1)} value={Math.min(playbackPosition,Math.max(0,playbackNotes.length-1))} onChange={event=>seek(Number(event.target.value))}/></div><b>{playbackNotes.length?`${playbackPosition+1}/${playbackNotes.length}`:'0/0'}</b><div className="measure-jumps" aria-label="마디 단위 재생 위치 이동">{[-5,-1,1,5].map(delta=><button type="button" key={delta} onClick={()=>jumpMeasure(delta)} disabled={!playbackNotes.length} title={`${Math.abs(delta)}마디 ${delta<0?'뒤로':'앞으로'}`}>{delta>0?`+${delta}`:delta}</button>)}</div></label><button className="score-play" onClick={play} disabled={!playbackNotes.length}>{playing ? <Pause /> : <Play />}{playing ? '정지' : '화면 악보 전체 재생'}</button></div>}
    </div>
    {work&&<div className="score-title"><h1>{work.title}</h1>{work.artist&&<p>{work.artist}</p>}</div>}
    {work && <div className="score-layout">
      <div className="score-main">
        {!browse&&<section className="match-locator" onClick={scroll} role="button" tabIndex={0}><div><b>{work.partName} · 검색에서 감지된 음표</b><span>{restricted?'검색된 파트만 제공되는 제한 미리보기':'원본 MusicXML 마디 · 클릭하여 상세 위치로 이동'}</span></div><SearchExcerpt workId={work.workId} start={start} end={end} targets={matches} /></section>}
        <FullXmlNotation xml={work.xml} start={start} end={end} targets={matches} playbackNotes={playbackNotes} activePlaybackIndex={activePlaybackIndex} onPlaybackRangeChange={updateRenderedPlaybackRange} streamId={work.streamId} autoScroll={!browse} measureOrdinalOffset={ordinalOffset} phraseMarkers={phraseMarkers} phraseSpans={phraseSpans} motifSpans={motifSpans} phraseVisible={phraseEnabled} motifVisible={phraseEnabled} selectedPhraseBoundary={selectedPhraseBoundary} selectedMotifNumber={selectedMotifNumber} onPhraseBoundarySelect={selectPhraseBoundary} onMotifSelect={selectMotif} flashingPhraseNumber={flashingPhraseNumber} phraseFlashToken={phraseFlashToken} onPhraseSelect={selectPhrase} />
      </div>
      <aside>
        {work.youtubeId ? <iframe src={`https://www.youtube-nocookie.com/embed/${work.youtubeId}`} title="대표 영상" allowFullScreen /> : <div className="video-placeholder">대표 YouTube 영상 수집 대기</div>}
        {phraseEnabled&&(selectedMotif?<MotifReviewPanel span={selectedMotif}/>:<PhraseReviewPanel work={work} boundaryIndex={selectedPhraseBoundary} onSelect={selectPhraseBoundary}/>)}
        <div className="score-summary"><h2>Analysis and Statistics</h2><p>{work.stats.structure.measures} measures · {work.stats.structure.notes} melody notes</p><Bars title="많이 사용된 음" items={work.stats.pitches} /><Bars title="리듬 통계 (beats)" items={work.stats.rhythms} /><MotifAnalysis work={work} /><Bars title="음표 밀도가 높은 마디" items={work.stats.structure.peakMeasures} /></div>
      </aside>
    </div>}
  </main>;
}
