import type { CorpusNote, Work } from '../types';
import musicAnalysis from './music-analysis-corpus.json';
const N=(p:number,d:number,measure:number,beat:number,role:CorpusNote['chordRole']='chord_tone',salience=.7):CorpusNote=>({id:`n-${measure}-${beat}-${p}`,kind:'note',pitchMidi:p,spelling:'',durationRatio:d,measure,beat,metricStrength:beat===1?1:beat===3?.65:.35,structuralSalience:salience,structuralConfidence:.78,chordRole:role});
const seq=(pitches:number[],durations:number[]=pitches.map(()=>1),startMeasure=1)=>pitches.map((p,i)=>N(p,durations[i],startMeasure+Math.floor(i/4),(i%4)+1,i%4===1?'passing':'chord_tone',i%4===0?.88:.55));
const analysisWork = musicAnalysis.work as unknown as Work;
export const CORPUS:Work[]=[analysisWork];
export const FIXTURE_CORPUS:Work[]=[
 {workId:'fixture-transposition',sourceId:'fixture',streamId:'fixture-1',title:'Regression transposition fixture',artist:'Search harness',year:'—',genre:'Test fixture',accent:'#d95f43',notes:seq([65,67,69,72,74,72,69,67]),melodyRoleScore:.7,roleConfidence:.5,analysisConfidence:.5,prominence:.5},
 {workId:'fixture-rhythm',sourceId:'fixture',streamId:'fixture-2',title:'Regression rhythm fixture',artist:'Search harness',year:'—',genre:'Test fixture',accent:'#7765a8',notes:seq([60,62,64,67,69,67,65,64],[1,.5,.5,1,1,.5,.5,1],12),melodyRoleScore:.7,roleConfidence:.5,analysisConfidence:.5,prominence:.5}
];
