#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { alignLocal, alignRhythmDtw, annotateStructural, compareStructural, getWork, metricalEvidence, prepareQueryNotes, resultAdmissionAllowed, score, searchDatabase } from '../server/search-api.mjs';
import { markXmlTargets } from '../server/xml-target-verification.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = resolve(process.env.MUSICANOTE_SEARCH_DB || resolve(root, 'data/search-index-v2/search.sqlite'));
const suiteArg = process.argv.indexOf('--suite');
const suiteName = suiteArg >= 0 ? process.argv[suiteArg + 1] : 'motif-100';
const supportedSuites = ['motif-100', 'motif-200', 'motif-300'];
if (!supportedSuites.includes(suiteName)) throw new Error(`--suite must be one of ${supportedSuites.join(', ')}`);
const suiteNumber = Number(suiteName.slice('motif-'.length));
const casePath = resolve(root, `evaluation/${suiteName}/cases.jsonl`);
const reportPath = resolve(root, `evaluation/runs/${suiteName}-latest.json`);
const documentPath = resolve(root, `docs/${suiteName}-search-evaluation.md`);
const codePaths = ['server/search-api.mjs', 'server/xml-target-verification.mjs', 'scripts/motif-100-benchmark.mjs'].map(path => resolve(root, path));
const pitchNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const mutationLabels = { pitch: '중간 음높이 ±1', octave: '내부 음 옥타브 이동', rhythm: '국소 리듬 재분배', leap: '특징적 도약 축소', rest: '내부 쉼표 삽입/길이 변화' };

