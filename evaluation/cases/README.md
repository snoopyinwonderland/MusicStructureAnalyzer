# MUSICANOTE Search Evaluation Cases

실제 사용자가 입력한 Query, 기대 결과, 발견된 문제와 일반화된 개선 방안을 보존하는 Search Evaluation Harness 자료입니다. 특정 작품 ID를 검색 코드에 고정하지 않고, 각 사례를 회귀 테스트와 순위 평가의 입력으로 사용합니다.

## 저장 원칙

- 사례마다 `evaluation/cases/*.json` 파일 하나를 사용합니다.
- 원본 Query는 `query`에 수정 없이 보존합니다.
- 과거 기록에 완전한 Query가 없으면 `query: {}`, `replayable: false`, `queryAvailability`로 표시합니다. 변형 내역만으로 원본 음표를 추측하지 않으며 이 기록은 실행 평가에서 건너뜁니다.
- 기대 결과는 `expected`, 실행 당시 관찰은 `observations`, 원인 분석은 `diagnoses`, 일반화된 개선안은 `proposals`, 실제 실행 기록은 `runs`에 각각 분리합니다.
- 정답을 아직 모르면 `draft`, 사용자가 작품·구간을 확인하면 `verified`, 전체 suite에서 회귀 검증까지 통과하면 `resolved`로 둡니다.
- 원인만 확인했거나 검증이 남아 있으면 `diagnosed`입니다. 스키마 정규화는 새 검증 실행이 아니며 과거 상태는 필요할 때 `originalStatus`에 보존합니다.
- 작품 ID나 음표열을 제품 검색 로직에 예외로 넣지 않습니다.
- `npm run harness:export`로 언제든 모든 사례를 JSONL과 CSV 목록으로 모을 수 있습니다. 생성물은 `evaluation/exports/`에 저장됩니다.
- export는 모든 개별 JSON의 현재 스키마 필수 필드·형식과 중복 `caseId`를 먼저 검사합니다. 오류가 있으면 기존 export를 덮어쓰지 않습니다. JSONL은 실제 줄바꿈으로 한 줄에 한 기록을 저장하며 문자열 내부 줄바꿈은 JSON 이스케이프로 보존합니다.
- `docs/query-100-evaluation-report.md`의 표 300행은 `npm run harness:import-query-100`으로 `evaluation/generated/query-100-report.jsonl`에 별도 수집합니다. 이 자료에는 원본 work/source/stream ID와 meter·target onset이 없으므로 모두 `draft` 및 `report-assertion-unverified`입니다. 정본 `evaluation/cases/*.json`이나 Recall/MRR 분모에 자동 합치지 않습니다.
- 실제 DB에서 휴리스틱으로 고른 20개 모티프 후보와 다섯 변형씩 만든 100개 사례는 `evaluation/motif-100/cases.jsonl`에 보존합니다. 전체 production 검색 결과는 `evaluation/runs/motif-100-latest.json`, 사람이 읽는 분석은 `docs/motif-100-search-evaluation.md`에 있습니다. 이 세트는 work/source/stream, 원형 onset·pitch·measure, 전체 Query, Top100 결과, 직접 원곡 정렬, XML/SVG 강조 검증, latency를 포함하므로 재실행 가능합니다.
- Motif 100은 자동 생성 robustness suite입니다. 원형이 사람에게 확인된 주제라는 보장은 없으므로 `evaluation/cases/*.json`의 사용자 검증 정본이나 출시 Recall/MRR 분모에 자동 병합하지 않습니다. 사람이 원형과 기대 구간을 확인한 사례만 별도 case로 승격합니다.
- `pnpm harness:motif-100`으로 후보 재선별부터 실행할 수 있고, 동일 100개를 검색 변경 전후에 비교할 때는 `node scripts/motif-100-benchmark.mjs run --max 100`만 사용해 `cases.jsonl`을 유지합니다.

## 필수 정보

- `schema`, `caseId`, `createdAt`, `status`
- `query`
- `expected.primaryTitles`
- `observations[]`
- `diagnoses[]`
- `proposals[]`
- `runs[]`

상세 필드 형식은 `evaluation/schema/query-case.schema.json`을 기준으로 합니다. 과거의 `user-queries-phase1.jsonl`은 원본 보존용이며, 새 사례의 정본은 개별 JSON 파일입니다.

