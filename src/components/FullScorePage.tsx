// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pause, Play, Search } from 'lucide-react';
import type { CorpusNote, MatchResult, Query, QueryEvent } from '../types';
import { collapseTies } from '../search/features';
import { schedulePhrase, type ScheduledPlayback } from '../music/audioPlayback';
import { FullXmlNotation } from './FullXmlNotation';
import { SearchExcerpt } from './SearchExcerpt';
import { Notation } from './Notation';

type Stat = { label: string; count: number; score?: number };
type Work = { workId: string; streamId: string; partName: string; title: string; artist?: string; youtubeId?: string; xml: string; notes: CorpusNote[]; stats: any; accessPolicy?: string; fullScoreAvailable?: boolean; previewOrdinalStart?: number; keyFifths?: number; clefShape?: 'G'|'F'|'C'; clefLine?: number; meter?: string };
type StoredState = { events?: QueryEvent[]; results?: { exact?: MatchResult[]; similar?: MatchResult[] } };

const Bars = ({ title, items }: { title: string; items: Stat[] }) => <section className="analysis-block"><h3>{title}</h3>{items.map((item, index) => <div className="stat-row" key={item.label}><span>{index + 1}. {item.label}</span><i style={{ width: `${100 * (item.score ?? item.count) / (items[0]?.score ?? items[0]?.count ?? 1)}%` }} /><b>{item.count}</b></div>)}</section>;

