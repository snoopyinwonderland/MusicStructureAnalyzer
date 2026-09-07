const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const text = (xml, tag) => xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.replace(/<[^>]+>/g, '').trim();
const midi = note => {
  if (/<rest\b/.test(note)) return null;
  const step = text(note, 'step'), octave = Number(text(note, 'octave')), alter = Number(text(note, 'alter') || 0);
  const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step];
  return Number.isFinite(pc) && Number.isFinite(octave) ? (octave + 1) * 12 + pc + alter : null;
};

export function positionedXmlNotes(xml, streamId, measureOrdinalOffset = 0) {
  const [partId, defaultStaff = '1', defaultVoice = '1'] = String(streamId).split(':');
  const partPattern = new RegExp(`<part\\s+id=["']${escapeRegex(partId)}["'][^>]*>([\\s\\S]*?)<\\/part>`);
  const part = partPattern.exec(xml);
  if (!part) return [];
  const partBase = (part.index || 0) + part[0].indexOf(part[1]);
  const output = [];
  let divisions = 1;
  for (const [measureIndex, measure] of [...part[1].matchAll(/<measure(?=[\s>])([^>]*)>([\s\S]*?)<\/measure>/g)].entries()) {
    const body = measure[2], bodyBase = partBase + (measure.index || 0) + measure[0].indexOf(body);
    let cursor = 0, lastOnset = 0;
    const elements = [...body.matchAll(/<attributes\b[\s\S]*?<\/attributes>|<backup\b[\s\S]*?<\/backup>|<forward\b[\s\S]*?<\/forward>|<note\b[\s\S]*?<\/note>/g)];
    for (const element of elements) {
      const block = element[0], duration = Number(text(block, 'duration') || 0);
      if (block.startsWith('<attributes')) { const declared = Number(text(block, 'divisions')); if (declared > 0) divisions = declared; continue; }
      if (block.startsWith('<backup')) { cursor -= duration; continue; }
      if (block.startsWith('<forward')) { cursor += duration; continue; }
      const chord = /<chord\b/.test(block), grace = /<grace\b/.test(block), onset = chord ? lastOnset : cursor;
      output.push({
        start: bodyBase + (element.index || 0), end: bodyBase + (element.index || 0) + block.length,
        block, partId, staff: text(block, 'staff') || defaultStaff, voice: text(block, 'voice') || defaultVoice,
        measureOrdinal: measureOrdinalOffset + measureIndex + 1, beat: 1 + onset / divisions,
        pitchMidi: midi(block), isRest: /<rest\b/.test(block), chord,
      });
      if (!chord) lastOnset = onset;
      if (!chord && !grace) cursor += duration;
    }
  }
  return output;
}

export function markXmlTargets(xml, streamId, targets, measureOrdinalOffset = 0) {
  const positioned = positionedXmlNotes(xml, streamId, measureOrdinalOffset), used = new Set(), matches = [];
  for (const [targetIndex, target] of (targets || []).entries()) {
    const index = positioned.findIndex((note, noteIndex) => !used.has(noteIndex) && !note.isRest && note.staff === String(streamId).split(':')[1] && note.voice === String(streamId).split(':')[2] && note.measureOrdinal === Number(target.measureOrdinal) && Math.abs(note.beat - Number(target.beat)) < 1e-6 && note.pitchMidi === Number(target.pitchMidi));
    if (index < 0) continue;
    used.add(index);
    matches.push({ targetIndex, noteIndex: index, id: `benchmark-target-${targetIndex}` });
  }
  let markedXml = xml;
  for (const match of [...matches].sort((a, b) => positioned[b.noteIndex].start - positioned[a.noteIndex].start)) {
    const note = positioned[match.noteIndex];
    const marked = note.block.replace(/^<note\b/, `<note id="${match.id}" color="#c9473f"`);
    markedXml = `${markedXml.slice(0, note.start)}${marked}${markedXml.slice(note.end)}`;
  }
  return { xml: markedXml, requested: targets?.length || 0, resolved: matches.length, unresolved: (targets?.length || 0) - matches.length, ids: matches.map(match => match.id), positionedCount: positioned.length };
}
