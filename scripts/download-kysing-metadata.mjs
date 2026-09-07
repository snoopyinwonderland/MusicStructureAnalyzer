import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDir = resolve(process.argv[2] || 'data/kysing-metadata');
const xmlRoot = resolve(process.argv[3] || 'U:/KYSing_MusicXML');
const date = new Date().toISOString().slice(0, 10);
const byNumber = new Map();
const requests = [];

for (let digit = 1; digit <= 9; digit++) {
  const url = `https://api.manana.kr/karaoke/no/${digit}/kumyoung.json`;
  const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'MUSICANOTE metadata importer/1.0' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const rows = await response.json();
  requests.push({ digit, rows: rows.length });
  for (const row of rows) {
    if (row.brand !== 'kumyoung' || !/^\d+$/.test(String(row.no || ''))) continue;
    const number = String(Number(row.no));
    if (!byNumber.has(number)) byNumber.set(number, {
      ...row,
      no: String(row.no).trim(),
      title: String(row.title || '').trim(),
      singer: String(row.singer || '').trim(),
      composer: String(row.composer || '').trim(),
      lyricist: String(row.lyricist || '').trim(),
    });
  }
  process.stdout.write(`digit ${digit}: ${rows.length} rows, ${byNumber.size} unique\n`);
}

const songs = [...byNumber.values()].sort((a, b) => Number(a.no) - Number(b.no));
const snapshot = { schema: 'musicanote-kysing-metadata', version: 1, fetchedAt: new Date().toISOString(), source: 'https://api.manana.kr/karaoke', requests, songs };
await mkdir(outputDir, { recursive: true });
const jsonPath = resolve(outputDir, `kumyoung-${date}-all.json`);
await writeFile(jsonPath, JSON.stringify(snapshot), 'utf8');
const xmlFiles = (await readdir(xmlRoot)).filter(name => /^\d+\.xml$/i.test(name));
const songNumbers = new Set(songs.map(song => String(Number(song.no))));
const unmatchedFiles = xmlFiles.filter(name => !songNumbers.has(String(Number(name.replace(/\.xml$/i, '')))));
const report = {
  jsonPath,
  uniqueSongs: songs.length,
  minimumNumber: songs[0]?.no || null,
  maximumNumber: songs.at(-1)?.no || null,
  missingTitle: songs.filter(song => !song.title).length,
  missingSinger: songs.filter(song => !song.singer).length,
  xmlRoot,
  xmlFiles: xmlFiles.length,
  matchedXmlFiles: xmlFiles.length - unmatchedFiles.length,
  unmatchedXmlFiles: unmatchedFiles.length,
  matchRate: Number((100 * (xmlFiles.length - unmatchedFiles.length) / Math.max(1, xmlFiles.length)).toFixed(2)),
  unmatchedSample: unmatchedFiles.slice(0, 25),
  requests,
};
await writeFile(resolve(outputDir, `kumyoung-${date}-report.json`), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
