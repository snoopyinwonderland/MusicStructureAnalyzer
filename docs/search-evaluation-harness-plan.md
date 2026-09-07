# MUSICANOTE Search Evaluation Harness Plan

## 목적

검색 알고리즘을 특정 Query 하나에 맞추지 않고, 누적된 실제 사례 전체에서 정확도와 속도가 개선되는지 재현 가능하게 판단한다. 모든 검색 변경은 동일한 평가 corpus와 Query suite에서 전후 결과를 비교한다.

## 평가 단위

하나의 case는 다음을 보존한다.

- `caseId`, 작성일, 출처(`user`, `curated`, `generated`), 상태(`draft`, `verified`)
- 실제 검색에 사용한 Query JSON 전체
- 기대 작품 ID와 허용 가능한 판본/편곡 ID
- 기대 part/staff/voice와 마디 또는 onset 범위
- 관련 결과를 여러 개 허용하는 relevance 등급: `primary`, `relevant`, `acceptable`, `wrong`
- 이 Query에서 검증하려는 현상: 전조, 한 음 변경, 삽입, 누락, 리듬 변화, 쉼표, tie, tuplet, pickup, 내성부 등
- 과거 문제, 기대 동작, 수정 내용, 검증 상태

정답을 아직 밝히지 않고 검색기의 추론을 먼저 확인하려는 사례는 `draft`로 저장한다. 사용자가 정답을 확인한 뒤에만 `verified` 평가 점수에 포함한다.

## 저장 구조

```text
evaluation/
  cases/
    user-queries.jsonl
    curated.jsonl
    generated.jsonl
  schemas/
    search-case.schema.json
  snapshots/
    baseline-YYYY-MM-DD.json
  reports/
    latest.json
    latest.md
scripts/
  eval-search.mjs
  generate-query-variants.mjs
```

JSONL은 Git diff와 사례 추가가 쉽고, 한 행 오류가 전체 파일을 손상시키지 않는다. 대규모화하면 같은 schema를 SQLite로 적재하되 JSONL을 검토 가능한 원본으로 유지한다.

## 핵심 지표

### 정확도

- `Recall@1`, `Recall@5`, `Recall@10`, `Recall@20`
- `MRR`: 첫 primary 정답 순위의 역수 평균
- `nDCG@10`: primary/relevant/acceptable 등급을 반영한 결과 품질
- `segment IoU`: 검출 onset 구간과 정답 구간의 중첩
- `note precision/recall/F1`: 실제로 강조한 음표가 정답 음표와 얼마나 일치하는지
- `no-match precision`: 정답이 없는 Query에서 억지 결과를 내지 않는 비율

### 강건성

- 전조 불변성
- 한 음 pitch substitution
- 한 음 insertion/deletion
- 작은 리듬 변화와 큰 리듬 변화
- tempo scaling
- ornament/rest/tie/tuplet 변화
- 다른 part·voice·편곡에서의 회수율

### 성능

- 전체 및 Query 길이별 latency `p50`, `p95`, `p99`
- 후보 수, 전체-stream refinement 수, 정렬한 음표 수
- peak memory와 SQLite 조회 시간
- corpus 크기별 처리량과 동시 요청 성능

## 평가 실행 방식

1. 실제 production 검색 함수 `searchDatabase`를 호출한다. 별도의 축약 검색기를 평가하지 않는다.
2. 각 case를 최소 3회 실행하고 첫 실행과 warm-cache 실행을 구분한다.
3. 결과를 작품·판본·part·구간 수준으로 각각 채점한다.
4. 기준 snapshot과 비교해 개선, 동일, 회귀를 표시한다.
5. verified case의 Recall@10 또는 MRR이 허용치 이상 하락하면 명령을 실패시킨다.
6. 개별 사례가 좋아져도 전체 지표가 나빠지면 기본 알고리즘 변경으로 채택하지 않는다.

## 자동 변형 Query

verified 원본 Query에서 다음 변형을 결정적으로 생성한다.

