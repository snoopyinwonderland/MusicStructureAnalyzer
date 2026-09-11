// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pause, Play, Search } from 'lucide-react';
import type { CorpusNote, MatchResult, Query, QueryEvent } from '../types';
import { collapseTies } from '../search/features';
import { pitchName } from '../music/pitch';
import { schedulePhrase, type ScheduledPlayback } from '../music/audioPlayback';
import { FullXmlNotation, type PhraseSpanMarker } from './FullXmlNotation';
import { SearchExcerpt } from './SearchExcerpt';
import { Notation } from './Notation';

type Stat = { label: string; count: number; score?: number };
type PhraseCue = { name: string; strength: number; evidence?: Record<string, unknown> };
type PhraseBoundary = { index: number; strength: number; supported: boolean; reliable: boolean; state: 'boundary'|'continuous'|'unknown'; continuity: number; cues: PhraseCue[] };
type PhraseAnalysis = { version: string; calibrated: false; label: string; boundaries: PhraseBoundary[] };
type BoundaryHarmonyRecord={boundaryIndex:number;harmonyProgression:{display:string};selectedKey?:{label:string;score:number}|null;selectedCadence?:{type:string;strength:number}|null;cadenceHypotheses?:Array<{type:string;strength:number;against?:string[]}>;status:string};
type BoundaryHarmonyAnalysis={version:string;calibrated:false;scope:string;records:BoundaryHarmonyRecord[];limitations:string[]};
type Work = { workId: string; sourceId?: string; streamId: string; partName: string; title: string; artist?: string; youtubeId?: string; xml: string; notes: CorpusNote[]; stats: any; phraseAnalysis?: PhraseAnalysis; boundaryHarmony?:BoundaryHarmonyAnalysis; accessPolicy?: string; fullScoreAvailable?: boolean; restrictedPreviewActive?: boolean; previewOrdinalStart?: number; keyFifths?: number; clefShape?: 'G'|'F'|'C'; clefLine?: number; meter?: string };
type StoredState = { events?: QueryEvent[]; results?: { exact?: MatchResult[]; similar?: MatchResult[] } };

const Bars = ({ title, items }: { title: string; items: Stat[] }) => <section className="analysis-block"><h3>{title}</h3>{items.map((item, index) => <div className="stat-row" key={item.label}><span>{index + 1}. {item.label}</span><i style={{ width: `${100 * (item.score ?? item.count) / (items[0]?.score ?? items[0]?.count ?? 1)}%` }} /><b>{item.count}</b></div>)}</section>;

function resultHref(result:MatchResult){
  const targets=result.alignment.filter(step=>step.candidateIndex!==null&&step.type!=='insertion').map(step=>result.work.notes[step.candidateIndex!]).filter(Boolean).map(note=>`${note.onset}:${note.pitchMidi}`).join(',');
  const query=new URLSearchParams({workId:result.work.workId,start:String(result.startMeasure),end:String(result.endMeasure),source:'search'});if(targets)query.set('targets',targets);return `/score?${query}`;
}

