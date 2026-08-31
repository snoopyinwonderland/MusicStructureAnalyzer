// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pause, Play } from 'lucide-react';
import type { CorpusNote, MatchResult, QueryEvent } from '../types';
import { collapseTies } from '../search/features';
import { FullXmlNotation } from './FullXmlNotation';

type Stat = { label: string; count: number; score?: number };
type Work = { workId: string; streamId: string; partName: string; title: string; youtubeId?: string; xml: string; notes: CorpusNote[]; stats: any };
type StoredState = { events?: QueryEvent[]; results?: { exact?: MatchResult[]; similar?: MatchResult[] } };

const Bars = ({ title, items }: { title: string; items: Stat[] }) => <section className="analysis-block"><h3>{title}</h3>{items.map((item, index) => <div className="stat-row" key={item.label}><span>{index + 1}. {item.label}</span><i style={{ width: `${100 * (item.score ?? item.count) / (items[0]?.score ?? items[0]?.count ?? 1)}%` }} /><b>{item.count}</b></div>)}</section>;
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
  const [work, setWork] = useState<Work | null>(null), [playing, setPlaying] = useState(false), timers = useRef<number[]>([]);
  useEffect(() => { fetch(`/api/work/${encodeURIComponent(id)}`).then(response => response.json()).then(setWork) }, [id]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const matches = useMemo(() => work && !browse ? locate(work, start, end, encodedTargets) : [], [work, browse, start, end, encodedTargets]);
  const play = () => {
    timers.current.forEach(clearTimeout);
    if (playing) { setPlaying(false); return }
    setPlaying(true); let at = 0;
    for (const note of collapseTies(matches)) {
      const milliseconds = 625 * note.durationRatio;
      timers.current.push(window.setTimeout(() => { const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain(); oscillator.frequency.value = 440 * 2 ** ((note.pitchMidi! - 69) / 12); gain.gain.setValueAtTime(.055, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + Math.min(.55, milliseconds / 1000)); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + Math.min(.6, milliseconds / 1000)) }, at));
      at += milliseconds;
    }
    timers.current.push(window.setTimeout(() => setPlaying(false), at));
  };
  const scroll = () => document.querySelector('.score-main>.xml-score:not(.xml-excerpt) [data-target-start="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return <main className="score-page"><div className="score-toolbar"><button className="back-button" onClick={() => history.back()}><ArrowLeft /> {browse?'카탈로그로 돌아가기':'검색 결과로 돌아가기'}</button><span className="range-badge">{browse?'전체 악보 탐색':`검색 일치 구간 · 마디 ${start}–${end}`}</span>{!browse&&<button className="score-play" onClick={play}>{playing ? <Pause /> : <Play />}{playing ? '정지' : '감지된 음표 재생'}</button>}</div>{work && <div className="score-layout"><div className="score-main">{!browse&&<section className="match-locator" onClick={scroll} role="button" tabIndex={0}><div><b>{work.partName} · 검색에서 감지된 음표</b><span>원본 MusicXML 마디 · 클릭하여 상세 위치로 이동</span></div><FullXmlNotation xml={work.xml} start={start} end={end} targets={matches} streamId={work.streamId} excerpt autoScroll={false} /></section>}<FullXmlNotation xml={work.xml} start={start} end={end} targets={matches} streamId={work.streamId} autoScroll={!browse} /></div><aside>{work.youtubeId ? <iframe src={`https://www.youtube-nocookie.com/embed/${work.youtubeId}`} title="대표 영상" allowFullScreen /> : <div className="video-placeholder">대표 YouTube 영상 수집 대기</div>}<div className="score-summary"><h2>Melody analysis</h2><p>{work.stats.structure.measures} measures · {work.stats.structure.notes} melody notes</p><Bars title="많이 사용된 음" items={work.stats.pitches} /><Bars title="리듬 통계 (beats)" items={work.stats.rhythms} /><Bars title="주요 interval motif" items={work.stats.motifs} /><Bars title="음표 밀도가 높은 마디" items={work.stats.structure.peakMeasures} /></div></aside></div>}</main>;
}
