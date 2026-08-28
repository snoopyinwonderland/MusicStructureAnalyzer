const SHARP=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const FLAT=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
export const pitchName=(midi:number,flat=false)=>`${(flat?FLAT:SHARP)[midi%12]}${Math.floor(midi/12)-1}`;
export const isBlack=(midi:number)=>[1,3,6,8,10].includes(midi%12);
