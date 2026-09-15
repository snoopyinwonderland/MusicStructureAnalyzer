import {positionedXmlNotes} from './xml-target-verification.mjs';

// Transitional adapter: original XML coordinates remain attached to each cue.
export function attachBreathSymbols(notes,xml,streamId){
 const [,staff='1',voice='1']=streamId.split(':');
 const symbols=positionedXmlNotes(xml,streamId).filter(n=>n.staff===staff&&n.voice===voice&&/<(?:fermata|breath-mark|caesura)\b/.test(n.block));
 return notes.map(note=>{
  const source=symbols.filter(n=>n.measureOrdinal===Number(note.measureOrdinal)&&Math.abs(n.beat-Number(note.beat))<1e-6&&n.pitchMidi===note.pitchMidi);
  return {...note,breathSymbols:source.flatMap(n=>['fermata','breath-mark','caesura'].filter(name=>new RegExp(`<${name}\\b`).test(n.block)).map(type=>({type,source:{partId:n.partId,staff:n.staff,voice:n.voice,measureOrdinal:n.measureOrdinal,beat:n.beat,xmlStart:n.start,xmlEnd:n.end}})))};
 });
}

export function applyBreathSymbolEvidence(notes,boundaries){
 for(let index=0;index<notes.length;index++){
  const symbols=notes[index].breathSymbols;if(!symbols?.length)continue;
  // Hold through notated tie continuations. Do not invent performed duration.
  let next=index+1;while(next<notes.length&&(notes[next].isAttack===false||notes[next].tieStop))next++;
  const boundary=boundaries[next];if(!boundary||next>=notes.length)continue;
  const prior=boundary.strength;
  for(const symbol of symbols){
   const support=symbol.type==='caesura'?.7:symbol.type==='breath-mark'?.55:.45;
   boundary.cues.push({name:'notated-breath-symbol',strength:support,evidence:{...symbol,noteIndex:index,boundaryIndex:next,meaning:'possible articulation, not confirmed Phrase ending'}});
   boundary.strength=Math.max(boundary.strength,support,prior>=.25?Math.min(.9,prior+support*.5):0);
  }
 }
}
