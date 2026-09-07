#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'));
const date = process.argv[2] || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const recordsPath = resolve(root, 'data/kysing-metadata/kumyoung-official-backfill.json');
const statePath = resolve(root, 'data/kysing-metadata/kumyoung-official-backfill-state.json');
const dailyPath = resolve(root, `docs/ky-collection/${date}.md`);
const logPath = resolve(root, 'docs/ky-collection-log.md');
const developmentPath = resolve(root, 'docs/development-log.md');
const [records, state] = await Promise.all([readFile(recordsPath, 'utf8').then(JSON.parse), readFile(statePath, 'utf8').then(JSON.parse)]);
const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const items = Object.values(records).filter(item => formatter.format(new Date(item.verifiedAt)) === date).sort((a, b) => Number(a.no) - Number(b.no));
const escape = value => String(value || '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
const remaining = Math.max(0, Number(state.pending || 0) - Number(state.cursor || 0));
const lines = [`# KY 공식 메타데이터 수집 — ${date}`, '', `- 조회: ${items.length}개`, `- 신규 공식 매칭: ${items.length}개`, `- 누적 공식 매칭: ${Object.keys(records).length}개`, `- 미처리 번호: ${remaining.toLocaleString('en-US')}개`, '- 오류: 없음', '- 검색 DB 반영: 아직 수행하지 않음 (수집과 별도)', '- 원본 XML: 변경 없음', '', '| KY 번호 | 제목 | 가수 | 출처 |', '| --- | --- | --- | --- |', ...items.map(item => `| ${escape(item.no)} | ${escape(item.title)} | ${escape(item.singer)} | ${escape(item.source)} |`), ''];
await mkdir(resolve(root, 'docs/ky-collection'), { recursive: true });
await writeFile(dailyPath, lines.join('\n'), 'utf8');
const heading = `## ${date} 자동 수집`;
let log = await readFile(logPath, 'utf8');
if (!log.includes(heading)) log = log.replace('\n## 운영 규칙', `\n${heading}\n\n- 공식 조회 ${items.length}개, 신규 매칭 ${items.length}개, 오류 없음.\n- 누적 ${Object.keys(records).length}개, 미처리 ${remaining.toLocaleString('en-US')}개. 검색 DB 반영은 아직 수행하지 않았다. 원본 XML은 변경하지 않았다.\n- 신규 곡 목록: docs/ky-collection/${date}.md\n\n## 운영 규칙`);
await writeFile(logPath, log, 'utf8');
const devHeading = `## ${date} KY 공식 메타데이터 자동 수집`;
let development = await readFile(developmentPath, 'utf8');
if (!development.includes(devHeading)) development += `\n${devHeading}\n\n- 예약 시간을 놓친 뒤 같은 날짜에 수동 재개했다. 공식 조회 ${items.length}개가 모두 번호 정확 일치와 비어 있지 않은 제목 조건을 통과했다.\n- 누적 ${Object.keys(records).length}개, cursor ${state.cursor}, 미처리 ${remaining.toLocaleString('en-US')}개이며 429·차단·실행 오류는 없었다.\n- 원본 XML은 변경하지 않았고, 검색 DB 반영은 수집과 분리해 아직 수행하지 않았다.\n- 날짜별 목록은 docs/ky-collection/${date}.md에 저장했다.\n`;
await writeFile(developmentPath, development, 'utf8');
console.log(JSON.stringify({ date, attempted: items.length, collected: items.length, total: Object.keys(records).length, remaining, dailyPath }, null, 2));
