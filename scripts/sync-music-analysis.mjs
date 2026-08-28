import fs from 'node:fs';
import path from 'node:path';

const source = process.argv[2] || 'K:/Music Analysis/output/latest-canonical-ir-review/canonical_music_ir_v0.1.json';
const destination = path.resolve('src/search/music-analysis-corpus.json');
const ir = JSON.parse(fs.readFileSync(source, 'utf8'));
const youtubeCachePath=path.resolve('data/youtube-matches.json');
const youtubeCache=fs.existsSync(youtubeCachePath)?JSON.parse(fs.readFileSync(youtubeCachePath,'utf8')):{works:{}};
const youtubeKey=ir.score.title.replace(/\.musicxml$/i,'').replace(/^\s*\d+\.?\s*/,'').replace(/\b(?:piano\s+solo|melody|violin|viola|cello|contrabass|duet|trio|quartet|string\s+orchestra|piano\s+quintet)\b/gi,' ').replace(/[,_]+/g,' ').replace(/\s+/g,' ').trim().toLocaleLowerCase('en-US');
const q = value => value.numerator / value.denominator;
const measureById = new Map(ir.measures.map(m => [m.measure_id, m]));
const noteById = new Map(ir.note_events.map(n => [n.note_id, n]));

// Use the uppermost attack at each onset in the busiest pitched part as the temporary melody stream.
const partCounts = new Map();
for (const n of ir.note_events) partCounts.set(n.part_id, (partCounts.get(n.part_id) || 0) + 1);
const partId = [...partCounts].sort((a,b) => b[1]-a[1])[0][0];
const attacks = ir.attack_events.map(a => noteById.get(a.note_id)).filter(n => n?.part_id === partId && !n.grace?.is_grace);
const grouped = new Map();
for (const note of attacks) {
  const onset = q(note.global_onset_quarter);
  const previous = grouped.get(onset);
  if (!previous || note.concert_pitch.midi_pitch > previous.concert_pitch.midi_pitch) grouped.set(onset, note);
}
const notes = [...grouped.values()].sort((a,b) => q(a.global_onset_quarter)-q(b.global_onset_quarter)).map((n,index) => {
  const measure = measureById.get(n.measure_id); const beat = q(n.onset_in_measure)+1; const duration = q(n.notated_duration_quarter);
  return { id:n.note_id, kind:'note', pitchMidi:n.concert_pitch.midi_pitch, spelling:n.concert_pitch.spelling, durationRatio:duration,
    measure:measure.sequential_measure_index+1, beat, metricStrength:beat===1?1:beat%1===0?.55:.3,
    structuralSalience:Math.min(1,.3+(beat===1?.3:0)+Math.min(duration,4)*.1), structuralConfidence:.55,
    chordRole:n.chord_member?'chord_tone':'unknown', sourceIndex:index };
});
const output = { source:'music-analysis-canonical-ir', schemaVersion:ir.schema_version, generatedAt:new Date().toISOString(), work:{
  workId:ir.score.score_id, sourceId:ir.score.source_file_id, streamId:`${partId}-upper-attacks`, title:ir.score.title.replace(/\.musicxml$/i,''),
  artist:ir.score.composer || 'Music Analysis corpus', year:'—', genre:'MusicXML', accent:'#416b73', notes,
  melodyRoleScore:.62, roleConfidence:.55, analysisConfidence:.55, prominence:.65,
  ...(youtubeCache.works?.[youtubeKey]?.videoId?{youtubeId:youtubeCache.works[youtubeKey].videoId}:{})
}};
fs.writeFileSync(destination, JSON.stringify(output,null,2)+'\n');
console.log(`Wrote ${notes.length} melody events to ${destination}`);
