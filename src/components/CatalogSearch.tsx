import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type CatalogItem = { workId: string; title: string; composer: string; source: string; partName: string };

export function CatalogSearch() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [open, setOpen] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    request.current?.abort();
    if (query.trim().length < 2) { setItems([]); setOpen(false); return }
    const controller = new AbortController(); request.current = controller;
    const timer = window.setTimeout(() => fetch(`/api/catalog/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }).then(response => response.json()).then(data => { setItems(data.items || []); setOpen(true) }).catch(() => undefined), 180);
    return () => { window.clearTimeout(timer); controller.abort() };
  }, [query]);
  return <div className="catalog-search" role="search">
    <Search aria-hidden="true" />
    <input value={query} onChange={event => setQuery(event.target.value)} onFocus={() => items.length && setOpen(true)} placeholder="곡명·작곡가·키워드 검색" aria-label="음악 카탈로그 검색" />
    {query && <button aria-label="텍스트 검색 지우기" onClick={() => { setQuery(''); setItems([]) }}><X /></button>}
    {open && <div className="catalog-results">{items.length ? items.map(item => <a key={item.workId} href={`/score?workId=${encodeURIComponent(item.workId)}&browse=1`}><b>{item.title}</b><span>{[item.composer, item.partName].filter(Boolean).join(' · ')}</span><small>{item.source}</small></a>) : <p>일치하는 음악이 없습니다.</p>}</div>}
  </div>;
}
