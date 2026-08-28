import type { AlignmentStep, CorpusNote, MatchResult, Query, QueryEvent, Work } from '../types';
import { SEARCH_CONFIG as C } from './config';
import { collapseTies, contour, featureVector, intervals, ngrams, normalizedDurations, sounding } from './features';

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const mean = (xs: number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
const overlap = (a: string[], b: string[]) => { const bs = new Set(b); return a.length ? a.filter(x => bs.has(x)).length / a.length : 0 };

export function exactMatch(query: Query, notes: CorpusNote[]) {
  const q = sounding(query.events), c = notes.filter((e):e is CorpusNote=>e.kind==='note'&&e.pitchMidi!==null); if (q.length > c.length) return -1;
  const qi = intervals(q), qd = normalizedDurations(q);
  for (let start=0; start <= c.length-q.length; start++) {
    const slice = c.slice(start,start+q.length); if (slice[0].beat !== 1) continue;
    if (intervals(slice).every((v,i)=>v===qi[i]) && (query.mode==='melody' || normalizedDurations(slice).every((v,i)=>Math.abs(v-qd[i])<=C.exactRhythmEpsilon))) return start;
  } return -1;
}

function localCost(q: QueryEvent, c: CorpusNote, prevQ: QueryEvent | undefined, prevC: CorpusNote | undefined, mode: Query['mode']) {
  if (q.kind !== c.kind) return .75;
  if (q.kind === 'rest') return Math.min(1, Math.abs(q.durationRatio-c.durationRatio)/2);
  const w=C.weights[mode], intervalQ=prevQ?.pitchMidi==null?0:q.pitchMidi!-prevQ.pitchMidi, intervalC=prevC?.pitchMidi==null?0:c.pitchMidi!-prevC.pitchMidi;
  const relPitch=Math.min(1,Math.abs((intervalQ)-(intervalC))/12), intCost=Math.min(1,Math.abs(intervalQ-intervalC)/7);
  const cq=contour(prevQ?[prevQ,q]:[q])[0], cc=contour(prevC?[prevC,c]:[c])[0];
  const rhythm=Math.min(1,Math.abs(q.durationRatio-c.durationRatio)/Math.max(q.durationRatio,c.durationRatio));
  const importance=1+.20*c.metricStrength+.25*c.structuralSalience*c.structuralConfidence;
  const ornament=c.chordRole==='passing'||c.chordRole==='neighbor';
  return (w.pitch*relPitch+w.interval*intCost+w.contour*(cq===cc?0:1)+w.rhythm*rhythm)*importance*(ornament?.78:1);
}

function align(query: Query, candidate: CorpusNote[]) {
  const q=query.events, n=q.length, m=candidate.length, inf=1e9, dp=Array.from({length:n+1},()=>Array(m+1).fill(inf));
  const back=Array.from({length:n+1},()=>Array<{i:number;j:number;type:AlignmentStep['type']}|null>(m+1).fill(null)); dp[0][0]=0;
  for(let i=0;i<=n;i++) for(let j=0;j<=m;j++) { if(i===0&&j===0)continue;
    if(i&&j){const cost=dp[i-1][j-1]+localCost(q[i-1],candidate[j-1],q[i-2],candidate[j-2],query.mode);if(cost<dp[i][j]){dp[i][j]=cost;back[i][j]={i:i-1,j:j-1,type:cost-dp[i-1][j-1]<.18?'match':'substitution'}}}
    if(i){const cost=dp[i-1][j]+.48;if(cost<dp[i][j]){dp[i][j]=cost;back[i][j]={i:i-1,j,type:'deletion'}}}
    if(j){const ornamental=candidate[j-1].chordRole==='passing'||candidate[j-1].chordRole==='neighbor';const cost=dp[i][j-1]+(ornamental?.18:.48);if(cost<dp[i][j]){dp[i][j]=cost;back[i][j]={i,j:j-1,type:'insertion'}}}
  }
  const path:AlignmentStep[]=[];let i=n,j=m;while(i||j){const b=back[i][j];if(!b)break;path.push({queryIndex:b.type==='insertion'?null:i-1,candidateIndex:b.type==='deletion'?null:j-1,cost:Math.max(0,dp[i][j]-dp[b.i][b.j]),type:b.type});i=b.i;j=b.j}
  return {distance:dp[n][m]/Math.max(n,m),path:path.reverse()};
}

function candidateStarts(query: Query, work: Work) {
  const qf=featureVector(query.events), qTokens=[...ngrams(qf.intervals,3),...ngrams(qf.contour,3)];
  return work.notes.map((note,i)=>({i,note})).filter(x=>x.note.beat===1).map(x=>{const slice=work.notes.slice(x.i,x.i+query.events.length+2);const sf=featureVector(slice);return {start:x.i,score:overlap(qTokens,[...ngrams(sf.intervals,3),...ngrams(sf.contour,3)])}}).sort((a,b)=>b.score-a.score);
}

function componentScores(q: QueryEvent[], c: CorpusNote[]) {
  const qf=featureVector(q), cf=featureVector(c), pitch=100-mean(qf.relative.map((x,i)=>Math.min(100,Math.abs(x-(cf.relative[i]??x+12))*12))), interval=100-mean(qf.intervals.map((x,i)=>Math.min(100,Math.abs(x-(cf.intervals[i]??x+7))*14))), rhythm=100-mean(qf.durations.map((x,i)=>Math.min(100,Math.abs(x-(cf.durations[i]??x+1))*55)));
  return {pitch:clamp(pitch),interval:clamp(interval),contour:clamp(100*(1-mean(qf.contour.map((x,i)=>x==cf.contour[i]?0:1)))),rhythm:clamp(rhythm),meter:clamp(mean(c.map(n=>n.metricStrength))*100),structural:clamp(mean(c.map(n=>n.structuralSalience*n.structuralConfidence))*100)};
}

export function search(query: Query, works: Work[]): {exact:MatchResult[];similar:MatchResult[]} {
  if (!sounding(query.events).length) return { exact: [], similar: [] };
  query={...query,events:collapseTies(query.events)};
  const exact:MatchResult[]=[], similar:MatchResult[]=[];
  for(const work of works){ const ei=exactMatch(query,work.notes); const starts=candidateStarts(query,work); const start=ei>=0?ei:(starts[0]?.start??0); const slice=work.notes.slice(start,start+query.events.length+2); const {distance,path}=align(query,slice); const scores=componentScores(query.events,slice); const local=ei>=0?100:100*Math.exp(-distance/C.tau); const importance=100*(.40*work.melodyRoleScore+.25*work.prominence+.15*mean(slice.map(n=>n.metricStrength))+.10*.7+.10*mean(slice.map(n=>n.structuralSalience))); const ranking=ei>=0?100:C.ranking.similarity*local+C.ranking.importance*importance+C.ranking.confidence*work.analysisConfidence*100;
    const first=slice[0]??work.notes[0],last=slice.at(-1)??first; const r:MatchResult={kind:ei>=0?'exact':'similar',work,ranking:clamp(ranking),localSimilarity:clamp(local),occurrenceImportance:clamp(importance),scores,startMeasure:first.measure,startBeat:first.beat,endMeasure:last.measure,alignment:path,why:ei>=0?['음정 간격 배열이 전조와 무관하게 정확히 일치합니다.','마디 첫 박에서 시작하는 프레이즈가 확인되었습니다.']:[`${path.filter(p=>p.type==='match').length}개 음이 정렬 경로에서 직접 대응됩니다.`,`${scores.structural.toFixed(0)}점의 구조적 맥락과 ${scores.meter.toFixed(0)}점의 박자 위치가 순위를 보정했습니다.`]}; (ei>=0?exact:similar).push(r)}
  return {exact:exact.sort((a,b)=>b.ranking-a.ranking),similar:similar.sort((a,b)=>b.ranking-a.ranking)};
}