- `transpose`: -12, -7, -5, +5, +7, +12 semitone
- `pitch-substitution`: 시작·중간·끝의 한 음을 ±1 또는 ±2 semitone
- `insertion/deletion`: 약박의 한 음 삽입 또는 한 음 삭제
- `rhythm-small`: 한 음가를 인접 단계로 변경하되 전체 길이를 가능한 한 보존
- `rhythm-large`: dotted/straight 또는 2:1 비율 변경
- `tempo-scale`: 전체 음가 ×0.5, ×2
- `rest`: 내부 쉼표 추가·제거
- `spelling`: sharp/flat 이명동음 변경

생성 변형은 원본 정답을 상속하지만, 음악적으로 정답 의미가 바뀔 수 있는 변형은 자동 채점에서 제외하고 검토 대기 상태로 둔다.

## Query 사례 운영 절차

1. 사용자가 Query와 문제를 전달한다.
2. Query를 즉시 `draft` case로 기록하고 현재 결과 snapshot을 저장한다.
3. 기대 곡을 사용자가 밝히기 전이면 검색 결과와 근거를 먼저 분석한다.
4. 사용자가 정답 작품·구간을 확인하면 `verified`로 승격한다.
5. 수정 전 baseline과 수정 후 결과를 함께 기록한다.
6. 전체 suite를 실행해 다른 verified case의 회귀를 확인한다.
7. 해결 방법과 남은 예외를 case 및 개발 기록에 업데이트한다.

## 단계별 구현 계획

### Phase 1 — 실행 가능한 최소 Harness

- JSON Schema와 JSONL loader 작성
- 지금까지 기록된 Query 사례를 정규화해 최초 10~20개 case 등록
- 실제 SQLite 검색 함수를 실행하는 CLI 작성
- Recall@K, MRR, latency, 정답 순위 출력
- `pnpm eval:search`와 Markdown/JSON report 생성

완료 조건: 한 명령으로 모든 verified Query의 정답 순위와 검색 시간을 재현한다.

### Phase 2 — 구간 및 음표 평가

- expected work/part/measure/onset/target-note schema 확장
- segment IoU와 note precision/recall/F1 구현
- 판본·편곡별 acceptable result grouping
- 결과 중복률과 동일 작품 결과 점유율 측정

완료 조건: 곡만 맞고 잘못된 마디를 표시한 결과를 실패로 구별한다.

### Phase 3 — 변형 및 회귀 방지

- 자동 Query variant generator 작성
- 변형 유형별 Recall@K 표 작성
- baseline snapshot 비교와 허용 회귀 budget 적용
- CI에서 작은 smoke suite, 로컬/야간 실행에서 full suite 구분

완료 조건: 한 음 변경, 삽입, 누락, 리듬 변화가 어떤 성능 차이를 만드는지 자동 보고한다.

### Phase 4 — 성능과 확장성

- 후보 생성, SQLite, local alignment, full-stream refinement 구간별 timing instrumentation
- corpus 10%, 25%, 50%, 100% 규모 benchmark
- p50/p95와 memory 기록
- 느린 Query 상위 목록 및 candidate explosion 진단

완료 조건: 데이터 증가 시 정확도와 latency 변화를 수치로 예측할 수 있다.

### Phase 5 — 사람 평가와 상용화 기준

- 전문가 평가용 blind result 화면
- primary/relevant/acceptable/wrong 판정 저장
- 클릭·재생·상세 진입과 명시적 feedback 분리
- 출시 기준 dashboard 작성

권장 알파 기준: verified case 300개 이상, Recall@10 90% 이상, MRR 0.65 이상, segment F1 0.80 이상, warm p95 2초 이하, 치명적 parser 오류율 1% 이하. 실제 기준은 첫 baseline 측정 후 장르별 난이도를 반영해 확정한다.

## 다음 작업 순서

1. Phase 1의 schema, loader, CLI, report부터 구현한다.
2. 개발 문서의 Q-01 이후 사례와 최근 Trepak, I Loves You Porgy 사례를 최초 dataset으로 이관한다.
3. 첫 baseline을 생성하되 현재 점수를 목표값으로 고정하지 않는다.
4. 이후 검색 알고리즘 수정은 반드시 `수정 전 baseline → 변경 → 전체 eval → 결과 기록` 순서로 진행한다.

## 2026-09-05 실제 Query 검증 확장

