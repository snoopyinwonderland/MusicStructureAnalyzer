// Deterministic MusicXML event extraction for boundary-harmony evidence.
// This transitional adapter preserves chord members and tie segments that the
// monophonic search index intentionally omits. Canonical IR should replace it.
const value=(body,tag)=>body.match(new RegExp(`<${tag}(?:\\s[^>]*)?>\\s*([^<]+?)\\s*</${tag}>`))?.[1];
const attr=(attrs,name)=>attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const pitchMidi=body=>{
  const step=value(body,'step'),octave=Number(value(body,'octave')),alter=Number(value(body,'alter')||0),base={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[step];
  return base===undefined||!Number.isFinite(octave)?null:(octave+1)*12+base+alter;
};

export function musicXmlHarmonyStreams(xml){
  const streams=new Map();
  for(const partMatch of String(xml||'').matchAll(/<part\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/part>/g)){
    const [,partId,partBody]=partMatch;let divisions=1,globalQuarter=0;
    for(const measureMatch of partBody.matchAll(/<measure(?=[\s>])([^>]*)>([\s\S]*?)<\/measure>/g)){
      const [,measureAttrs,measureBody]=measureMatch,declaredMeasure=attr(measureAttrs,'number');
      divisions=Number(value(measureBody,'divisions'))||divisions;
      let cursor=0,maximum=0,lastOnset=0,lastVoice='1',lastStaff='1';
      for(const token of measureBody.matchAll(/<(note|backup|forward)\b[^>]*>([\s\S]*?)<\/\1>/g)){
        const kind=token[1],body=token[2],durationDivisions=Number(value(body,'duration')||0);
        if(kind==='backup'){cursor-=durationDivisions;continue}
        if(kind==='forward'){cursor+=durationDivisions;maximum=Math.max(maximum,cursor);continue}
        const chord=/<chord\b/.test(body),grace=/<grace\b/.test(body),rest=/<rest\b/.test(body),onsetDivisions=chord?lastOnset:cursor;
        if(!chord)lastOnset=onsetDivisions;
        const voice=value(body,'voice')||lastVoice,staff=value(body,'staff')||lastStaff;lastVoice=voice;lastStaff=staff;
        if(!rest&&!grace){
          const midi=pitchMidi(body),step=value(body,'step'),alter=Number(value(body,'alter')||0),octave=value(body,'octave');
          if(midi!==null){const streamId=`${partId}:${staff}:${voice}`,notes=streams.get(streamId)||[];notes.push({p:midi,s:`${step}${alter===1?'#':alter===-1?'b':alter===2?'##':alter===-2?'bb':''}${octave}`,o:globalQuarter+onsetDivisions/divisions,d:durationDivisions/divisions,m:Number.isFinite(Number(declaredMeasure))?Number(declaredMeasure):declaredMeasure,b:1+onsetDivisions/divisions,ts:/<tie\b[^>]*type="start"/.test(body),te:/<tie\b[^>]*type="stop"/.test(body),chordMember:chord});streams.set(streamId,notes)}
        }
        if(!chord&&!grace){cursor+=durationDivisions;maximum=Math.max(maximum,cursor)}
      }
      globalQuarter+=maximum/divisions;
    }
  }
  return [...streams].map(([streamId,notes])=>({streamId,notes}));
}