function MotifCard({motif,work}:{motif:any;work:Work}){
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[results,setResults]=useState<MatchResult[]>([]),[error,setError]=useState('');
  const query=useMemo<Query>(()=>({version:1,mode:'melody_rhythm',meter:work.meter||'4/4',startsOnDownbeat:false,keyFifths:work.keyFifths,clefShape:work.clefShape,clefLine:work.clefLine,partName:work.partName,events:motif.events||[]}),[motif,work]);
  const search=async()=>{if(open){setOpen(false);return}setOpen(true);if(results.length||loading)return;setLoading(true);setError('');try{const response=await fetch('/api/search/v2/melody',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,limit:24})}),data=await response.json();if(!response.ok)throw new Error(data.error||'Search failed');setResults([...(data.exact||[]),...(data.similar||[])].filter((item:MatchResult)=>item.work.workId!==work.workId).slice(0,6))}catch(reason){setError(reason instanceof Error?reason.message:'검색에 실패했습니다.')}finally{setLoading(false)}};
  return <article className="motif-card"><div className="motif-card-head"><div><b>{motif.label}</b><span>{motif.count}회 · m.{motif.startMeasure}{motif.endMeasure!==motif.startMeasure?`–${motif.endMeasure}`:''}</span></div><button type="button" onClick={search}><Search/>{open?'닫기':'비슷한 Motif'}</button></div><Notation query={query}/>{open&&<div className="motif-similar-results">{loading&&<p>유사 motif를 검색하는 중…</p>}{error&&<p className="motif-error">{error}</p>}{!loading&&!error&&!results.length&&<p>다른 작품에서 충분히 비슷한 motif를 찾지 못했습니다.</p>}{results.map((result,index)=><a href={resultHref(result)} key={result.work.workId+`-${index}`}><span>{index+1}</span><div><b>{result.work.title}</b><small>{result.work.artist} · {result.work.partName||result.work.streamId} · m.{result.startMeasure}–{result.endMeasure}</small></div><strong>{Math.round(result.ranking??result.localSimilarity)}%</strong></a>)}</div>}</article>
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
  return starts.map((startIndex,index)=>{const nextStartIndex=starts[index+1],endIndex=(nextStartIndex??notes.length)-1,startNote=notes[startIndex],endNote=notes[endIndex],nextStartNote=nextStartIndex===undefined?null:notes[nextStartIndex],nextMeasure=Number(nextStartNote?.measure),nextBeat=Number(nextStartNote?.beat),endMeasure=nextStartNote&&Number.isFinite(nextMeasure)&&Number.isFinite(nextBeat)&&nextBeat<=1+1e-6&&nextMeasure>Number(startNote.measure)?nextMeasure-1:Number(endNote.measure);return{phraseNumber:index+1,startIndex,endIndex,startNote,endNote,sharedStart:false,sharedEnd:false,startMeasure:Number(startNote.measure),endMeasure,startPitch:shownPitch(startNote),endPitch:shownPitch(endNote)}});
}

export function phraseRangeLabel(span:PhraseSpanMarker){
  const measures=span.startMeasure===span.endMeasure?`${span.startMeasure}마디`:`${span.startMeasure}–${span.endMeasure}마디`;
  return `Phrase ${span.phraseNumber} · ${measures} · ${span.startPitch} → ${span.endPitch}`;
}

const cueNames:Record<string,string>={
  'observed-gap':'실제 시간 공백','pitch-discontinuity':'음정 도약 변화','ioi-discontinuity':'리듬 간격 변화','repeated-motif-start':'반복 모티프 시작','observed-continuity':'시간적 연속','tie-continuation':'타이 지속',
};