const sha256 = value => createHash('sha256').update(value).digest('hex');
const round = (value, digits = 4) => Number(Number(value).toFixed(digits));
const atomicWrite = (path, value) => { mkdirSync(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.tmp`; writeFileSync(temporary, value, 'utf8'); renameSync(temporary, path); };
const family = source => source.startsWith('kysing/') ? 'KYSing' : /pdmx|\.mxl$/i.test(source) ? 'PDMX' : 'MusicXML';
const normalizedTitle = title => String(title || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const pitchName = midi => `${pitchNames[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const sounding = events => events.filter(event => event.kind === 'note');
const intervals = notes => notes.slice(1).map((note, index) => note.p - notes[index].p);
const normalized = values => { const base = values.find(value => value > 0) || 1; return values.map(value => round(value / base, 3)); };
const signature = notes => JSON.stringify({ i: intervals(notes), io: normalized(notes.slice(1).map((note, index) => note.o - notes[index].o)) });

function motifCandidates(row) {
  let raw;
  try { raw = JSON.parse(row.notes); } catch { return []; }
  if (!Array.isArray(raw) || raw.length < 24 || raw.length > 1200) return [];
  const length = 10, counts = new Map();
  for (let start = 0; start + length <= raw.length; start++) {
    const notes = raw.slice(start, start + length);
    if (notes.some(note => !Number.isFinite(note.p) || !Number.isFinite(note.o) || !Number.isFinite(note.d))) continue;
    if (notes.slice(1).some((note, index) => note.o <= notes[index].o)) continue;
    const key = signature(notes); counts.set(key, (counts.get(key) || 0) + 1);
  }
  const output = [];
  for (let start = 0; start + length <= raw.length; start++) {
    const notes = raw.slice(start, start + length), ints = intervals(notes), pitches = notes.map(note => note.p), iois = notes.slice(1).map((note, index) => note.o - notes[index].o);
    if (notes.some(note => !Number.isFinite(note.p) || !Number.isFinite(note.o) || !Number.isFinite(note.d) || note.d <= 0)) continue;
    if (iois.some(value => value <= 0 || value > 6)) continue;
    const range = Math.max(...pitches) - Math.min(...pitches), uniquePitches = new Set(pitches).size, uniqueIntervals = new Set(ints).size, repeats = ints.filter(value => value === 0).length;
    const measureSpan = Number(notes.at(-1).m) - Number(notes[0].m), durationSpan = notes.at(-1).o + notes.at(-1).d - notes[0].o;
    if (range < 5 || range > 24 || uniquePitches < 4 || uniqueIntervals < 3 || repeats > 4 || measureSpan > 4 || durationSpan < 3 || durationSpan > 20) continue;
    const prior = raw[start - 1], boundaryGap = prior ? notes[0].o - (prior.o + prior.d) : 1, startsStrong = Math.abs(Number(notes[0].b) - 1) < 1e-6;
    if (!startsStrong && boundaryGap < .25 && start % 4 !== 0) continue;
    const occurrenceCount = counts.get(signature(notes)) || 1, leaps = ints.filter(value => Math.abs(value) >= 4 && Math.abs(value) <= 12).length, rhythmVariety = new Set(normalized(iois)).size;
    const score = 35 * Number(row.role || 0) + 5 * Math.min(3, occurrenceCount) + 3 * Math.min(4, leaps) + 2 * Math.min(5, rhythmVariety) + (startsStrong ? 7 : 0) + Math.min(12, range) - 2 * repeats;
    output.push({ row, raw, start, notes, score: round(score), occurrenceCount, startsStrong, boundaryGap: round(boundaryGap), family: family(row.source) });
  }
  return output.sort((a, b) => b.score - a.score || a.start - b.start).slice(0, 2);
}

export function selectBaseMotifs(database, count = 20, excludeSources = new Set()) {
  // `ORDER BY role` and `length(notes)` force a multi-GB table scan and temp sort on
  // production databases. Import order is grouped by corpus, so take a bounded,
  // deterministic prefix from every corpus instead of sampling only the first one.
  const projection = 'SELECT id,title,composer,source,stream_id,role,access_policy,notes FROM works';
  const sampled = [
    ...database.prepare(`${projection} WHERE role>=0.72 AND source NOT LIKE 'mxl/%' AND source NOT LIKE 'kysing/%' LIMIT 1600`).all(),
    ...database.prepare(`${projection} WHERE role>=0.72 AND source LIKE 'mxl/%' LIMIT 1600`).all(),
    ...database.prepare(`${projection} WHERE role>=0.72 AND source LIKE 'kysing/%' LIMIT 1600`).all(),
  ];
  const seenSources = new Set(), rows = [], perFamily = new Map();
  for (const row of sampled) {
    if (excludeSources.has(row.source) || seenSources.has(row.source) || row.notes.length < 1200 || row.notes.length > 180000) continue;
    const group = family(row.source);
    if ((perFamily.get(group) || 0) >= 1200) continue;
    seenSources.add(row.source);
    rows.push(row);
    perFamily.set(group, (perFamily.get(group) || 0) + 1);
  }
  const pool = rows.flatMap(motifCandidates).sort((a, b) => b.score - a.score);
  const selected = [], sources = new Set(), titles = new Set(), familyCounts = new Map(), quota = { MusicXML: 7, PDMX: 7, KYSing: 6 };
  const take = (candidate, enforceQuota) => {
    const title = normalizedTitle(candidate.row.title);
    if (!title || sources.has(candidate.row.source) || titles.has(title)) return false;
    if (enforceQuota && (familyCounts.get(candidate.family) || 0) >= quota[candidate.family]) return false;
    const targetOption = candidate.notes.map(note => `${note.o}:${note.p}`).join(',');
    const work = getWork(candidate.row.id, {
      ordinalStart: candidate.notes[0].m,
      ordinalEnd: candidate.notes.at(-1).m,
      targets: targetOption,
      excerpt: '1',
    });
    if (!work?.xml || !/^\d+\/\d+$/.test(work.meter || '')) return false;
    candidate.meter = work.meter; candidate.partName = work.partName;
    selected.push(candidate); sources.add(candidate.row.source); titles.add(title); familyCounts.set(candidate.family, (familyCounts.get(candidate.family) || 0) + 1);
    return true;
  };
  for (const candidate of pool) { take(candidate, true); if (selected.length === count) break; }
  if (selected.length < count) for (const candidate of pool) { take(candidate, false); if (selected.length === count) break; }
  if (selected.length !== count) throw new Error(`Could select only ${selected.length}/${count} motif bases`);
  return selected;
}

function baseEvents(base) {
  const events = [];
  for (const [index, note] of base.notes.entries()) {
    events.push({ kind: 'note', pitchMidi: note.p, spelling: note.s || pitchName(note.p), durationRatio: round(note.d) });
    const next = base.notes[index + 1], gap = next ? next.o - (note.o + note.d) : 0;
    if (gap > 1 / 64 - 1e-6) events.push({ kind: 'rest', pitchMidi: null, durationRatio: round(gap) });
  }
  return events;
}

const resetIds = (events, caseId) => events.map((event, index) => ({ ...event, id: `${caseId.toLowerCase()}-${String(index + 1).padStart(2, '0')}` }));
const changePitch = (event, pitchMidi) => ({ ...event, pitchMidi, spelling: pitchName(pitchMidi) });

export function mutateEvents(original, kind, seed = 0) {
  const events = original.map(event => ({ ...event })), noteIndexes = events.map((event, index) => event.kind === 'note' ? index : -1).filter(index => index >= 0);
  if (kind === 'pitch') {
    const index = noteIndexes[Math.floor(noteIndexes.length / 2)]; events[index] = changePitch(events[index], events[index].pitchMidi + (seed % 2 ? -1 : 1));
  } else if (kind === 'octave') {
    const index = noteIndexes[Math.floor(noteIndexes.length * .4)], delta = events[index].pitchMidi <= 84 ? 12 : -12; events[index] = changePitch(events[index], events[index].pitchMidi + delta);
  } else if (kind === 'rhythm') {
    let pair = null;
    for (let index = 1; index < noteIndexes.length - 1; index++) { const a = noteIndexes[index], b = noteIndexes[index + 1]; if (events[a].durationRatio >= .375 && events[b].durationRatio >= .375) { pair = [a, b]; break; } }
    pair ||= [noteIndexes[1], noteIndexes[2]];
    const delta = Math.min(.25, Math.max(.0625, events[pair[1]].durationRatio / 3));
    events[pair[0]].durationRatio = round(events[pair[0]].durationRatio + delta); events[pair[1]].durationRatio = round(Math.max(1 / 64, events[pair[1]].durationRatio - delta));
  } else if (kind === 'leap') {
    const notes = noteIndexes.map(index => events[index]), ints = notes.slice(1).map((note, index) => note.pitchMidi - notes[index].pitchMidi);
    let edge = 0; for (let index = 1; index < ints.length; index++) if (Math.abs(ints[index]) > Math.abs(ints[edge])) edge = index;
    const eventIndex = noteIndexes[edge + 1], amount = Math.min(3, Math.max(1, Math.abs(ints[edge]) - 1)); events[eventIndex] = changePitch(events[eventIndex], events[eventIndex].pitchMidi - Math.sign(ints[edge] || 1) * amount);
  } else if (kind === 'rest') {
    const rests = events.map((event, index) => event.kind === 'rest' ? index : -1).filter(index => index >= 0);
    if (rests.length) { const index = rests[Math.floor(rests.length / 2)]; events[index].durationRatio = round(events[index].durationRatio * 1.5); }
    else { const index = noteIndexes[Math.floor(noteIndexes.length / 2)]; events.splice(index + 1, 0, { kind: 'rest', pitchMidi: null, durationRatio: .5 }); }
  }
  return events;
}

export function buildCases(bases, number = 100) {
  const kinds = Object.keys(mutationLabels), cases = [];
  for (const [baseIndex, base] of bases.entries()) for (const [kindIndex, kind] of kinds.entries()) {
    const caseId = `Q-M${number}-${String(baseIndex * kinds.length + kindIndex + 1).padStart(3, '0')}`, events = resetIds(mutateEvents(baseEvents(base), kind, baseIndex), caseId);
    cases.push({
      schema: 'musicanote-motif-benchmark-case/v1', caseId, createdAt: new Date().toISOString(), status: 'generated', mutation: { kind, label: mutationLabels[kind] },
      query: { version: 1, mode: 'melody_rhythm', meter: base.meter, startsOnDownbeat: base.startsStrong, events, absoluteExactOnly: false },
      expected: { workId: base.row.id, sourceId: base.row.source, streamId: base.row.stream_id, title: base.row.title, composer: base.row.composer, partName: base.partName, family: base.family, baseStartIndex: base.start, baseStartMeasure: base.notes[0].m, baseEndMeasure: base.notes.at(-1).m, baseTargets: base.notes.map(note => ({ onset: note.o, pitchMidi: note.p, measure: note.m, beat: note.b })) },
      selection: { motifScore: base.score, repeatedInStream: base.occurrenceCount, role: base.row.role, boundaryGap: base.boundaryGap, startsStrongBeat: base.startsStrong },
    });
  }
  return cases;
}

const queryNotation = query => query.events.map(event => `${event.kind === 'rest' ? 'Rest' : event.spelling}(${round(event.durationRatio, 3)})`).join(' ');
const mappedTargets = match => (match?.alignment || []).flatMap(step => { const note = step.candidateIndex === null || step.type === 'insertion' ? null : match.work.notes[step.candidateIndex]; return note ? [{ queryIndex: step.queryIndex, onset: note.onset, pitchMidi: note.pitchMidi, measure: note.measure, measureOrdinal: note.measureOrdinal, beat: note.beat }] : []; });
const competitorEvidence = (candidate, expected) => {
  const exact = candidate.kind === 'exact' || candidate.scores.interval >= 99.5 && candidate.scores.contour >= 99.5 && candidate.scores.rhythm >= 95;
  const stronger = candidate.localSimilarity >= expected.localSimilarity + 1 && candidate.scores.interval >= expected.scores.interval - 1;
  return { qualified: exact || stronger, reason: exact ? 'exact/near-exact' : stronger ? 'stronger-local-evidence' : 'context-rerank-only' };
};

function directExpectedEvidence(item) {
  const work = getWork(item.expected.workId), all = work?.notes || [], start = item.expected.baseStartIndex;
  if (!all.length || !Number.isInteger(start)) return { available: false, reason: 'expected stream unavailable' };
  const query = annotateStructural(prepareQueryNotes(item.query.events), item.query.meter, false);
  const offset = Math.max(0, start - 5), rawWindow = all.slice(offset, Math.min(all.length, start + sounding(item.query.events).length + 6));
  const candidate = annotateStructural(rawWindow, item.query.meter, true), alignment = alignLocal(query, candidate, item.query.mode);
  if (!alignment?.path?.length) return { available: true, aligned: false };
  const pairs = alignment.path.filter(step => step.queryIndex !== null && step.candidateIndex !== null);
  const alignedQuery = pairs.map(step => query[step.queryIndex]), alignedCandidate = pairs.map(step => candidate[step.candidateIndex]);
  const scores = score(alignedQuery, alignedCandidate), span = candidate.slice(alignment.start, alignment.end + 1), rhythm = alignRhythmDtw(query, span);
  scores.rhythm = rhythm?.similarity ?? scores.rhythm;
  const structural = compareStructural(query, span), metric = metricalEvidence(query, candidate, pairs, item.query.meter, item.query.meter);
  const melodic = .7 * alignment.similarity + .3 * scores.interval, local = Math.max(0, Math.min(100, .88 * melodic + .12 * scores.rhythm + Math.max(-5, Math.min(4, metric.adjustment)) + Math.min(10, structural.bonus)));
  return { available: true, aligned: true, windowOffset: offset, alignmentStart: offset + alignment.start, alignmentEnd: offset + alignment.end, coverage: round(alignment.coverage), gaps: alignment.path.filter(step => step.type === 'insertion' || step.type === 'deletion').length, alignmentSimilarity: round(alignment.similarity), localSimilarity: round(local), scores: Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, round(value)])), metric: round(metric.score), structural: round(structural.similarity), admissionAllowed: resultAdmissionAllowed(item.query.mode, false, local, scores, structural.similarity, query.length) };
}

let verovioPromise;
async function renderVerification(xml, ids) {
  if (!xml) return { loaded: false, pageCount: 0, renderedTargets: 0, error: 'empty excerpt XML' };
  try {
    verovioPromise ||= Promise.all([import('verovio/wasm'), import('verovio/esm')]).then(async ([wasm, esm]) => new esm.VerovioToolkit(await wasm.default()));
    const toolkit = await verovioPromise; toolkit.setOptions({ pageWidth: 2400, pageHeight: 800, scale: 22, breaks: 'none', header: 'none', footer: 'none', svgViewBox: true }); toolkit.loadData(xml);
    const pageCount = toolkit.getPageCount(); let rendered = '';
    for (let page = 1; page <= pageCount; page++) rendered += toolkit.renderToSVG(page, false);
    return { loaded: pageCount > 0, pageCount, renderedTargets: ids.filter(id => rendered.includes(id)).length, renderedNoteGroups: (rendered.match(/class="note"/g) || []).length };
  } catch (error) { return { loaded: false, pageCount: 0, renderedTargets: 0, error: error instanceof Error ? error.message : String(error) }; }
}

async function evaluateCase(item, limit) {
  const started = performance.now(), result = searchDatabase(item.query, limit), elapsedMs = round(performance.now() - started, 1), matches = [...result.exact, ...result.similar];
  const workIndex = matches.findIndex(match => match.work.workId === item.expected.workId), sourceIndex = matches.findIndex(match => match.work.sourceId === item.expected.sourceId), titleIndex = matches.findIndex(match => normalizedTitle(match.work.title) === normalizedTitle(item.expected.title));
  const chosenIndex = workIndex >= 0 ? workIndex : sourceIndex, chosen = chosenIndex >= 0 ? matches[chosenIndex] : null, rank = chosenIndex + 1 || null;
  const directExpected = directExpectedEvidence(item), highlightMatch = chosen || matches[0] || null, targets = mappedTargets(highlightMatch), noteCount = sounding(item.query.events).length, mappedQuery = new Set(targets.map(target => target.queryIndex).filter(Number.isInteger));
  let highlight = { requested: targets.length, resolved: 0, unresolved: targets.length, coordinateCoverage: noteCount ? mappedQuery.size / noteCount : 0, xmlLoaded: false, renderedTargets: 0, renderTargetCoverage: 0 };
  if (highlightMatch && targets.length) {
    const ordinals = targets.map(target => target.measureOrdinal).filter(Number.isFinite), ordinalStart = Math.min(...ordinals), ordinalEnd = Math.max(...ordinals), targetText = targets.map(target => `${target.onset}:${target.pitchMidi}`).join(',');
    const work = getWork(highlightMatch.work.workId, { start: highlightMatch.startMeasure, end: highlightMatch.endMeasure, ordinalStart, ordinalEnd, targets: targetText, excerpt: '1' });
    const marked = markXmlTargets(work?.xml || '', highlightMatch.work.streamId, targets, Number(work?.previewOrdinalStart || ordinalStart) - 1), render = await renderVerification(marked.xml, marked.ids);
    highlight = { target: chosen ? 'expected-result' : 'top1-fallback', workId: highlightMatch.work.workId, requested: targets.length, resolved: marked.resolved, unresolved: marked.unresolved, coordinateCoverage: round(mappedQuery.size / Math.max(1, noteCount)), xmlLoaded: Boolean(work?.xml), verovioLoaded: render.loaded, pageCount: render.pageCount, renderedTargets: render.renderedTargets, renderTargetCoverage: round(render.renderedTargets / Math.max(1, marked.requested)), ...(render.error ? { renderError: render.error } : {}) };
  }
  const above = chosen ? matches.slice(0, chosenIndex).map((match, index) => ({ rank: index + 1, title: match.work.title, workId: match.work.workId, sourceId: match.work.sourceId, ranking: round(match.ranking), localSimilarity: round(match.localSimilarity), scores: match.scores, ...competitorEvidence(match, chosen) })) : [];
  const unqualifiedAbove = above.filter(candidate => !candidate.qualified).length;
  let assessment = !chosen ? directExpected.admissionAllowed && directExpected.localSimilarity >= 65 ? 'missed-retrieval' : 'missed-admission' : rank === 1 ? 'top1' : unqualifiedAbove === 0 ? 'displaced-by-qualified-results' : rank <= 10 ? 'review-ranking' : 'possible-ranking-problem';
  if (chosen && (highlight.resolved < highlight.requested || !highlight.verovioLoaded || highlight.renderedTargets < highlight.resolved)) assessment = `${assessment}+highlight-problem`;
  const problem = assessment === 'top1' ? '확인된 자동 문제 없음' : assessment.includes('highlight-problem') ? '일부 강조 좌표 또는 Verovio SVG target이 해석되지 않음' : assessment === 'missed-retrieval' ? '원곡 직접 정렬은 입장 기준을 통과하지만 n-gram 후보에서 Top100에 회수되지 않음' : assessment === 'missed-admission' ? '원곡 직접 정렬 자체가 현재 유사 결과 입장 기준을 통과하지 못함' : unqualifiedAbove ? `국소 선율 근거가 더 강하지 않은 상위 결과 ${unqualifiedAbove}개` : '더 강한 exact/local 근거를 가진 경쟁 결과가 상위에 있음';
  const improvement = assessment.includes('highlight-problem') ? 'XML part/staff/voice/ordinal 좌표와 렌더 target ID를 사례별 점검' : assessment === 'missed-retrieval' ? '한 음 변형에도 남는 분할 interval seed 또는 bounded fallback 후보를 검토' : assessment === 'missed-admission' ? '변형 종류별 alignment·입장 하한을 검토하되 무관 결과 증가를 함께 측정' : unqualifiedAbove ? '후보는 유지하고 melody/local 대비 문맥 가산점과 part-role 영향을 검토' : '알고리즘 변경 없이 사람 판정으로 경쟁 결과의 음악적 자격 확인';
  return { caseId: item.caseId, queryNotation: queryNotation(item.query), expected: item.expected, mutation: item.mutation, selection: item.selection, elapsedMs, resultCount: matches.length, expectedWorkRank: workIndex + 1 || null, expectedSourceRank: sourceIndex + 1 || null, equivalentTitleRank: titleIndex + 1 || null, assessment, problem, improvement, directExpected, highlight, topResults: matches.slice(0, 5).map((match, index) => ({ rank: index + 1, title: match.work.title, workId: match.work.workId, sourceId: match.work.sourceId, streamId: match.work.streamId, range: [match.startMeasure, match.endMeasure], ranking: round(match.ranking), localSimilarity: round(match.localSimilarity), scores: match.scores, targets: mappedTargets(match).map(target => `${target.onset}:${target.pitchMidi}`) })), competitorsAboveExpected: above };
}

function summary(report) {
  const completed = report.cases.filter(item => item.status === 'completed').map(item => item.result), counts = key => Object.fromEntries([...new Set(completed.map(item => item[key]))].sort().map(value => [value, completed.filter(item => item[key] === value).length]));
  const ranks = completed.map(item => item.expectedWorkRank || item.expectedSourceRank).filter(Number.isFinite).sort((a, b) => a - b), percentile = p => ranks.length ? ranks[Math.min(ranks.length - 1, Math.floor((ranks.length - 1) * p))] : null;
  return { total: report.total, completed: completed.length, top1: ranks.filter(rank => rank === 1).length, top5: ranks.filter(rank => rank <= 5).length, top10: ranks.filter(rank => rank <= 10).length, top100: ranks.length, missed: completed.length - ranks.length, medianRank: percentile(.5), p90Rank: percentile(.9), assessments: counts('assessment'), byMutation: Object.fromEntries(Object.keys(mutationLabels).map(kind => { const values = completed.filter(item => item.mutation.kind === kind), found = values.map(item => item.expectedWorkRank || item.expectedSourceRank).filter(Number.isFinite); return [kind, { count: values.length, top1: found.filter(rank => rank === 1).length, top5: found.filter(rank => rank <= 5).length, top10: found.filter(rank => rank <= 10).length, found: found.length }]; })) };
}

const escapeTable = value => String(value ?? '').replaceAll('|', '\\|').replace(/\s+/g, ' ');
function renderDocument(report) {
  const stats = summary(report), completed = report.cases.filter(item => item.status === 'completed').map(item => item.result);
  const lines = ['# Motif 기반 변형 Query 100개 실제 검색 평가', '', `작성/갱신: ${new Date().toISOString()}  `, `상태: ${report.status} (${stats.completed}/${stats.total})  `, `DB: ${report.snapshot.database.path} (${report.snapshot.database.sizeBytes} bytes, ${report.snapshot.database.mtime})  `, `검색 코드 hash: ${report.snapshot.codeHash}`, '', '## 방법과 판정 한계', '', '- 실제 DB의 높은 melody-role stream에서 10개 attack 구간을 조사하고, 음정 범위·고유 음고/음정·리듬 다양성·프레이즈성 시작·곡내 반복을 합친 휴리스틱으로 20개 원형을 골랐다. “motif” 확정 분석이나 사람의 주제 판정은 아니다.', '- 각 원형에 중간 음높이, 내부 옥타브, 국소 리듬, 도약, 쉼표 변형을 하나씩 가해 총100개를 만들었다. 특정 작품을 검색 코드에 고정하지 않는다.', '- 기대 순위는 동일 workId를 우선하고, 결과 그룹화로 대표 stream이 바뀐 경우 동일 sourceId 순위도 기록한다. 제목만 같은 다른 판본은 별도 표시한다.', '- 상위 결과의 자격은 exact/near-exact 또는 더 높은 local melody 근거인지 자동 분류한다. 작품의 실제 주제인지, 더 음악적으로 적합한지는 사람 검토 전 확정하지 않는다.', '- 강조 검증은 검색 alignment 좌표가 excerpt MusicXML의 동일 part/staff/voice/measure ordinal/beat/pitch에 해석되는지, 붉은 target ID를 넣은 XML이 Verovio SVG로 렌더되는지 검사한다. 화면 디자인의 육안 품질까지 증명하지는 않는다.', '', '## 요약', '', `- Top1 ${stats.top1}/${stats.completed}, Top5 ${stats.top5}/${stats.completed}, Top10 ${stats.top10}/${stats.completed}, Top100 ${stats.top100}/${stats.completed}, 미회수 ${stats.missed}.`, `- 회수 사례 중앙 순위 ${stats.medianRank ?? '-'}, p90 순위 ${stats.p90Rank ?? '-'}.`, '', '| 변형 | 실행 | Top1 | Top5 | Top10 | Top100 |', '|---|---:|---:|---:|---:|---:|'];
  for (const [kind, value] of Object.entries(stats.byMutation)) lines.push(`| ${mutationLabels[kind]} | ${value.count} | ${value.top1} | ${value.top5} | ${value.top10} | ${value.found} |`);
  lines.push('', '## 100개 Query 결과', '');
  for (const result of completed) {
    const rank = result.expectedWorkRank || result.expectedSourceRank || 'Top100 밖', target = `${result.expected.title} · ${result.expected.partName || result.expected.streamId} · m${result.expected.baseStartMeasure}–${result.expected.baseEndMeasure}`;
    lines.push(`### ${result.caseId} · ${result.mutation.label}`, '', `- 원형: ${target}`, `- Query: \`${result.queryNotation.replaceAll('`', '')}\``, `- 검색 결과: 기대 work 순위 ${result.expectedWorkRank ?? '-'}, 동일 source 순위 ${result.expectedSourceRank ?? '-'}, 동일 제목 판본 순위 ${result.equivalentTitleRank ?? '-'} (판정 순위 ${rank})`, `- 원곡 직접 정렬: Local ${result.directExpected.localSimilarity ?? '-'}, Interval ${result.directExpected.scores?.interval ?? '-'}, Rhythm ${result.directExpected.scores?.rhythm ?? '-'}, coverage ${result.directExpected.coverage ?? '-'}, 입장 ${result.directExpected.admissionAllowed ? '통과' : '실패'}`, `- 강조/악보 조각 (${result.highlight.target || '없음'}): Query 대응률 ${(100 * result.highlight.coordinateCoverage).toFixed(1)}%, XML ${result.highlight.resolved}/${result.highlight.requested}, SVG ${result.highlight.renderedTargets}/${result.highlight.resolved}, Verovio ${result.highlight.verovioLoaded ? '성공' : '실패'}`, `- 문제점: ${result.problem}`, `- 개선 방향: ${result.improvement}`, '', '| 순위 | 검색 결과 | 구간 | Ranking | Local | Interval | Rhythm | Meter | Structural |', '|---:|---|---|---:|---:|---:|---:|---:|---:|');
    for (const item of result.topResults) lines.push(`| ${item.rank} | ${escapeTable(item.title)} · ${escapeTable(item.streamId)} | ${escapeTable(item.range.join('–'))} | ${round(item.ranking, 1)} | ${round(item.localSimilarity, 1)} | ${round(item.scores.interval, 1)} | ${round(item.scores.rhythm, 1)} | ${round(item.scores.meter, 1)} | ${round(item.scores.structural, 1)} |`);
    if (result.competitorsAboveExpected.length) lines.push('', `상위 경쟁 결과 자동 분류: ${result.competitorsAboveExpected.filter(item => item.qualified).length}개는 exact/더 강한 local 근거, ${result.competitorsAboveExpected.filter(item => !item.qualified).length}개는 문맥 재순위화 중심이므로 사람 검토 대상.`);
    lines.push('');
  }
  if (stats.completed < stats.total) lines.push('## 미완료', '', `${stats.total - stats.completed}개가 아직 실행되지 않았다. runner를 다시 실행하면 완료 사례를 보존하고 이어서 진행한다.`, '');
  return `${lines.join('\n')}\n`;
}

function snapshot() { const stat = statSync(dbPath); return { database: { path: dbPath, sizeBytes: stat.size, mtime: stat.mtime.toISOString() }, codeHash: sha256(codePaths.map(path => readFileSync(path)).join('\0')) }; }

export function prepare() {
  const database = new DatabaseSync(dbPath, { readOnly: true }); database.exec('PRAGMA query_only=ON; PRAGMA mmap_size=4294967296; PRAGMA cache_size=-262144');
  const excludeSources = new Set();
  for (const priorSuiteNumber of supportedSuites
    .map(name => Number(name.slice('motif-'.length)))
    .filter(number => number < suiteNumber)) {
    const priorSuitePath = resolve(root, `evaluation/motif-${priorSuiteNumber}/cases.jsonl`);
    if (!existsSync(priorSuitePath)) continue;
    for (const line of readFileSync(priorSuitePath, 'utf8').trim().split(/\r?\n/).filter(Boolean)) {
      const sourceId = JSON.parse(line).expected?.sourceId;
      if (sourceId) excludeSources.add(sourceId);
    }
  }
  const cases = buildCases(selectBaseMotifs(database, 20, excludeSources), suiteNumber);
  atomicWrite(casePath, `${cases.map(item => JSON.stringify(item)).join('\n')}\n`);
  return cases;
}

async function run(max = 100) {
  const cases = (existsSync(casePath) ? readFileSync(casePath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse) : prepare()).slice(0, max), current = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null, meta = snapshot();
  const prior = current?.snapshot?.codeHash === meta.codeHash && current?.snapshot?.database?.sizeBytes === meta.database.sizeBytes && current?.snapshot?.database?.mtime === meta.database.mtime ? new Map(current.cases.map(item => [item.caseId, item])) : new Map();
  const report = { schema: 'musicanote-motif-100-run/v1', suite: suiteName, status: 'incomplete', startedAt: current?.startedAt || new Date().toISOString(), completedAt: null, total: cases.length, limit: 100, snapshot: meta, cases: [] };
  for (const item of cases) {
    const previous = prior.get(item.caseId);
    if (previous?.status === 'completed' && previous.queryHash === sha256(JSON.stringify(item.query))) report.cases.push(previous);
    else report.cases.push({ caseId: item.caseId, status: 'pending', queryHash: sha256(JSON.stringify(item.query)) });
  }
  atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`); atomicWrite(documentPath, renderDocument(report));
  for (let index = 0; index < cases.length; index++) {
    if (report.cases[index].status === 'completed') continue;
    try { report.cases[index] = { caseId: cases[index].caseId, status: 'completed', queryHash: sha256(JSON.stringify(cases[index].query)), result: await evaluateCase(cases[index], 100) }; }
    catch (error) { report.cases[index] = { caseId: cases[index].caseId, status: 'error', queryHash: sha256(JSON.stringify(cases[index].query)), error: error instanceof Error ? error.stack : String(error) }; }
    atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`); atomicWrite(documentPath, renderDocument(report));
    console.log(`[${index + 1}/${cases.length}] ${cases[index].caseId} ${report.cases[index].status}${report.cases[index].result ? ` rank=${report.cases[index].result.expectedWorkRank || report.cases[index].result.expectedSourceRank || '-'} ${report.cases[index].result.assessment}` : ''}`);
  }
  report.status = report.cases.every(item => item.status === 'completed') ? 'complete' : 'completed-with-errors'; report.completedAt = new Date().toISOString(); report.summary = summary(report);
  atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`); atomicWrite(documentPath, renderDocument(report));
  return report;
}

async function main() {
  const command = process.argv[2] || 'all', maxArg = process.argv.indexOf('--max'), max = maxArg >= 0 ? Number(process.argv[maxArg + 1]) : 100;
  if (!['prepare', 'run', 'all'].includes(command) || !Number.isInteger(max) || max < 1 || max > 100) throw new Error('Usage: node scripts/motif-100-benchmark.mjs prepare|run|all [--suite motif-100|motif-200|motif-300] [--max 1..100]');
  if (command === 'prepare' || command === 'all') console.log(`Prepared ${prepare().length} cases at ${casePath}`);
  if (command === 'run' || command === 'all') { const report = await run(max); console.log(JSON.stringify(report.summary, null, 2)); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
