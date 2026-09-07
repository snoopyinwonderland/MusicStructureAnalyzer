import { displayArtist } from '../music/metadata';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, Pause, Play, Sparkles } from 'lucide-react';
import type { MatchResult } from '../types';
import { withMeasureRests } from '../music/display';
import { collapseTies } from '../search/features';
import { schedulePhrase, type ScheduledPlayback } from '../music/audioPlayback';
import { SearchExcerpt } from './SearchExcerpt';

const Score = ({ label, value }: { label: string; value: number }) => <div className="score-row"><span>{label}</span><div><i style={{ width: `${value}%` }} /></div><b>{Math.round(value)}</b></div>;

export function ResultCard({ result, index }: { result: MatchResult; index: number }) {
  const { work } = result;
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const audio = useRef<ScheduledPlayback | null>(null);
  const scoreLink = useRef<HTMLAnchorElement>(null);
  const targets = useMemo(() => result.alignment.filter(a => a.candidateIndex !== null && a.type !== 'insertion').map(a => work.notes[a.candidateIndex!]).filter(Boolean), [result, work]);
  // withMeasureRests splits a long note at barlines for notation. Merge those
  // display-only tie pieces again before audio scheduling so there is one attack.
  const events = useMemo(() => collapseTies(withMeasureRests(work.notes)), [work]);
  const playbackNotes = useMemo(() => events.filter(event => event.kind === 'note') as typeof work.notes, [events]);
  const clearPlayback = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    audio.current?.stop();
    audio.current = null;
  };
  useEffect(() => () => clearPlayback(), []);
  const stop = () => { clearPlayback(); setPlaying(false); setCursor(null); };
  const play = () => {
    if (playing) { stop(); return; }
    clearPlayback();
    setPlaying(true);
    setCursor(null);
    const total = events.reduce((sum, event) => sum + 625 * event.durationRatio, 0);
    audio.current = schedulePhrase(events);
    const root = scoreLink.current, viewport = root?.querySelector('.xml-excerpt') as HTMLElement | null;
    const movePlayhead = (ordinal: number) => {
      const note = root?.querySelector<SVGGElement>(`[data-playback-index="${ordinal}"]`);
      if (!note || !root) return;
      if (viewport) {
        const noteRect = note.getBoundingClientRect(), viewportRect = viewport.getBoundingClientRect(), contentX = noteRect.left - viewportRect.left + viewport.scrollLeft + noteRect.width / 2;
        viewport.scrollLeft = Math.max(0, contentX - viewport.clientWidth / 2);
      }
      const noteRect = note.getBoundingClientRect(), rootRect = root.getBoundingClientRect();
      setCursor(noteRect.left - rootRect.left + noteRect.width / 2);
    };
    let at = 0;
    let soundingOrdinal = 0;
    for (const event of events) {
      const ms = 625 * event.durationRatio;
      if (event.kind === 'note') {
        const ordinal = soundingOrdinal++;
        timers.current.push(window.setTimeout(() => {
        movePlayhead(ordinal);
        }, at));
      }
      at += ms;
    }
    timers.current.push(window.setTimeout(() => { clearPlayback(); setPlaying(false); setCursor(null); }, total + 100));
  };
  const targetParam = targets.map(note => `${note.onset}:${note.pitchMidi}`).join(',');
  const url = `/score?workId=${encodeURIComponent(work.workId)}&start=${result.startMeasure}&end=${result.endMeasure}${targetParam ? `&targets=${encodeURIComponent(targetParam)}` : ''}`;
  const startYoutubeBackfill = () => { void fetch('/api/youtube/backfill/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: work.title }), keepalive: true }).catch(() => undefined); };
  const [partId='P1',staff='1',voice='1']=work.streamId.split(':'),nonPrimaryStream=partId!=='P1'||staff!=='1'||voice!=='1';
  return <article className="result-card expanded" style={{ '--accent': work.accent } as React.CSSProperties}>
    <div className="result-rank">{String(index + 1).padStart(2, '0')}</div><div className="album-mark"><span>MN</span></div>
    <div className="result-main"><div className="eyebrow"><span className={`badge ${result.kind}`}>{result.kind === 'exact' ? 'Exact' : 'Similar'}</span><span>{work.genre}</span>{nonPrimaryStream&&<span>{work.partName||partId} · Part {partId} / Staff {staff} / Voice {voice}</span>}</div><h3>{work.title}</h3>{work.artist && <p className="artist">{displayArtist(work.artist)}</p>}<div className="match-meta"><span>마디 {result.startMeasure} · {result.startBeat}박–{result.endMeasure}</span><span>{work.partName || work.streamId}</span>{Boolean(result.occurrenceCount)&&<span>동일 선율·리듬 {result.occurrenceCount}회{result.occurrenceMeasures?.length?` · 마디 ${result.occurrenceMeasures.join(', ')}`:''}</span>}</div>{Boolean(result.partOccurrences?.length)&&<ol className="part-occurrences">{result.partOccurrences!.map((part,index)=><li key={part.streamId}><b>{index+1}. {part.partName}</b><span>{part.count}회 · 마디 {part.measures.join(', ')}</span></li>)}</ol>}<details><summary><Sparkles size={14} /> Why this matched <ChevronDown size={14} /></summary>{result.why.map(x => <p key={x}>{x}</p>)}</details></div>
    <div className="result-scores"><div className="big-score"><span>{result.kind === 'exact' ? 'Exact match' : 'Match score'}</span><strong>{Math.round(result.ranking)}</strong></div><Score label="Melody Interval" value={result.scores.interval} /><Score label="Rhythm" value={result.scores.rhythm} /><Score label="Downbeat Weight" value={result.scores.meter} /><Score label="Schenker-Informed" value={result.scores.structural} /><div className="confidence">Motif importance · repetition/share {Math.round(result.occurrenceImportance)}</div></div>
    <div className="result-actions"><button aria-label="악보 조각 재생" onClick={play}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>{work.youtubeId && <a href={`https://youtu.be/${work.youtubeId}`} target="_blank" rel="noreferrer"><ExternalLink size={16} /></a>}</div>
    <div className="result-notation"><div><b>{work.partName || work.streamId} · 원본 악보 조각</b><span>붉은 음표가 검색된 구간</span></div><div className="result-media"><a ref={scoreLink} className="score-link" href={url} onClick={startYoutubeBackfill}>{playing && cursor !== null && <i className="excerpt-playhead" style={{ left: cursor }} aria-hidden="true" />}<SearchExcerpt workId={work.workId} start={result.startMeasure} end={result.endMeasure} targets={targets} playbackNotes={playbackNotes} /></a>{work.youtubeId && <iframe loading="lazy" src={`https://www.youtube-nocookie.com/embed/${work.youtubeId}`} title={`${work.title} 대표 영상`} allowFullScreen />}</div></div>
  </article>;
}