현재 개별 정본 사례가 4/4·melody_rhythm에 집중되어 있어, [다음 검증 라운드](query-testing-next-round.md)에 박자·프레이즈 시작·리듬·타이·경계 오류·반복음·내성부·contour 테스트 쌍과 기록 항목을 추가했다. 이는 제안이며 아직 실행·검증 완료가 아니다. Legacy 정규화와 schema 검사, production 경로의 전체 suite 보고서 완성이 선행 과제다.

## 2026-09-06 Motif 100 자동 변형 기준선

Phase 3의 자동 변형과 Phase 4의 latency 측정을 실제 대규모 DB에서 처음 결합했다.

- 원자료: `evaluation/motif-100/cases.jsonl`
- 실행 snapshot: `evaluation/runs/motif-100-latest.json`
- 전체 보고서: `docs/motif-100-search-evaluation.md`
- 실행기: `scripts/motif-100-benchmark.mjs`

20개 원형은 특정 작품을 검색 코드에 고정하지 않고 melody-role, 반복성, 음정·리듬 정보량, 강박 시작과 프레이즈 경계 단서로 선별했다. 각 원형에 pitch substitution, 내부 octave displacement, 국소 rhythm redistribution, leap reduction, rest insertion/length change를 적용했다.

첫 기준선은 Top1 78/100, Top100 86/100이다. 회수된 사례는 거의 모두 1위였지만 pitch 변형은 12/20, octave 변형은 15/20만 회수됐다. 미회수 14개 전부 직접 원곡 정렬에서는 입장 기준을 통과했으므로 다음 변경의 1차 목표는 ranking weight가 아니라 candidate retrieval recall이다. 희귀 gram 우선, 좌우 분할 interval seed, 제한 fallback을 차례로 적용하고 동일 사례로 비교한다.

악보 강조는 결과가 존재한 99개에서 XML 및 Verovio SVG target 100%가 확인됐다. latency는 p50 9.93초, p90 32.68초로 Phase 4 성능 기준에는 미달한다.

이 세트는 자동 생성 자료이므로 사람이 motif·기대 구간을 확인하기 전에는 verified 사용자 suite의 출시 지표와 합치지 않는다. 원형 검토 후 `evaluation/cases/*.json`으로 승격할 수 있도록 work/source/stream과 onset target을 모두 보존했다.

## 2026-09-06 후보 회수 보완 A/B와 독립 2차 100개

첫 기준선의 미회수 14개가 모두 direct alignment 입장 기준을 통과한 점을 근거로, 긴·정보량 높은 Query에 한해 interval posting을 넓게 읽고 서로 떨어진 interval seed가 같은 시작점을 지지할 때 후보 가산점을 주었다. 반복음 중심의 낮은 정보량 Query에는 이 확대를 적용하지 않는다.

- 동일 Motif 100 A/B: Top1 78→88, Top5/Top100 86→98, 미회수 14→2. 새로 회수된 사례는 12개이고 새로 누락된 사례는 없다. Q-M100-046 한 건만 1위에서 2위로 이동했다.
- 강조 검증 문제는 1→0으로 줄었다.
- 대가: 평균 15.67→25.86초, p50 9.93→22.79초, p90 32.68→46.16초, 최대 63.75→79.45초. 정확도 보완은 유지하되 다음 성능 단계에서 posting 전체 물질화를 대체해야 한다.
- 보존 snapshot: `evaluation/runs/motif-100-baseline-2026-09-06.json`, `evaluation/runs/motif-100-post-retrieval-2026-09-06.json`.

### 적응형 posting 성능 회귀 세트

- 전면 250,000행 interval posting의 회수율을 유지하면서 속도를 줄이기 위한 고정 회귀 세트를 `scripts/benchmark-adaptive-postings.mjs`로 실행한다.
- 대표 회수 사례는 `Q-M100-001/006/016/017/036/039/041/081/082/091/096/097`, 기존 미회수 대조군은 `Q-M100-002/037`, 독립 세트 미회수 대조군은 `Q-M200-019/067`이다.
- `Q-M100-081`은 내부 변형이 희귀 gram을 파괴하고 흔한 edge gram만 남기는 사례, `Q-M100-004`는 edge posting cap 경계 회귀 사례로 관리한다.
- 현재 최종 정책은 일반 i3 16,000, 좌우 희귀 i3 50,000, 첫·마지막 i3 100,000행이다. 100-query 전체 평가는 다음 candidate evaluation 최적화 후 재실행한다.