## 과거 Porgy 사례 이관

- `q-p1-001-porgy.json` / `Q-P1-001`: 원본 JSONL 1행의 전체 Query·사용자 관찰·기대 제목·baseline·진단을 보존하고, 2–3행의 실제 R1/R2 실행 기록을 `runs`로 연결했습니다. 원본 `draft` 상태를 유지합니다.
- `q-p1-001-v2-porgy-internal-substitutions.json` / `Q-P1-001-V2`: 원본 4행의 `parentCaseId`, pitch mutation, 관찰 결과와 위험을 보존했습니다. 원본은 직전 verified variant에 대한 두 음 변경만 기록하고 전체 Query와 정확한 직전 variant를 제공하지 않습니다. `query: {}` 및 `replayable: false`이므로 현재 원본 그대로 재실행할 수 없습니다. 부모 Query를 복사해 두 음만 바꾸는 식으로 보완하지 않습니다.
- `legacySource`는 변경하지 않은 원본 파일과 1-based 행 번호를 가리킵니다. 원본의 과거 순위는 관찰일 뿐 현재 평가에서 반드시 맞춰야 하는 고정 순위가 아닙니다. 기대 제목은 사용자 진술이며 음표 단위 정답 라벨을 추가하지 않습니다.
- `Q-P1-005`는 원본 `targets`와 `resolution`을 유지하고, 브라우저 검증이 남아 있어 `fixed`를 유효 상태 `diagnosed`로 정규화했습니다. 기대 정답 제목이나 새 실행 성공을 추정하지 않았습니다.

검증: `npx vitest run scripts/evaluation-case-validation.test.js` (임시 폴더 export, JSONL special-character round trip, schema/중복 검사, 원본 Porgy 기록 보존).

## Motif 100 기준선 — 2026-09-06

- 구성: KYSing 6곡, MusicXML 7곡, PDMX 7곡의 원형 20개 × pitch·octave·rhythm·leap·rest 변형 5종.
- 실제 실행: 100/100 완료, 오류 0, Top1 78, Top5/Top10/Top100 86, 미회수 14.
- 변형별 Top100: pitch 12/20, octave 15/20, rhythm 20/20, leap 19/20, rest 20/20.
- 미회수 14개는 원곡 직접 local alignment에서는 모두 입장 기준을 통과해 candidate retrieval 누락으로 분류했습니다.
- 결과가 하나 이상 나온 99개는 alignment target 전부가 excerpt XML과 Verovio SVG에서 붉은 음표로 해석됐습니다. 결과 0개인 Q-M100-097은 표시 대상을 검증할 수 없었습니다.
- latency: 평균 15.67초, p50 9.93초, p90 32.68초, 최대 63.75초.
- 이 수치는 현재 DB와 검색 코드 snapshot의 기준선이지 고정 목표가 아닙니다. 다음 candidate recall 개선 후 동일 `cases.jsonl`로 A/B 재실행합니다.

## Motif 100 후보 회수 A/B 및 Motif 200 — 2026-09-06

- 긴·정보량 높은 Query에서 interval posting 회수 범위를 확대하고, 떨어진 seed가 동일 시작점을 지지할 때 후보 가산점을 주었습니다. 낮은 정보량 반복음 Query는 확대 대상에서 제외합니다.
- 동일 Motif 100 재실행은 Top1 88, Top5/Top100 98, 미회수 2입니다. 기준선 대비 12개를 새로 회수했고 새로 누락된 사례는 없습니다.
- 다만 p50 latency가 9.93초에서 22.79초로 증가했습니다. 이 결과는 정확도 A/B 성공이지만 성능 완료 판정은 아닙니다.
- `evaluation/motif-200/cases.jsonl`은 첫 세트와 source가 하나도 겹치지 않는 새 원형 20개 × 변형 5종입니다. `--suite motif-200`으로 생성·재실행할 수 있습니다.
- Motif 200 결과는 Top1 64, Top5 97, Top100 98, 미회수 2입니다. 모든 회수 결과의 XML/SVG target 검증은 통과했습니다.
- 자동 원형의 음악적 대표성은 아직 사람 검증 전입니다. Top1 차이는 원형별 중복성과 경쟁 판본/stream의 자격을 함께 검토하며, 숫자만으로 검색 오류를 확정하지 않습니다.
