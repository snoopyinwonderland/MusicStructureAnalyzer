import type { CorpusNote } from '../types';

export type MotifTransformation = 'transposition'|'pitch-substitution'|'ornament-insertion'|'note-deletion'|'rhythm-variation'|'repeat-expansion'|'terminal-extension';
export type MotifSimilarityEvidence = {
  similarity:number; melodic:number; interval:number; contour:number; shape:number;
  rhythm:number; coverage:number; matchedNotes:number;
  transformations:MotifTransformation[];
  alignment:Array<{leftIndex:number|null;rightIndex:number|null;type:'match'|'substitution'|'insertion'|'deletion'}>;
};

const clamp=(value:number)=>Math.max(0,Math.min(1,value));
const score=(cost:number)=>Math.round(100*clamp(1-cost));
const median=(values:number[])=>{const sorted=values.filter(value=>Number.isFinite(value)&&value>0).sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:1};
const sign=(value:number)=>value===0?0:value>0?1:-1;
const intervalClass=(value:number)=>value===0?0:Math.abs(value)<=2?1:2;
const logDistance=(left:number,right:number)=>Math.min(1,Math.abs(Math.log2(Math.max(.0625,left)/Math.max(.0625,right)))/2);

function features(notes:CorpusNote[]){
  const durations=notes.map(note=>Math.max(.0625,Number(note.durationRatio)||.0625)),durationUnit=median(durations);
  const iois=notes.slice(1).map((note,index)=>Math.max(.0625,Number(note.onset)-Number(notes[index].onset))).filter(Number.isFinite),ioiUnit=median(iois);
  return notes.map((note,index)=>({
    pitch:Number(note.pitchMidi), duration:durations[index]/durationUnit,
    ioi:index?Math.max(.0625,Number(note.onset)-Number(notes[index-1].onset))/ioiUnit:1,
    incoming:index?Number(note.pitchMidi)-Number(notes[index-1].pitchMidi):0,
    metric:Number.isFinite(Number(note.metricStrength))?Number(note.metricStrength):null,
  }));
}

/** Uncalibrated, transposition-invariant Motif evidence. Dynamic alignment allows
 * ornament insertion/deletion and repeat expansion without hiding channel scores. */
