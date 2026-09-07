import { useEffect, useMemo, useState } from 'react';
import type { CorpusNote } from '../types';
import { FullXmlNotation } from './FullXmlNotation';

type Data = { xml: string; streamId: string; accessPolicy?: string; previewOrdinalStart?: number; excerptPrepared?: boolean };
const EMPTY_NOTES: CorpusNote[] = [];

export function SearchExcerpt({ workId, start, end, targets, playbackNotes = EMPTY_NOTES }: { workId: string; start: number; end: number; targets: CorpusNote[]; playbackNotes?: CorpusNote[] }) {
  const [data, setData] = useState<Data | null>(null);
  const ordinals = useMemo(() => targets.map(note => note.measureOrdinal).filter((value): value is number => Number.isFinite(value)), [targets]);
  const ordinalStart = ordinals.length ? Math.min(...ordinals) : '', ordinalEnd = ordinals.length ? Math.max(...ordinals) : '';
  useEffect(() => {
    const query = new URLSearchParams({ start: String(start), end: String(end), ordinalStart: String(ordinalStart), ordinalEnd: String(ordinalEnd), excerpt: '1' });
    fetch(`/api/work/${encodeURIComponent(workId)}?${query}`).then(response => response.json()).then(setData);
  }, [workId, start, end, ordinalStart, ordinalEnd]);
  return data ? <FullXmlNotation xml={data.xml} streamId={data.streamId} start={start} end={end} targets={targets} playbackNotes={playbackNotes} excerpt autoScroll={false} pretrimmed={data.excerptPrepared||data.accessPolicy==='research-preview'} measureOrdinalOffset={Math.max(0,(data.previewOrdinalStart||1)-1)} /> : <div className="excerpt-loading">검색 일치 구간을 불러오는 중…</div>;
}