function PhraseReviewPanel({work,boundaryIndex,onSelect}:{work:Work;boundaryIndex:number|null;onSelect:(index:number)=>void}){
  const [comment,setComment]=useState(''),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
  const candidates=(work.phraseAnalysis?.boundaries||[]).filter(boundary=>boundary.supported),spans=buildPhraseSpans(work.notes,candidates),boundary=boundaryIndex===null?null:work.phraseAnalysis?.boundaries[boundaryIndex]||null,note=boundary?work.notes[boundary.index]:null,boundaryOrder=candidates.findIndex(candidate=>candidate.index===boundaryIndex),phrase=boundaryOrder>=0?spans[boundaryOrder]:null,nextPhrase=boundaryOrder>=0?spans[boundaryOrder+1]:null,harmony=work.boundaryHarmony?.records.find(record=>record.boundaryIndex===boundaryIndex),cadence=harmony?.selectedCadence;
  useEffect(()=>{setComment('');setMessage('')},[work.workId,boundaryIndex]);
  const save=async(verdict:'accepted'|'rejected'|'ambiguous')=>{if(!boundary||!note)return;setSaving(true);setMessage('');try{const response=await fetch('/api/analysis/phrase-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workId:work.workId,sourceId:work.sourceId,streamId:work.streamId,analyzerVersion:work.phraseAnalysis?.version,boundaryIndex:boundary.index,noteId:note.id,onset:note.onset,measure:note.measure,measureOrdinal:note.measureOrdinal,beat:note.beat,verdict,comment,candidate:{strength:boundary.strength,state:boundary.state,cues:boundary.cues},analysisContext:{boundaryHarmony:harmony||null}})}),data=await response.json();if(!response.ok)throw new Error(data.error||'저장 실패');setMessage('리뷰를 별도 Annotation 데이터로 저장했습니다.')}catch(error){setMessage(error instanceof Error?error.message:'저장 실패')}finally{setSaving(false)}};
  const harmonySummary=(index:number)=>{const record=work.boundaryHarmony?.records.find(item=>item.boundaryIndex===candidates[index]?.index),cadenceLabel=record?.selectedCadence?.type||'Cadence 보류';return record?`${record.harmonyProgression.display} · ${cadenceLabel}`:'화성 근거 부족'};
  return <section className="phrase-review analysis-block"><div className="phrase-review-head"><div><h3>Phrase 구간 검토</h3><p>자동 추정 구간 {spans.length}개 · 경계 후보 {candidates.length}개</p></div><span>{work.boundaryHarmony?'경계 화성 v0.1':'화성 분석 대기'}</span></div><p className="phrase-range-legend">색 띠 하나가 한 Phrase입니다. `P2 시작`은 P2 첫 음 직전의 경계이며, 기본 구간은 음표를 겹쳐 쓰지 않습니다.</p>{!candidates.length?<p className="phrase-empty">현재 임계값을 넘는 경계 후보가 없습니다. 이것도 중요한 평가 결과입니다.</p>:<><label className="phrase-candidate-select">프레이즈<select value={boundaryIndex??''} onChange={event=>onSelect(Number(event.target.value))}>{candidates.map((candidate,index)=>{const summary=spans[index];return <option key={candidate.index} value={candidate.index}>{summary?`${phraseRangeLabel(summary)} · ${harmonySummary(index)}`:`Phrase ${index+1}`}</option>})}{spans.length>candidates.length&&<option disabled>{phraseRangeLabel(spans.at(-1)!)} · 마지막 구간</option>}</select></label>{boundary&&note&&phrase&&<div className="phrase-evidence"><div className="phrase-selected-range"><strong>{phraseRangeLabel(phrase)}</strong><dl><div><dt>시작음</dt><dd>{phrase.startPitch}</dd></div><div><dt>마지막 음</dt><dd>{phrase.endPitch}</dd></div><div><dt>끝부분 화성</dt><dd>{harmony?.harmonyProgression.display||'근거 부족'}</dd></div></dl>{nextPhrase&&<p>다음 구간: {phraseRangeLabel(nextPhrase)}</p>}</div>{harmony&&<div className="boundary-harmony-summary"><div><span>조성 후보</span><strong>{harmony.selectedKey?.label||'판정 보류'}</strong></div><div><span>Cadence 후보</span><strong>{cadence?.type||'판정 보류'}</strong></div><small>{cadence?`근거 강도 ${Math.round(cadence.strength*100)} / 100 · 미보정`:'종지 문법을 확정할 근거가 부족합니다.'}</small></div>}<small className="phrase-boundary-coordinate">다음 Phrase 첫 음 직전 · {note.measure}마디 {note.beat}박</small><span>경계 증거 강도 {Math.round(boundary.strength*100)} / 100</span><ul>{boundary.cues.map((cue,index)=><li key={`${cue.name}-${index}`}><b>{cueNames[cue.name]||cue.name}</b><em>{Math.round(cue.strength*100)}</em></li>)}</ul><p>가사·대문자는 사용하지 않았습니다. 화성과 Cadence는 경계 전후의 제한된 창에서 만든 미보정 가설이며 확정 정답이 아닙니다.</p><textarea value={comment} onChange={event=>setComment(event.target.value)} placeholder="왜 맞거나 틀렸는지, 어느 방향으로 고쳐야 하는지 메모"/><div className="phrase-review-actions"><button type="button" disabled={saving} onClick={()=>save('accepted')}>경계 맞음</button><button type="button" disabled={saving} onClick={()=>save('rejected')}>경계 아님</button><button type="button" disabled={saving} onClick={()=>save('ambiguous')}>판단 보류<br/><small>Can't Judge</small></button></div>{message&&<output>{message}</output>}</div>}</>}</section>;
}

export function FullScorePage() {
  const params = new URLSearchParams(location.search), id = params.get('workId') || '', browse = params.get('browse') === '1', searchEntry=params.get('source')==='search', start = Number(params.get('start')), end = Number(params.get('end')), encodedTargets = params.get('targets');
  const [work, setWork] = useState<Work | null>(null), [playing, setPlaying] = useState(false), [activePlaybackIndex,setActivePlaybackIndex]=useState<number|null>(null), [playbackPosition,setPlaybackPosition]=useState(0), [renderedPlaybackRange,setRenderedPlaybackRange]=useState<{first:number|null;last:number|null;complete:boolean}>({first:null,last:null,complete:false}), [phraseEnabled,setPhraseEnabled]=useState(true),[selectedPhraseBoundary,setSelectedPhraseBoundary]=useState<number|null>(null),[flashingPhraseNumber,setFlashingPhraseNumber]=useState<number|null>(null),[phraseFlashToken,setPhraseFlashToken]=useState(0), timers = useRef<number[]>([]), playbackPositionManuallySet=useRef(false), playingRef=useRef(false),renderCompleteRef=useRef(false);
  const audio = useRef<ScheduledPlayback | null>(null);
  useEffect(() => { const query=new URLSearchParams({start:String(start),end:String(end)});if(encodedTargets)query.set('targets',encodedTargets);fetch(`/api/work/${encodeURIComponent(id)}?${query}`).then(response => response.json()).then(setWork) }, [id,start,end,encodedTargets]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); audio.current?.stop() }, []);
  const matches = useMemo(() => work && !browse ? locate(work, start, end, encodedTargets) : [], [work, browse, start, end, encodedTargets]);
  const restricted=Boolean(work?.restrictedPreviewActive),ordinalOffset=Math.max(0,(work?.previewOrdinalStart||1)-1);
  const visibleNotes=useMemo(()=>{if(!work)return[];if(!restricted)return work.notes;const count=(work.xml.match(/<measure\b/g)||[]).length,first=work.previewOrdinalStart||1,last=first+Math.max(0,count-1);return work.notes.filter(note=>(note.measureOrdinal||0)>=first&&(note.measureOrdinal||0)<=last)},[work,restricted]);
  const playbackNotes=useMemo(()=>collapseTies(visibleNotes),[visibleNotes]);
  const phraseMarkers=useMemo(()=>{if(!work)return[];const visible=new Set(visibleNotes),supported=(work.phraseAnalysis?.boundaries||[]).filter(boundary=>boundary.supported);return supported.filter(boundary=>visible.has(work.notes[boundary.index])).map(boundary=>{const order=supported.indexOf(boundary);return{note:work.notes[boundary.index],boundaryIndex:boundary.index,strength:boundary.strength,beforePhrase:order+1,afterPhrase:order+2}})},[work,visibleNotes]);
  const phraseSpans=useMemo(()=>buildPhraseSpans(visibleNotes,phraseMarkers.map(marker=>({index:visibleNotes.indexOf(marker.note),supported:true} as PhraseBoundary))),[visibleNotes,phraseMarkers]);
  useEffect(()=>{if(!phraseEnabled){setSelectedPhraseBoundary(null);return}if(!phraseMarkers.some(marker=>marker.boundaryIndex===selectedPhraseBoundary))setSelectedPhraseBoundary(phraseMarkers[0]?.boundaryIndex??null)},[phraseEnabled,phraseMarkers,selectedPhraseBoundary]);
  const flashPhrase=useCallback((phraseNumber:number)=>{setFlashingPhraseNumber(phraseNumber);setPhraseFlashToken(token=>token+1)},[]);
  const selectPhraseBoundary=useCallback((boundaryIndex:number)=>{setSelectedPhraseBoundary(boundaryIndex);const order=phraseMarkers.findIndex(marker=>marker.boundaryIndex===boundaryIndex);if(order>=0)flashPhrase(order+1)},[phraseMarkers,flashPhrase]);
  const selectPhrase=useCallback((phraseNumber:number)=>{flashPhrase(phraseNumber);const endingBoundary=phraseMarkers[phraseNumber-1];if(endingBoundary)setSelectedPhraseBoundary(endingBoundary.boundaryIndex)},[phraseMarkers,flashPhrase]);
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
      <button type="button" className={`phrase-layer-toggle ${phraseEnabled?'active':''}`} aria-pressed={phraseEnabled} onClick={()=>setPhraseEnabled(value=>!value)}><i/>{phraseEnabled?'Phrase 분석 켜짐':'Phrase 분석 꺼짐'}</button>
      {work&&<div className="score-transport"><label title="드래그하여 재생 시작 위치 이동"><span>재생 위치{!renderedPlaybackRange.complete&&renderedPlaybackRange.first!==null?' · 렌더링 연동':''}</span><div className="score-range-wrap">{markerLeft!==null&&<i className="score-match-marker" style={{left:`${markerLeft}%`,width:`${markerWidth}%`}} title="검색 일치 구간" aria-label="검색 일치 구간"/>}<input type="range" min="0" max={Math.max(0,playbackNotes.length-1)} value={Math.min(playbackPosition,Math.max(0,playbackNotes.length-1))} onChange={event=>seek(Number(event.target.value))}/></div><b>{playbackNotes.length?`${playbackPosition+1}/${playbackNotes.length}`:'0/0'}</b><div className="measure-jumps" aria-label="마디 단위 재생 위치 이동">{[-5,-1,1,5].map(delta=><button type="button" key={delta} onClick={()=>jumpMeasure(delta)} disabled={!playbackNotes.length} title={`${Math.abs(delta)}마디 ${delta<0?'뒤로':'앞으로'}`}>{delta>0?`+${delta}`:delta}</button>)}</div></label><button className="score-play" onClick={play} disabled={!playbackNotes.length}>{playing ? <Pause /> : <Play />}{playing ? '정지' : '화면 악보 전체 재생'}</button></div>}
    </div>
    {work&&<div className="score-title"><h1>{work.title}</h1>{work.artist&&<p>{work.artist}</p>}</div>}
    {work && <div className="score-layout">
      <div className="score-main">
        {!browse&&<section className="match-locator" onClick={scroll} role="button" tabIndex={0}><div><b>{work.partName} · 검색에서 감지된 음표</b><span>{restricted?'검색된 파트만 제공되는 제한 미리보기':'원본 MusicXML 마디 · 클릭하여 상세 위치로 이동'}</span></div><SearchExcerpt workId={work.workId} start={start} end={end} targets={matches} /></section>}
        <FullXmlNotation xml={work.xml} start={start} end={end} targets={matches} playbackNotes={playbackNotes} activePlaybackIndex={activePlaybackIndex} onPlaybackRangeChange={updateRenderedPlaybackRange} streamId={work.streamId} autoScroll={!browse} measureOrdinalOffset={ordinalOffset} phraseMarkers={phraseMarkers} phraseSpans={phraseSpans} phraseVisible={phraseEnabled} selectedPhraseBoundary={selectedPhraseBoundary} onPhraseBoundarySelect={setSelectedPhraseBoundary} flashingPhraseNumber={flashingPhraseNumber} phraseFlashToken={phraseFlashToken} onPhraseSelect={selectPhrase} />
      </div>
      <aside>
        {work.youtubeId ? <iframe src={`https://www.youtube-nocookie.com/embed/${work.youtubeId}`} title="대표 영상" allowFullScreen /> : <div className="video-placeholder">대표 YouTube 영상 수집 대기</div>}
        {phraseEnabled&&<PhraseReviewPanel work={work} boundaryIndex={selectedPhraseBoundary} onSelect={selectPhraseBoundary}/>}
        <div className="score-summary"><h2>Analysis and Statistics</h2><p>{work.stats.structure.measures} measures · {work.stats.structure.notes} melody notes</p><Bars title="많이 사용된 음" items={work.stats.pitches} /><Bars title="리듬 통계 (beats)" items={work.stats.rhythms} /><MotifAnalysis work={work} /><Bars title="음표 밀도가 높은 마디" items={work.stats.structure.peakMeasures} /></div>
      </aside>
    </div>}
  </main>;
}
