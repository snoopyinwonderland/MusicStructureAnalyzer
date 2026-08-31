import { useEffect, useRef, useState } from 'react';
import type { VerovioToolkit } from 'verovio/esm';
import type { CorpusNote } from '../types';

declare module 'verovio/esm' { interface VerovioToolkit { getPageCount(): number } }

let modules: Promise<any> | null = null;
const newToolkit = () => {
  modules ??= Promise.all([import('verovio/wasm'), import('verovio/esm')]);
  return modules.then(async ([w, e]: any[]) => new e.VerovioToolkit(await w.default()));
};
const midi = (n: Element) => {
  const s = n.getElementsByTagName('step')[0]?.textContent || 'C';
  const o = +(n.getElementsByTagName('octave')[0]?.textContent || 4);
  const a = +(n.getElementsByTagName('alter')[0]?.textContent || 0);
  const pc: any = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (o + 1) * 12 + pc[s] + a;
};
const tieTypes = (n: Element) => [...n.getElementsByTagName('tie')].map(x => x.getAttribute('type'));
const positionedNotes = (part: Element | undefined) => {
  const positions = new Map<Element, { beat: number; staff: string; voice: string }>();
  let divisions = 1;
  for (const measure of [...(part?.children || [])].filter(child => child.tagName === 'measure')) {
    const declared = +(measure.getElementsByTagName('attributes')[0]?.getElementsByTagName('divisions')[0]?.textContent || 0);
    if (declared > 0) divisions = declared;
    let cursor = 0, lastOnset = 0;
    for (const element of [...measure.children]) {
      const duration = +(element.getElementsByTagName('duration')[0]?.textContent || 0);
      if (element.tagName === 'backup') { cursor -= duration; continue; }
      if (element.tagName === 'forward') { cursor += duration; continue; }
      if (element.tagName !== 'note') continue;
      const chord = Boolean(element.getElementsByTagName('chord').length), grace = Boolean(element.getElementsByTagName('grace').length), onset = chord ? lastOnset : cursor;
      positions.set(element, { beat: 1 + onset / divisions, staff: element.getElementsByTagName('staff')[0]?.textContent || '1', voice: element.getElementsByTagName('voice')[0]?.textContent || '1' });
      if (!chord) lastOnset = onset;
      if (!chord && !grace) cursor += duration;
    }
  }
  return positions;
};
const isShortFirstMeasure = (measure: Element) => {
  const attributes = measure.getElementsByTagName('attributes')[0];
  const divisions = +(attributes?.getElementsByTagName('divisions')[0]?.textContent || 1);
  const beatsText = attributes?.getElementsByTagName('beats')[0]?.textContent || '4';
  const beats = beatsText.split('+').reduce((sum, value) => sum + (+value || 0), 0);
  const beatType = +(attributes?.getElementsByTagName('beat-type')[0]?.textContent || 4);
  const nominal = divisions * beats * 4 / beatType;
  let cursor = 0, maximum = 0;
  for (const element of [...measure.children]) {
    const duration = +(element.getElementsByTagName('duration')[0]?.textContent || 0);
    if (element.tagName === 'backup') cursor -= duration;
    else if (element.tagName === 'forward') { cursor += duration; maximum = Math.max(maximum, cursor); }
    else if (element.tagName === 'note' && !element.getElementsByTagName('chord').length && !element.getElementsByTagName('grace').length) {
      cursor += duration; maximum = Math.max(maximum, cursor);
    }
  }
  return nominal > 0 && maximum > 0 && maximum < nominal - .001;
};
const normalizePickupMeasures = (doc: XMLDocument) => {
  for (const part of [...doc.getElementsByTagName('part')]) {
    const measures = [...part.children].filter(child => child.tagName === 'measure');
    const first = measures[0];
    if (!first) continue;
    const pickup = first.getAttribute('implicit')?.toLowerCase() === 'yes' || isShortFirstMeasure(first);
    if (!pickup) continue;
    const firstNumber = Number(first.getAttribute('number'));
    const shift = Number.isFinite(firstNumber) && firstNumber > 0 ? firstNumber : 0;
    for (const [index, measure] of measures.entries()) {
      const declared = Number(measure.getAttribute('number'));
      if (Number.isFinite(declared)) measure.setAttribute('number', String(declared - shift));
      else if (index === 0) measure.setAttribute('number', '0');
    }
  }
};
const effectiveAttributes = (doc: XMLDocument, measures: Element[], first: Element) => {
  let attrs = first.getElementsByTagName('attributes')[0];
  if (!attrs) { attrs = doc.createElement('attributes'); first.insertBefore(attrs, first.firstChild); }
  const prior = measures.slice(0, measures.indexOf(first) + 1);
  for (const tag of ['divisions', 'key', 'time', 'staves', 'clef', 'transpose']) {
    if (attrs.getElementsByTagName(tag).length) continue;
    const source = prior.slice().reverse().map(m => m.getElementsByTagName('attributes')[0]).find(a => a?.getElementsByTagName(tag).length);
    if (source) for (const node of [...source.getElementsByTagName(tag)]) attrs.appendChild(node.cloneNode(true));
  }
};
const trimToExcerpt = (doc: XMLDocument, partId: string, start: number, end: number) => {
  for (const p of [...doc.getElementsByTagName('part')]) if (p.getAttribute('id') !== partId) p.remove();
  for (const p of [...doc.getElementsByTagName('score-part')]) if (p.getAttribute('id') !== partId) p.remove();
  for (const g of [...doc.getElementsByTagName('part-group')]) g.remove();
  for (const d of [...doc.getElementsByTagName('defaults')]) d.remove();
  for (const part of [...doc.getElementsByTagName('part')]) {
    const all = [...part.getElementsByTagName('measure')];
    const keep = all.filter(m => { const n = Number(m.getAttribute('number')); return n >= start && n <= end; });
    const first = keep[0];
    if (first) effectiveAttributes(doc, all, first);
    for (const m of all) {
      m.removeAttribute('width');
      for (const p of [...m.getElementsByTagName('print')]) p.remove();
      if (!keep.includes(m)) m.remove();
    }
  }
};

