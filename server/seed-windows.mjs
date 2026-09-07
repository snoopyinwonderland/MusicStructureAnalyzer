// Experimental: bounded, merged neighborhoods of retrieval seeds.
// No seed evidence means retain the full-stream fallback.
export function seedWindows(entries, noteCount, limit = 12) {
  const selected = [];
  for (const [key, evidence] of [...entries].sort((a,b) => b[1]-a[1])) {
    const position = Number(key.split('\u0000')[1]);
    if (!Number.isFinite(position) || selected.some(w => Math.abs(w.position-position)<noteCount)) continue;
    selected.push({position, start:Math.max(0,position-noteCount), end:Math.max(0,position)+noteCount*2, evidence});
    if (selected.length >= limit) break;
  }
  const merged = [];
  for (const window of selected.sort((a,b)=>a.start-b.start)) {
    const previous = merged.at(-1);
    if (previous && window.start <= previous.end) {
      previous.end = Math.max(previous.end,window.end);
      previous.evidence = Math.max(previous.evidence,window.evidence);
    } else merged.push({...window});
  }
  return merged;
}