function resultHref(result:MatchResult){
  const targets=result.alignment.filter(step=>step.candidateIndex!==null&&step.type!=='insertion').map(step=>result.work.notes[step.candidateIndex!]).filter(Boolean).map(note=>`${note.onset}:${note.pitchMidi}`).join(',');
  const query=new URLSearchParams({workId:result.work.workId,start:String(result.startMeasure),end:String(result.endMeasure)});if(targets)query.set('targets',targets);return `/score?${query}`;
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

export function FullScorePage() {
  const params = new URLSearchParams(location.search), id = params.get('workId') || '', browse = params.get('browse') === '1', start = Number(params.get('start')), end = Number(params.get('end')), encodedTargets = params.get('targets');
  const [work, setWork] = useState<Work | null>(null), [playing, setPlaying] = useState(false), [activePlaybackIndex,setActivePlaybackIndex]=useState<number|null>(null), [playbackPosition,setPlaybackPosition]=useState(0), [renderedPlaybackRange,setRenderedPlaybackRange]=useState<{first:number|null;last:number|null;complete:boolean}>({first:null,last:null,complete:false}), timers = useRef<number[]>([]), playbackPositionManuallySet=useRef(false), playingRef=useRef(false);
  const audio = useRef<ScheduledPlayback | null>(null);
  useEffect(() => { const query=new URLSearchParams({start:String(start),end:String(end)});if(encodedTargets)query.set('targets',encodedTargets);fetch(`/api/work/${encodeURIComponent(id)}?${query}`).then(response => response.json()).then(setWork) }, [id,start,end,encodedTargets]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); audio.current?.stop() }, []);
  const matches = useMemo(() => work && !browse ? locate(work, start, end, encodedTargets) : [], [work, browse, start, end, encodedTargets]);
  const restricted=work?.accessPolicy==='research-preview',ordinalOffset=Math.max(0,(work?.previewOrdinalStart||1)-1);
  const visibleNotes=useMemo(()=>{if(!work)return[];if(!restricted)return work.notes;const count=(work.xml.match(/<measure\b/g)||[]).length,first=work.previewOrdinalStart||1,last=first+Math.max(0,count-1);return work.notes.filter(note=>(note.measureOrdinal||0)>=first&&(note.measureOrdinal||0)<=last)},[work,restricted]);
  const playbackNotes=useMemo(()=>collapseTies(visibleNotes),[visibleNotes]);
  useEffect(()=>{playbackPositionManuallySet.current=false;setPlaybackPosition(0);setRenderedPlaybackRange({first:null,last:null,complete:false})},[id,work?.streamId]);
  useEffect(()=>{playingRef.current=playing},[playing]);
  const updateRenderedPlaybackRange=useCallback((range:{first:number|null;last:number|null;complete:boolean})=>{setRenderedPlaybackRange(range);if(!playbackPositionManuallySet.current&&!playingRef.current&&range.first!==null)setPlaybackPosition(range.first)},[]);
  const stopPlayback=()=>{playingRef.current=false;timers.current.forEach(clearTimeout);timers.current=[];audio.current?.stop();audio.current=null};
  const beginPlayback = (from:number) => {
    stopPlayback();
    const safe=Math.max(0,Math.min(playbackNotes.length-1,from));
    const sounding=playbackNotes.slice(safe);if(!sounding.length)return;
    playingRef.current=true;setPlaying(true);setPlaybackPosition(safe);setActivePlaybackIndex(safe);let at=0;
    audio.current=schedulePhrase(sounding);
    sounding.forEach((note,index)=>{const absolute=safe+index;timers.current.push(window.setTimeout(()=>{setPlaybackPosition(absolute);setActivePlaybackIndex(absolute)},at+60));at+=625*note.durationRatio});
    timers.current.push(window.setTimeout(()=>{stopPlayback();setPlaying(false);setActivePlaybackIndex(null);setPlaybackPosition(0)},at+100));
  };
  const play = () => {
    if(playing){stopPlayback();setPlaying(false);setActivePlaybackIndex(null);return}
    beginPlayback(playbackPosition);
  };
  const seek=(position:number)=>{playbackPositionManuallySet.current=true;const resume=playing;stopPlayback();setPlaying(false);setPlaybackPosition(position);setActivePlaybackIndex(position);if(resume)beginPlayback(position)};
  const scroll = () => {const target=document.querySelector('.score-main>.xml-score:not(.xml-excerpt) [data-target-start="true"]');if(!target)return;const rect=target.getBoundingClientRect(),offset=Math.max(110,window.innerHeight*.2);window.scrollTo({top:Math.max(0,window.scrollY+rect.top-offset),behavior:'smooth'})};
  return <main className="score-page"><div className="score-toolbar"><button className="back-button" onClick={() => history.back()}><ArrowLeft /> {browse?'카탈로그로 돌아가기':'검색 결과로 돌아가기'}</button>{work&&<div className="score-title"><h1>{work.title}</h1>{work.artist&&<p>{work.artist}</p>}</div>}<span className="range-badge">{restricted?'검색 파트 제한 미리보기':browse?'전체 악보 탐색':`검색 일치 구간 · 마디 ${start}–${end}`}</span>{work&&<div className="score-transport"><label title="드래그하여 재생 시작 위치 이동"><span>재생 위치{!renderedPlaybackRange.complete&&renderedPlaybackRange.first!==null?' · 렌더링 연동':''}</span><input type="range" min="0" max={Math.max(0,playbackNotes.length-1)} value={Math.min(playbackPosition,Math.max(0,playbackNotes.length-1))} onChange={event=>seek(Number(event.target.value))}/><b>{playbackNotes.length?`${playbackPosition+1}/${playbackNotes.length}`:'0/0'}</b></label><button className="score-play" onClick={play} disabled={!playbackNotes.length}>{playing ? <Pause /> : <Play />}{playing ? '정지' : '화면 악보 전체 재생'}</button></div>}</div>{work && <div className="score-layout"><div className="score-main">{!browse&&<section className="match-locator" onClick={scroll} role="button" tabIndex={0}><div><b>{work.partName} · 검색에서 감지된 음표</b><span>{restricted?'검색된 파트만 제공되는 제한 미리보기':'원본 MusicXML 마디 · 클릭하여 상세 위치로 이동'}</span></div><SearchExcerpt workId={work.workId} start={start} end={end} targets={matches} /></section>}<FullXmlNotation xml={work.xml} start={start} end={end} targets={matches} playbackNotes={playbackNotes} activePlaybackIndex={activePlaybackIndex} onPlaybackRangeChange={updateRenderedPlaybackRange} streamId={work.streamId} autoScroll={!browse} measureOrdinalOffset={ordinalOffset} /></div><aside>{work.youtubeId ? <iframe src={`https://www.youtube-nocookie.com/embed/${work.youtubeId}`} title="대표 영상" allowFullScreen /> : <div className="video-placeholder">대표 YouTube 영상 수집 대기</div>}<div className="score-summary"><h2>Analysis and Statistics</h2><p>{work.stats.structure.measures} measures · {work.stats.structure.notes} melody notes</p><Bars title="많이 사용된 음" items={work.stats.pitches} /><Bars title="리듬 통계 (beats)" items={work.stats.rhythms} /><MotifAnalysis work={work} /><Bars title="음표 밀도가 높은 마디" items={work.stats.structure.peakMeasures} /></div></aside></div>}</main>;
}