export function FullXmlNotation({ xml, start, end, targets, streamId, excerpt = false, autoScroll = true }: { xml: string; start: number; end: number; targets: CorpusNote[]; streamId: string; excerpt?: boolean; autoScroll?: boolean }) {
  const [pages, setPages] = useState<string[]>([]);
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Promise<VerovioToolkit> | null>(null);
  if (!instance.current) instance.current = newToolkit();
  useEffect(() => {
    let live = true;
    instance.current!.then(tk => {
      tk.setOptions({ pageWidth: excerpt ? 1800 : 1900, pageHeight: excerpt ? 720 : 2700, pageMarginTop: excerpt ? 24 : 75, pageMarginBottom: excerpt ? 38 : 210, adjustPageHeight: true, scale: excerpt ? 25 : 24, breaks: excerpt ? 'none' : 'encoded', svgViewBox: true, header: 'none', footer: 'none', measureNumbers: 1, spacingStaff: 12, spacingSystem: 6 });
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const [partId, staff = '1', voice = '1'] = streamId.split(':');
      for (const tag of ['credit', 'work', 'movement-title']) for (const n of [...doc.getElementsByTagName(tag)]) n.remove();
      normalizePickupMeasures(doc);
      if (excerpt) trimToExcerpt(doc, partId, start, end);
      const part = [...doc.getElementsByTagName('part')].find(x => x.getAttribute('id') === partId);
      const ordered = [...(part?.getElementsByTagName('note') || [])];
      const positions = positionedNotes(part);
      const used = new Set<Element>();
      const marked = new Set<Element>();
      const mark = (n: Element) => { if (!marked.has(n)) { n.setAttribute('id', `search-match-${marked.size}`); marked.add(n); } };
      // MusicXML stores a chord as one root note followed by adjacent <note><chord/> siblings.
      const markChord = (n: Element) => {
        let i = ordered.indexOf(n);
        while (i > 0 && ordered[i].getElementsByTagName('chord').length) i--;
        mark(ordered[i]);
        for (let j = i + 1; j < ordered.length && ordered[j].getElementsByTagName('chord').length; j++) mark(ordered[j]);
      };
      for (const target of targets) {
        const note = ordered.find(n => { const position = positions.get(n); return !used.has(n) && n.closest('measure')?.getAttribute('number') === String(target.measure) && !n.getElementsByTagName('rest').length && position?.staff === staff && position?.voice === voice && Math.abs(position.beat - Number(target.beat)) < 1e-6 && midi(n) === target.pitchMidi });
        if (!note) continue;
        used.add(note);
        markChord(note);
        let current = note, index = ordered.indexOf(note);
        while (tieTypes(current).includes('start')) {
          const next = ordered.slice(index + 1).find(n => midi(n) === target.pitchMidi && tieTypes(n).includes('stop'));
          if (!next) break;
          markChord(next);
          current = next; index = ordered.indexOf(next);
        }
      }
      tk.loadData(new XMLSerializer().serializeToString(doc));
      const output = Array.from({ length: tk.getPageCount() }, (_, page) => {
        const svg = new DOMParser().parseFromString(tk.renderToSVG(page + 1, false), 'image/svg+xml');
        for (let i = 0; i < marked.size; i++) {
          const n = svg.getElementById(`search-match-${i}`);
          if (n) { n.setAttribute('data-target-note', 'true'); if (i === 0) n.setAttribute('data-target-start', 'true'); }
        }
        return new XMLSerializer().serializeToString(svg.documentElement);
      });
      if (live) setPages(output);
    }).catch(() => setPages([]));
    return () => { live = false; };
  }, [xml, start, end, targets, streamId, excerpt]);
  useEffect(() => {
    if (!autoScroll || !pages.length) return;
    requestAnimationFrame(() => { host.current?.querySelector('[data-target-start="true"]')?.scrollIntoView({ block: 'start' }); window.scrollBy({ top: -115 }); });
  }, [pages, autoScroll]);
  return <div ref={host} className={`xml-score ${excerpt ? 'xml-excerpt' : ''}`}>{pages.map((svg, i) => <section key={i} dangerouslySetInnerHTML={{ __html: svg }} />)}</div>;
}