export function compareMotifs(left:CorpusNote[],right:CorpusNote[]):MotifSimilarityEvidence{
  if(!left.length||!right.length)return{similarity:0,melodic:0,interval:0,contour:0,shape:0,rhythm:0,coverage:0,matchedNotes:0,transformations:[],alignment:[]};
  // A gap must be costly enough that equal-length short figures are compared as
  // substitutions instead of being made deceptively similar by a delete+insert.
  const a=features(left),b=features(right),rows=a.length+1,cols=b.length+1,gap=.48;
  const dp=Array.from({length:rows},()=>Array(cols).fill(0)),back=Array.from({length:rows},()=>Array(cols).fill(''));
  for(let i=1;i<rows;i++){dp[i][0]=i*gap;back[i][0]='deletion'}
  for(let j=1;j<cols;j++){dp[0][j]=j*gap;back[0][j]='insertion'}
  const pairCost=(i:number,j:number)=>{
    if(i===0||j===0)return .18*logDistance(a[i].duration,b[j].duration);
    const interval=Math.min(1,Math.abs(a[i].incoming-b[j].incoming)/7),contour=a[i].incoming===0&&b[j].incoming===0?0:sign(a[i].incoming)===sign(b[j].incoming)?0:.8;
    const shape=intervalClass(a[i].incoming)===intervalClass(b[j].incoming)?0:.45;
    const rhythm=.55*logDistance(a[i].duration,b[j].duration)+.45*logDistance(a[i].ioi,b[j].ioi);
    const metric=a[i].metric===null||b[j].metric===null?0:Math.min(1,Math.abs(a[i].metric-b[j].metric));
    return .4*interval+.18*contour+.12*shape+.25*rhythm+.05*metric;
  };
  for(let i=1;i<rows;i++)for(let j=1;j<cols;j++){
    const options=[{v:dp[i-1][j-1]+pairCost(i-1,j-1),t:'match'},{v:dp[i-1][j]+gap,t:'deletion'},{v:dp[i][j-1]+gap,t:'insertion'}].sort((x,y)=>x.v-y.v);
    dp[i][j]=options[0].v;back[i][j]=options[0].t;
  }
  const alignment:MotifSimilarityEvidence['alignment']=[];let i=a.length,j=b.length;
  while(i||j){const type=back[i][j];if(type==='match'){const substitution=pairCost(i-1,j-1)>.16;alignment.push({leftIndex:--i,rightIndex:--j,type:substitution?'substitution':'match'})}else if(type==='deletion'){alignment.push({leftIndex:--i,rightIndex:null,type:'deletion'})}else{alignment.push({leftIndex:null,rightIndex:--j,type:'insertion'})}}
  alignment.reverse();
  const pairs=alignment.filter(step=>step.leftIndex!==null&&step.rightIndex!==null) as Array<{leftIndex:number;rightIndex:number;type:'match'|'substitution'}>;
  const intervalCosts:number[]=[],contourCosts:number[]=[],shapeCosts:number[]=[],rhythmCosts:number[]=[];
  for(let k=1;k<pairs.length;k++){
    const prior=pairs[k-1],current=pairs[k],li=left[current.leftIndex].pitchMidi!-left[prior.leftIndex].pitchMidi!,ri=right[current.rightIndex].pitchMidi!-right[prior.rightIndex].pitchMidi!;
    intervalCosts.push(Math.min(1,Math.abs(li-ri)/7));contourCosts.push(li===0&&ri===0?0:sign(li)===sign(ri)?0:1);shapeCosts.push(intervalClass(li)===intervalClass(ri)?0:1);
  }
  for(const pair of pairs)rhythmCosts.push(.55*logDistance(a[pair.leftIndex].duration,b[pair.rightIndex].duration)+.45*logDistance(a[pair.leftIndex].ioi,b[pair.rightIndex].ioi));
  const mean=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
  const interval=score(mean(intervalCosts)),contour=score(mean(contourCosts)),shape=score(.65*mean(contourCosts)+.35*mean(shapeCosts)),rhythm=score(mean(rhythmCosts));
  const coverage=Math.round(100*pairs.length/Math.max(left.length,right.length)),melodic=Math.round(.65*interval+.35*contour);
  const similarity=Math.round(.4*melodic+.2*shape+.25*rhythm+.15*coverage),transformations=new Set<MotifTransformation>();
  const pitchShift=right[pairs[0]?.rightIndex??0].pitchMidi!-left[pairs[0]?.leftIndex??0].pitchMidi!;if(pitchShift)transformations.add('transposition');
  if(alignment.some(step=>step.type==='insertion'))transformations.add('ornament-insertion');if(alignment.some(step=>step.type==='deletion'))transformations.add('note-deletion');
  if(interval<99)transformations.add('pitch-substitution');if(rhythm<99)transformations.add('rhythm-variation');
  if(alignment.some((step,index)=>step.type==='insertion'&&step.rightIndex!==null&&right[step.rightIndex].pitchMidi===right[alignment[index-1]?.rightIndex??-1]?.pitchMidi))transformations.add('repeat-expansion');
  const lastLeft=left.at(-1)!,lastRight=right.at(-1)!;
  if(Number(lastRight.pitchMidi)-Number(lastLeft.pitchMidi)===pitchShift&&Math.abs(lastLeft.durationRatio-lastRight.durationRatio)>.25)transformations.add('terminal-extension');
  return{similarity,melodic,interval,contour,shape,rhythm,coverage,matchedNotes:pairs.length,transformations:[...transformations],alignment};
}