두 번째 세트 `motif-200`은 첫 세트의 source 20개를 전부 제외하고 새로운 원형 20개를 골랐다. MusicXML 35, PDMX 35, KYSing 30 Query이며 2/4 10, 3/2 5, 3/4 10, 4/4 75개다.

- 결과: Top1 64, Top5 97, Top10/Top100 98, 미회수 2, 중앙 순위 1, p90 순위 2.
- 변형별 Top100: pitch 20/20, octave 19/20, rhythm 20/20, leap 19/20, rest 20/20.
- Q-M200-019(leap)과 Q-M200-067(octave)은 direct alignment 입장 기준을 통과했지만 후보에서 누락됐다. 특정 곡 예외를 넣지 않고 bounded candidate fallback의 다음 진단 자료로 둔다.
- XML/Verovio 강조 문제는 0개다. 일부 원본에서 끝나지 않은 slur/tie 경고가 관찰되어 검색 정확도와 별도의 원본 표기 무결성 필드가 필요하다.
- latency: 평균 30.36초, p50 23.68초, p90 55.32초, 최대 110.62초.
- 원자료 `evaluation/motif-200/cases.jsonl`, 실행 결과 `evaluation/runs/motif-200-latest.json`, 전체 사례 문서 `docs/motif-200-search-evaluation.md`.

## 상세 검색 옵션 평가 축

상세 검색 옵션은 서로 독립된 boolean으로 저장하며 복수 선택은 AND로 평가한다. 이후 Query 사례에는 `exactIntervalOnly`, `exactPitchOnly`, `exactRhythmOnly`, `includeRests`, `downbeatWeightBoost`를 snapshot에 포함한다.

- Exact Interval: 조옮김 불변 interval 완전 일치의 precision/recall.
- Exact Pitch: 절대 MIDI pitch 완전 일치. enharmonic spelling은 identity에 사용하지 않는다.
- Exact Rhythm: 전역 배율 정규화 후 IOI·마지막 음가 비율 완전 일치.
- Include Rests: 같은 Query를 on/off 쌍으로 실행해 내부 쉼표가 후보 회수와 정렬 구간에 미치는 영향 비교.
- Downbeat Weight 강화: 현재 2배를 기준으로 1배/1.5배/2배를 비교한다. Recall@10만 높이고 무관 강박 결과가 늘어나는 배율은 채택하지 않는다.
- Rhythm only: pitch를 바꾼 대조 Query에서 결과 순위가 변하지 않아야 하며, 음가 비율 변경에는 순위가 변해야 한다.

## 2026-09-07 독립 Motif 300 평가

- 이전 두 세트의 source 40개를 제외하고 새로운 원곡 20개에서 변형 Query 100개를 생성했다. MusicXML 35, PDMX 35, KYSing 30이며 source 중복은 0이다.
- 실제 생산 검색 결과는 Top1 70, Top5 96, Top10 98, Top100 99, 미회수 1이다. 음높이·리듬·도약 변형은 모두 Top5 20/20이다.
- Q-M300-067의 국소 옥타브 이동만 admission에서 탈락했다. 단일 ±12 오류가 인접 interval 두 개와 alignment gap을 동시에 손상시키는 경우를 위한 bounded recovery가 다음 정확도 과제다.
- Q-M300-090은 기대 workId가 15위지만 위 결과 대부분이 같은 Holst의 THAXTED/Jupiter 선율 판본이다. 앞으로 정답은 단일 workId 외에 acceptedWorkIds, canonical tune ID, edition family를 가질 수 있어야 한다.
- 강조 XML/Verovio는 전 100건에서 로드·렌더됐으며, expected/fallback target coverage는 99건 100%, 1건 90%다.
- latency는 평균 21.36초, p50 20.04초, p90 34.85초, 최대 55.61초였다. 전체 사례와 Query·순위·상위 후보·개선 방향은 docs/motif-300-search-evaluation.md, 원자료는 evaluation/motif-300/cases.jsonl, 실행 snapshot은 evaluation/runs/motif-300-latest.json에 보존한다.
