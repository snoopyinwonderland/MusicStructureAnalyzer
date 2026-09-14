# MUSICANOTE 개발 기록

## 기록 완료 기준

- 알고리즘·schema·UI 동작을 바꾸는 작업은 코드만 수정한 상태를 완료로 보지 않는다.
- 같은 변경에서 규칙의 목적과 한계, 데이터 계약, 회귀 테스트, 실제 악보 전후 결과, 알려진 미해결 문제를 관련 명세와 날짜별 개발 로그에 함께 기록한다.
- 분석기 버전, 코드, 테스트, API payload, 뷰어 문서의 버전 표기가 일치해야 한다.

## 2026-09-11 프레이즈 반복 음형 계층화 v1.2

- Phrase 검토 상호작용을 추가했다. 오른쪽 드롭다운에서 Phrase를 선택하거나 악보 위 `Phrase N` 구간 띠/라벨을 클릭하면 해당 Phrase의 모든 system segment가 1초 동안 두 번 강조된다. 같은 Phrase 재선택도 새 token으로 DOM key를 갱신해 animation을 다시 시작한다. 아직 렌더링하지 않은 뒤쪽 Phrase는 해당 Verovio page를 우선 렌더링한 뒤 그 구간으로 스크롤한다.
- 악보의 경계 막대 문구를 `P1│P2`에서 `P2 시작` 형식으로 바꿨다. 현재 기본 phrase span은 서로 겹치지 않는 `[start,end)`이므로 막대는 두 구간이 공유하는 음이 아니라 뒤 Phrase가 시작되는 위치를 뜻한다. `P1│P2`와 반반 색 anchor는 향후 분석 payload가 명시적인 overlap membership을 제공할 때만 사용할 수 있다.
- 사용자 검토 사례 `work-25517ce2d093550b`에서 기존 분석기가 15–18마디 반복 음형의 각 1박 공백을 독립 프레이즈 경계로 채택한 원인을 확인했다. 기존 채택 경계는 note index 33/37/41 및 106/110/114였고 모두 `observed-gap`이 과대 지배했다.
- `local-boundary-evidence-v1.2`에 반복 진행 계층을 추가했다. 3–8 attack 길이의 연속 cell이 정규화한 duration, IOI, contour에서 반복되면 전체 run의 시작·끝을 primary phrase 후보로 만들고 내부 gap은 `subphrase-cell`로 보존한다.
- 내부 경계는 삭제하지 않는다. 기존 점수를 `rawStrength`에 보존하고 `repeated-figure-continuation`, `primaryLevel`, `suppressedBy`를 기록한다. run에는 `cellLengthInAttacks`, `cellCount`, `internalBoundaryIndices`, `similarity`, `requiresCadenceReview`를 반환한다.
- 같은 작품의 기존 6·7번 구간은 음정 윤곽의 exact 반복이 아니라 두 pickup 제스처가 `[1,1,2]` duration prefix를 공유하고 뒤에 6 quarter의 큰 공백이 오는 구조였다. 이를 `rhythmic-gesture-continuation`으로 별도 모델링해 index 70의 내부 쉼을 subphrase로 낮추고 index 65–74를 한 primary 구간으로 유지했다.
- 실제 API 재검증에서 15마디 2박 C#5(index 29)부터 19마디 1박 E5 직전까지 하나의 구간이 되었고, 16/17/18마디 시작 index 33/37/41은 내부 cell로 보존됐다. 36–39마디의 반복도 index 102–118 한 구간으로 합쳐졌다. 사용자 화면상의 C 음은 조표 적용 written pitch로 API에서 C#5이며, 옥타브 표기 차이는 향후 Canonical IR/engraving ID 연결에서 재검증한다.
- 화면 검증에서 boundary index를 양쪽 phrase의 공통 음으로 표시하던 별도 UI 오류를 발견했다. 경계 `i`는 note `i` 직전이라는 분석 계약에 맞춰 기본 span을 `[start,end)`로 변경했다. 따라서 Phrase 2는 m15 b1 B3(index 28)에서 끝나고 Phrase 3은 m15 b2 C#5(index 29)에서 시작한다. 실제 overlap은 향후 별도 hypothesis가 있을 때만 표시한다.
- 비연속 attack만으로 구간 마디를 표시해 Phrase 1이 1–4마디로 축약되는 문제도 확인했다. 다음 경계가 m11 b1이면 시간 span의 끝을 m10으로 표시하고, endpoint pitch는 마지막 포함 음표를 별도로 유지하도록 수정했다. Chrome 검증에서 Phrase 2 `11–15마디 E4→B3`, Phrase 3 `15–18마디 C#5→B5`가 확인됐다.
- 단위 테스트에 4-cell 반복 진행, 2-gesture chain과 그 반례 2개, 비중첩 `[start,end)` span, 침묵 마디, `P2 시작` 표시 및 재선택 flash key 사례를 추가했다. 관련 3개 파일의 테스트 40개와 TypeScript/Vite production build가 통과했다. 전체 suite의 직전 실행은 이번 변경과 무관한 기존 evaluation case의 `createdAt` 누락 1건 때문에 204개 중 203개 통과했다.
- Phrase 5를 만든 2-gesture 규칙에는 작품 ID·마디·음높이·제목 상수가 없다. 같은 rhythm prefix만 같거나 큰 종결 공백만 있는 경우에는 합치지 않도록 반례 2개를 추가했다. 현재 코퍼스에서 결정론적으로 고른 500곡(105,306 attacks) 표본을 점검한 결과 repeated-run은 100곡/239건, narrower rhythmic-gesture rule은 12곡/17건(작품 기준 2.4%)에만 발동했다. 이는 규칙이 한 작품 전용이 아님을 확인하는 적용 범위 검사일 뿐, 17건이 모두 음악적으로 옳다는 정확도 증명은 아니다.
- 상세 설계, threshold, 실제 전후 표, 오탐 방지 조건과 deferred cadence 결합은 `docs/phrase-boundary-v1.2-repetition-hierarchy.md`에 기록했다.

## 2026-09-06 Query 300개 평가 보고서 대조 및 Harness 이관

- `docs/query-100-evaluation-report.md`를 현재 생산 검색 코드와 대조했다. 문서에는 300개 Query 표가 있으나 실측 서술은76개이고, 실행 당시 Query JSON·work/source/stream ID·target onset·결과 snapshot·코드/DB 식별자가 없어76.3%를 재현 가능한 현재 성능 수치로 사용하지 않는다.
- 중간 오음, 쉼표, tie, 장식음, tempo scaling, 반복 occurrence, 짧은 Query 등의 변형 분류는 유용하다고 판단했다. 표300행을 별도 draft JSONL로 정규화하는 importer를 추가했다. meter와 downbeat 시작 여부는 추측하지 않는다.
- 반복 결과는 프레이즈·박자 문맥을 우선하고 완전 동률일 때만 앞 occurrence를 택하는 방향으로 유지한다. 저음역만으로 베이스를 감점, 일반 melody 검색에서 음정 반전까지 원곡으로 회수, mod12/2-gram 채널 즉시 기본 활성화, interval exact를 “주제부100% 일치”로 표시하는 제안은 채택하지 않았다.
- m3/s3 후보 채널은 BWV114 등 실제 후보 조기 탈락 사례와 연결되는 후속 실험으로 보존한다. 현재 구조 가중치는 화성 검증이 없는 휴리스틱이므로 별도 인덱스와 held-out 평가 없이 Schenker 정답이나 재현율 보장으로 부르지 않는다.
- 검증: 보고서300행을 중복 없이 모두 변환했고30개 범주, Q061 타이 그룹, Q269 한·일문 제목을 확인했다. 전체18개 파일/166개 테스트, TypeScript와 Vite build, diff 공백 검사를 통과했다. Verovio 대형 bundle 경고는 기존과 동일하다.

## 2026-09-05 중단 작업 재개 · 경계 분석 1단계 · F4 타이 강조 · 점8분음표

- 사용자 요청: 중단 전 계획을 누락 없이 재개하고 경제적인 모델 사용, 특정 KY 결과의 staff2 F4 확인, Query에 점8분음표 추가, search-performance-proposals-and-tests 문서 검토 후 타당한 제안 반영.
- 재개 당시 완료물: 경계 분석 모듈과 19개 테스트, legacy 사례/스키마/export 대부분. 미완료물: A/B runner는 shebang만 있었고 검색 연결 및 실제 비교는 없었다. 저장된 파일에서 이어 작성했으며 기존 사용자 변경이나 DB를 되돌리지 않았다.
- 실행 계획: docs/phrase-context-execution-plan.md. 경계 분석은 원곡 전체 stream의 보조 evidence로만 계산하고 m+r 유사 검색의 최종 순위를 ±3점 이내 보정한다. 새로운 음 생략·후보 통과 완화·정답 작품 고정은 없다. contour null 정렬 참조 오류도 통합 검사에서 방지했다.
- Harness: 정본 7건(실행 가능6/불완전 원문1), validator/export 및 생산 경로 A/B runner 완성. 0-based 보고서 순위 오류를 1-based로 바로잡고 검사 추가. 원본 실행 보고서는 보존하고 정정본을 별도 저장했다. Porgy 2→1위, BWV772 2위 유지, BWV114 기대 결과 Top100 미확인. 공통 결과의 실제 일치 마디/음표 변경0건. 캐시 영향을 포함한 실행 시간 차이를 가속 효과로 주장하지 않는다.
- Q-P1-006: 꺼져 줄게 잘 살아 (Feat.용준형 Of 비스트), work-af9d06a2cc0ef485-a71ddd21, source kysing/57982.xml, stream P3:1:1. F4는 원본25마디4박 staff1/voice1→26마디1박 staff1/voice1의 타이다. 같은 마디 staff2/voice5의 F4 stop이 DOM상 뒤에 나와 이전 색칠 루프가 잘못 따라갔다. 검색이 성부를 섞은 것이 아니라 표시 단계 오류임을 원본/DB 대조로 확인했다.
- 타이 강조는 동일 part/staff/voice, 시간 순서, 바로 다음 onset의 stop만 따른다. 중간 새 어택·쉼표·끊어진 타이는 넘어가지 않는다. 검색 결과 조각과 상세 화면의 공유 component에 적용하고 실제 사례 형태로 회귀 검사했다. 원본 XML과 검색 인덱스는 수정하지 않았다.
- Query: .5와1 사이에 .75(점8분음표)를 추가하고 MEI dur=8/dots=1로 그린다. 기존 tuplet/tie/나머지 음가 유지. 새 Query 원문16events/15notes와 진단은 evaluation/cases/q-p1-006-cross-staff-tie-highlight.json에 보존했다.
- 성능 제안 검토: 테스트/Harness와 보수적 경계 분석 채택. BLOB압축 예상 수치·band DP재현율100%·코어수 비례가속 보장은 미검증으로 정정. 단순 템포배율 게이트, 반주 Query 자체를 오탐 취급하는 테스트, 고정60/40 점수식은 그대로 적용하지 않았다. 표본/회귀 검증 후 실험하도록 문서에 기록했다. K28.93GiB/U44.38GiB 여유 확인, 대형 DB 재구축·교체는 하지 않았다.
- 모델: 사용자 비용 절감 요청에 따라 작은 음가 수정은 Luna, 타이 표시 수정은 Terra, A/B runner는 Sol에 맡겼다. 현재 대화의 주 모델을 바꾸는 도구는 확인되지 않아 변경했다고 주장하지 않는다.
- 검증: 경계/생산 연결25개 검사 통과. 보고서 순위 회귀 검사까지 포함한 최종 전체17개 파일/164개 검사와 TypeScript 검증 통과, Vite build 통과. 정본7건 JSONL/CSV export 및 diff 공백 검사 통과. Verovio 대형 bundle 경고는 남아 있으며 브라우저 직접 시각 검증은 별도다.
- 2026-09-06 재개 마무리: 위 구현을 유지하고 Q-P1-006의 타이 강조 수정 상태와 단위 검증 근거를 갱신했다. 순위 정답 미확정/브라우저 확인 대기는 해결 완료로 바꾸지 않았다.
- 2026-09-06 재검증: 기본5초 제한에서는 실제 코퍼스를 읽는 catalog text search 첫 검사가9.3초로 timeout(163통과/1실패)했다. 검색 코드나 검사 기대값은 변경하지 않고 실행 옵션 --testTimeout=20000으로 재실행해164개 전체 통과(전체1.95초), TypeScript/export도 통과했다. 캐시/초기 읽기 지연에 민감한 검증이며 성능 문제가 해결됐다는 뜻은 아니다.

## 2026-09-05 프레이즈 자동 분석과 사람 주석 연계 검토

- 요청: 별도 프로젝트의 사람 분석 데이터 수집이 완료되기 전에 프레이즈를 자동 분석할 수 있는지와 한계를 설명한다.
- 현재 프레이즈 규칙과 사용자 Analysis Harness 지침, LBDM 및 다중 단서 분할 연구를 확인했다. 현 구현은 국소 단서 추정이며 완전한 화성/종지/셴커 분석은 아니다. 고정 analysisConfidence 수치도 검증된 확률이 아니다.
- docs/query-testing-next-round.md에 경계 후보·불확실성 처리, 원래 연속 검색 보존, 타이 공격과 화성 중요도의 분리, 사람 주석의 안정적 식별자 및 독립 평가 연결 방안을 기록했다.
- 분석은 사전 계산된 보조 계층으로 연결하고, 정답 회수/오탐/정확한 음표 대응 개선을 검증한 뒤 도입하는 방향을 제안했다. 이번 요청은 설명이므로 검색 코드·DB·외부 분석 프로젝트를 수정하지 않았다.

## 2026-09-05 검색 Query 검증 범위와 다음 테스트 계획

- 요청: 중간 음 변경과 음 생략 외에 검증할 검색 사례 및 개선 방향을 제안한다.
- 현재 개별 정본 4개는 모두 melody_rhythm·4/4·유사 검색이다. Porgy 등 legacy/개발 기록의 사례도 있으며, 사용자 테스트 전체가 네 개라는 뜻은 아니다. 단위 검사와 실제 코퍼스 검증을 구별했다.
- docs/query-testing-next-round.md에 허용 변화/구별할 변화의 A/B 테스트 8종, 첫 15 Query 라운드, 작품·구간·음표·오탐 평가, 미사용 작품 검증 및 기록 항목을 정리했다.
- Legacy 이관, schema 일관성, production 경로 전체 suite 보고서는 보완 과제로 남겼다. 이번에는 검색 알고리즘·가중치·DB를 변경하거나 새로운 Query가 통과했다고 표시하지 않았다.

## 2026-09-05 Laudate pueri Dominum 다중 파트 페이지 조판

- 사례: work-cc948ac1b2056317-e2ac527d, P4, 38–39마디. 원본은 5파트이며 39·45마디에 print new-page=yes가 있다.
- 기존 1900×2700·scale 24에서 여러 system이 70–80% 수준으로 과도하게 가로 압축됐고, 고정 placeholder 비율도 다중 파트용 페이지 조정과 연결되지 않았다.
- 5파트 이상 전체 악보에만 2100×3100·scale 21 적응형 조판을 적용했다. 4파트 이하는 기존 1900×2700·scale 24를 유지한다. 검색 결과 excerpt도 변경하지 않았다.
- 실제 렌더 진단에서 목표 38마디는 4쪽, 원본 39마디 page break는 5쪽으로 유지됐고, 목표 주변의 반복 압축 경고가 크게 감소했다. placeholder aspect-ratio도 실제 pageWidth/pageHeight CSS 변수와 동기화했다.
- Computer Use 화면 캡처는 helper가 두 번 종료되어 불가능했다. Verovio 출력 계산으로 검증했으며 브라우저 시각 확인은 남아 있다. 테스트 95개와 TypeScript 검증 통과.

## 2026-09-05 KY 공식 메타데이터 첫 증분 반영 및 검색 성능 3단계

- backfill 105개는 기존 DB 행의 제목 수정 대상이 아니라, 과거 메타데이터 미매칭으로 인덱스에서 제외됐던 XML임을 확인했다.
- 105개 전용 inventory를 생성하고 XML 105개를 실패 없이 파싱했다. 419 melody streams와 331,185 n-grams를 별도 SQLite로 만든 뒤 활성 DB에 단일 트랜잭션으로 병합했다. 병합 ID 전체는 data/kysing-metadata/index-merge-2026-09-05.json에 보존한다.
- 현재 코퍼스는 95,625 works / 384,425 melody streams. 강원도 아리랑·경상도 청년·당신은 몰라의 source, 제목, 가수와 FTS/API 텍스트 검색을 확인했다. 원본 XML은 변경하지 않았다.
- 검색 단계별 profiler를 추가했다. Q-P1-004에서 local alignment보다 MusicXML 박자표 조회가 큰 병목임을 확인했다.
- source+part의 정확한 meter timeline을 meter-context.sqlite에 영속 저장하고, 활성 검색 DB 수정 시 자동 무효화한다. 별도 프로세스 재실행 비교에서 7,124→2,322 ms, meter lookup 4,265→83 ms. 검색 규칙·점수·후보 수는 변경하지 않았다.
- 테스트 94개와 TypeScript 검증 통과. 세부 결과는 docs/performance-stage-3.md와 evaluation/runs/performance-stage-3-meter-cache.json에 기록했다.


## 2026-09-05 KY 공식 메타데이터 자동 수집

- 자동화 ky가 미매칭 번호 100개를 1.5초 간격으로 조회했다. 공식 번호 일치와 비어 있지 않은 제목을 확인한 신규 100개를 저장했다.
- 누적 105개, cursor 105, 전체 pending 목록 13,048개 중 미처리 12,943개. 429 및 실행 오류 없음.
- 수집 JSON·상태와 날짜별 목록을 갱신했다. 원본 XML과 검색 DB는 변경하지 않았다.

## 2026-09-05 KY 제한 상세 악보 자동 재조판

- 사용자가 Fly Away(work-94ed97f401dcce21) 사례 진단 후 제안한 자동 재조판에 동의. 적용 범위는 노래방 research-preview 상세 화면으로 한정했다.
- 상세용 단일 파트 XML에서 print new-page=yes 및 new-system=yes 요소와 그 안의 전체 악보용 system 간격을 제거한다. Verovio가 현재 단일 파트와 화면 크기에 맞춰 재조판한다.
- 일반/public-domain 악보와 검색 결과의 작은 excerpt에는 적용하지 않아 원본 조판을 유지한다.
- 실제 API 검증: 이 사례의 상세 응답은 경계 때문에 21마디·1파트이며 강제 page/system break는 0개다. excerpt는 원본 조판 경로를 사용한다. 회귀 테스트 94개와 TypeScript 검증 통과.

## 2026-09-05 Fly Away 제한 악보 페이지 나눔 진단

- work-94ed97f401dcce21, kysing/84180.xml, 80–82마디 사례. 원본 P1/P2/P3 모두 78·90마디 시작에 print new-page=yes가 있다. 인근 new-system은 71·74·81·84·87마디.
- 상세 렌더링은 FullXmlNotation.tsx의 breaks=encoded로 원본 나눔을 유지한다. 검색 파트만 추출한 제한 미리보기에도 3파트 전체 악보의 페이지 지시가 남아 여백이 생긴다.
- 진단 요청이므로 조판 동작은 변경하지 않았다. 개선 후보: 제한 미리보기에 한하여 원본 강제 페이지 나눔과 간격을 제거하고 자동 재조판.

## 2026-09-05 처녀 뱃사공 가사 손상 진단 및 KY 상세 범위 확장

- 사례: work-cd00a09e05bd1b29-d08f9a8a, kysing/03008.xml, 20–22마디. Query는 이번 요청에 제공되지 않았다.
- 원본 파일은 strict UTF-8 디코딩에 성공하지만 U+FFFD 대체 문자가 318개 이미 저장되어 있다. 해당 마디의 lyric/text가 깨진 가사이며 음악 기호나 렌더러 폰트 문제가 아니다. 손실된 가사를 추측하여 복원하거나 삭제하지 않았다.
- 노래방 research-preview 상세 범위를 앞뒤 각 4마디에서 10마디로 확장. 원본 XML과 검색된 파트만 제공하는 제한 정책은 유지. 결과 조각은 일치 마디만 유지한다.
- 실제 API 검증: 상세 10–32마디 23개, excerpt 20–22마디 3개, 두 경우 모두 part 1개. 시작 ordinal offset도 각각 10/20으로 일치. 단위 테스트 93개 통과. 브라우저 시각 검증은 미실시.

## 2026-09-04 Q-P1-005 Mystery of Love 강조 누락 수정

- 사용자 Query와 targets는 evaluation/cases/q-p1-005-empty-measure-highlighting.json에 별도 저장.
- 빈 measure self-closing 태그가 다음 마디와 합쳐져 metadata/조각 추출 순번이 어긋났다. 실제 25–26마디를 32–33으로 표시했다.
- 원본 파일은 유지하고 서버의 공통 XML 읽기 단계에서 빈 마디 태그를 명시적 시작/종료 태그로 정규화했다. 재색인이 아닌 표시 좌표 처리 수정이다.
- 회귀 테스트 포함 93개 통과. 실제 API의 25–26마디 음표와 7개 targets 좌표 확인. 브라우저 시각 검증은 아직 하지 않았다. 기존 결과는 재검색 권장.

## 2026-09-04 Le quattro stagioni 9마디 끊긴 곡선 진단

- 사례: work-543780a0f9415f4d, P1:1:1, 표시 9마디.
- 원본 MusicXML에 F5–E♭5 및 C5–B♭4 각각 slur line-type=dashed 시작과 stop이 명시되어 있다. 잘린 타이나 인코딩 문제가 아니라 원본의 파선 슬러이다.
- 해당 판본에서 파선으로 지정한 편집 의도는 XML만으로 확정할 수 없다. 원본 기호 및 렌더링 코드는 변경하지 않았다.

## 2026-09-04 속도 개선 2단계: 후보 구간 정렬 실험

- 요청: 다음 속도 개선 작업 실행 및 개발 기록 유지.
- 전곡 local alignment를 seed 주변의 병합 구간으로 제한하는 선택형 경로를 추가했다. 기본 검색·contour·전곡 exact 검사는 유지한다.
- Q-P1-002, 003, 004 원본 fixture를 변경하지 않고 비교 실행기와 별도 JSON 보고서를 추가했다. Query 파일 hash, 순위, 점수, 작품 및 마디 범위를 저장한다.
- 초기 두 사례는 47.6→8.2초, 43.1→9.1초이나 상위 100개의 구성 변화가 있어 기본 적용을 보류한다. 결과 수가 같다는 이유로 재현율 보존을 주장하지 않는다.
- 상세: docs/performance-stage-2.md 및 evaluation/runs/performance-stage-2.json. 단위 테스트 92개와 TypeScript 검증 통과.
## 2026-09-04 · KY 일일 수집 설정과 PDMX 중복 템포 진단

- work-0e8609b50c02be68-30d416f5는 노래방 자료가 아닌 PDMX의 Phyllis go take thy pleasure이며 선택 stream은 P5:2:5이다. XML에 stem 방향이 지정되어 있으므로 음역만으로 일괄 뒤집지 않았다.
- 템포 중복: 원본 P1의 1마디, staff 1에 quarter=140 방향 요소가 다섯 번 들어 있다. default-y만 0/31.46/62.92/94.38/125.83로 달라 원본의 중복 지시가 표시된다. 뒤쪽에는 실제 템포 변화도 있어 전체 템포 삭제는 부적절하다. 이번에는 원인만 확인했으며 악보를 변경하지 않았다.
- KY 수집은 9월 3일 오전 9:37 이후 5건 상태에서 멈춰 있었고 기존 일일 자동화는 확인되지 않았다.
- 자동화 ky를 매일 오전 9시, 최대 100개 미매칭 번호 조회, 요청 간격 1.5초 이상으로 생성했다. 중복 실행 방지, 공식 번호 일치 검증, 실패 기록, 원본 XML 보존을 지시했다.
- 수집 요약은 docs/ky-collection-log.md, 날짜별 신규 목록은 docs/ky-collection/YYYY-MM-DD.md에 기록한다. 오늘 실제 수집 실행은 하지 않았으며 설정과 기존 기록 정리만 완료했다.

## 2026-09-04 · 1234 Back 악보의 물음표 진단

- 요청 사례: work-046bdc640e4f7062, 73–75마디, 금영 46277.xml.
- 원본 파일은 유효한 UTF-8이지만 U+FFFD 대체문자 1,354개가 이미 저장되어 있다. 전체 lyric 요소 1,159개 중 677개가 손상 문자를 포함한다.
- 73마디 음표의 lyric/text에도 대체문자가 확인되므로 Verovio 폰트 문제가 아니라 원본 가사 데이터 손상이다. 언제 손상됐는지는 현재 XML만으로 확정할 수 없다.
- 현재 XML의 인코딩 변경만으로는 복구 불가. 원본 MIDI 가사 이벤트의 바이트 또는 손상 전 자료가 필요하다.
- 이번 요청은 원인 확인이므로 악보와 가사를 자동 삭제하거나 변경하지 않았다. 표시 개선안은 손상 가사만 숨기고 정상 가사·음표는 유지하는 것이다.

## 2026-09-04 · 멜로디 검색 작곡가 인코딩 및 TITLE 제거

- 요청: 텍스트 검색은 Schönberg인데 멜로디 검색 편곡본에는 Sch鰊berg가 남는 차이를 해결하고 상세 페이지의 TITLE 라벨을 제거한다.
- 원인: 일부 편곡본의 legacy byte 문자열을 인코딩 복구하면서 한자 손상 이름이 새로 만들어졌다. 기존 이름 정규화는 디코딩 전에만 실행되어 그 결과를 놓쳤다.
- 해결: 서버에서 디코딩 후에도 이름 정규화를 수행한다. ResultCard는 sessionStorage에 남은 이전 검색 결과의 작곡가도 표시 시 정규화한다. 일본어·중국어의 정상 이름은 보존한다.
- UI: 상세 페이지의 TITLE 라벨만 제거하고 실제 작품 제목과 작곡가 표시는 유지한다.
- 검증: Q-P1-004의 6개 멜로디 결과가 모두 Claude-Michel Schönberg로 표시되는지 검증 스크립트를 추가했다. 데이터 원본이나 검색 점수는 변경하지 않았다.
- 기록 원칙: 앞으로도 사용자 요청, 원인, 수정 방법, 검증 여부를 이 개발 기록에 남기고 Query 사례·실행 결과는 evaluation/에 별도 보존한다.

## 2026-09-03 검색 일치 구간·전체 악보 렌더링 안정화

- 사용자 UI 회귀 사례에서 `<measure>` 정규식이 `<measure-style>`을, `<time>` 정규식이 `<time-modification>`을 오인하는 태그 경계 오류를 확인했다. 실제 태그 경계를 공백 또는 `>`로 제한하여 반복 마디·셋잇단음표 악보의 잘못된 조각 절단, divisions 상속 실패, 음표 겹침과 강조 누락을 함께 수정했다.
- 상세 화면과 결과 조각의 강조 음표가 달랐던 `A Lover's Concerto` 사례는 수정 후 양쪽 모두 14개로 일치했다. `THE POWER OF LOVE` 누락 사례도 조각과 상세에서 각각 10개의 강조 요소가 확인되었다.
- 화음 구성음마다 동일한 코드명이 lyric으로 복제된 XML은 같은 마디·staff·onset·가사 번호·텍스트의 중복을 렌더링 직전에 한 번만 남긴다. 원본 XML은 변경하지 않는다.
- 중국어 악기명 `降B調小號`를 `B-flat Trumpet`으로 표시하며, 자주 쓰이는 중국어 간체·번체 악기명 번역표를 API와 악보 XML 응답에 적용했다.
- 검색 결과가 기본 `P1:1:1` 이외의 stream이면 제목 위에 악기명과 Part/Staff/Voice를 표시한다. 상세 화면 제목 아래에는 작곡가 또는 노래방 가수 정보를 표시한다.
- 4마디를 초과하는 악보 조각은 음표 크기를 유지한 채 내용 너비를 늘리고 가로 스크롤로 탐색한다.
- `THE LAST NIGHT OF THE WORLD`의 작곡가 표기를 원본 XML에서 다시 동기화하여 `Claude-Michel Schönberg`로 복구했다. 정상 Latin 악센트를 CJK로 재해석하지 않도록 인덱싱·표시 복구 규칙도 보완했다.
- Phase 1 Harness에 `Q-P1-003` BWV Anh. 114 사례를 추가했다. 직접 정렬에서는 18마디 후보가 Contour 100, Rhythm 92.5, local similarity 79.60이지만 200개 검색 결과 후보에는 진입하지 못했다. 최종 Downbeat 가중치만 올려서는 이미 탈락한 후보를 복구할 수 없으므로 metrical-skeleton retrieval 채널이 필요하다.
- PDMX `Chant du départ` 사례에서 정상적인 프랑스어 악센트를 Shift-JIS/GB 계열 문자로 다시 해석하던 메타데이터 복구 오류를 수정했다. 정상 Latin 확장 문자는 보존하며, CSV 원본으로 특정 작품의 DB·FTS 메타데이터를 다시 동기화하는 도구를 추가했다.
- 노래방 `research-preview` 상세 화면은 검색 일치 마디 앞뒤 4마디씩, 보통 최대 10마디를 제공한다. 결과 목록과 상세 상단의 작은 검색 일치 구간은 정확한 일치 마디만 표시한다.
- 페이지별 진행 상태 문구를 실제 처리 단계에 맞게 `악보 렌더링 진행 중`과 `악보 렌더링 완료`로 정리했다.
- 재현 사례: `work-619552326277915e`, 4–5마디. 원본 XML과 검색 음표 데이터는 정상이지만 검색 일치 구간과 전체 악보가 비어 있었다.
- 전체 악보 실패 원인은 선택적 `playbackNotes`의 기본값으로 매 렌더마다 새 배열을 만들던 데 있었다. 렌더 효과가 상태를 다시 갱신하면서 React의 최대 업데이트 깊이 오류가 반복되었다. 모듈 범위의 고정 빈 배열을 사용하도록 수정했다.
- Verovio WASM 초기화는 화면의 악보 컴포넌트마다 반복하지 않고 하나의 초기화 Promise를 공유한다. 각 악보는 이 런타임에서 별도 toolkit을 생성한다.
- 검색 일치 구간은 브라우저에서 전체 XML을 다시 자르지 않는다. `/api/work`에 `excerpt=1`을 전달하여 서버가 목표 part와 정확한 ordinal 마디만 담은 작은 MusicXML을 반환하고, 클라이언트는 이를 즉시 조판한다. 이 사례의 응답은 137,092자에서 23,011자로 줄었고 Verovio 1페이지 렌더링이 확인되었다.
- 상세 화면 상단도 결과 카드와 같은 `SearchExcerpt` 경로를 사용하도록 통일하여 두 화면의 조각 생성 방식이 달라지는 회귀를 막았다.
- 로딩 문구는 `악보 조각을 불러오는 중…` 대신 `검색 일치 구간을 불러오는 중…`으로 변경했다. 렌더링 예외는 더 이상 빈 화면으로 숨기지 않고 오류 메시지와 개발자 콘솔에 표시한다.
- 대용량 전체 악보는 목표 페이지를 우선 3쪽씩 렌더링하고, 나머지는 스크롤 또는 `다음 3쪽 불러오기`로 요청할 때만 추가한다. 다른 탭의 100쪽 이상 악보가 백그라운드에서 계속 조판되는 문제를 방지한다.
- 검증: Vitest 9 files / 81 tests 통과, TypeScript 및 Vite production build 통과.

이 문서는 사용자 요청, 구현 결정, 검증 상태와 다음 작업을 누적 기록한다. 기능을 변경할 때마다 관련 항목과 검증 결과를 갱신한다.

## 2026-08-30: 원본 연속 선율 우선·장식음 예외 제한

- 검색 기본 단위는 대상 MusicXML의 같은 part/staff/voice에 있는 연속 sounding melody 전체로 유지한다.
- 중간 음표를 건너뛰는 sparse alignment는 일반 규칙이 아니라 제한된 예외로 취급한다.
- 원본 `<cue/>` 표기는 편집자가 명시한 강한 보조층 근거이므로 단독으로 예외를 허용한다.
- 자동 추론 음표는 `passing/neighbor 형태`, `대표 음가의 60% 이하인 짧은 음`, `metric weight 0.5 미만의 약박` 세 신호 중 최소 두 가지를 동시에 만족해야 가벼운 보조음으로 인정한다.
- passing tone처럼 보인다는 이유 하나만으로 긴 음이나 박절상 중요한 음을 건너뛰지 않는다.
- 일반 stream에서 두 음 이상을 건너뛸 때는 건너뛴 음의 80% 이상이 위 조건으로 설명되어야 검색 결과를 허용한다.
- 1박은 metric 1.0, 3박은 0.65, 나머지 정박은 0.45, offbeat는 0.2로 구분하여 downbeat 이외의 박절 계층도 구조 가중치에 반영한다.
- cue 기반 structural stream과 원본 surface stream을 모두 인덱스에 보존하므로 일반 선율 검색 능력을 없애지 않는다.

## 2026-08-30: Beauty and the Beast upbeat 결과 진단·Tuplet 설계

- 제보 Query로 `work-4229f41fc20f9574` 26–28마디 결과를 재현했다.
- 실제 선택 후보는 26마디 3.5박에서 시작하는 `E4–F4–D5–C5–C4–E4–G4–F4`였다.
- Query와 U/D 방향열이 모두 같아 contour 100점, rhythm DTW 83점이었지만 meter 15점, structural reduction 43점에 불과했다.
- Query 첫 downbeat에 대응하는 후보 downbeat가 없는데도 기존 최대 -8점 감점만 적용되어 local similarity 66점, 전체 3위로 노출된 것이 원인이었다.
- 중요 박 일치는 최대 +6점, 중요 박 불일치는 최대 -14점으로 조정했다. 해당 결과의 local similarity는 60점으로 내려갔다.
- 감점 후에도 corpus 내 상대 순위가 3위로 남아, downbeat 대응 0개·structural 50점 미만·최종 local 65점 미만을 동시에 만족하는 `surface-only weak match`는 일반 결과에서 제외하도록 했다. 제보된 Beauty and the Beast 결과는 더 이상 반환되지 않는다.
- Tuplet 입력은 선택한 음표 수 N을 actual-notes로 고정하고 `N notes in the time of M`의 normal-notes M을 고르는 방식을 권장한다.
- 기본 preset은 3:2, 2:3, 5:4, 6:4, 7:4로 두고, 선택 음표들의 written duration에 M/N을 곱해 실제 재생·검색 시간을 계산한다.
- 첫 구현에서는 같은 written note value를 가진 음표만 한 tuplet으로 묶고, 혼합 음가는 후속 단계에서 custom span으로 확장한다.
- QueryEvent에는 tupletGroup, actualNotes, normalNotes, writtenDuration을 보존하고 MusicXML에는 time-modification과 시작/끝 tuplet notation을 생성한다.
- 검색은 표기 음가가 아니라 effective duration과 IOI를 사용하고, Exact rhythm 검색에서는 tuplet ratio까지 반영된 실제 시간이 같아야 한다.
- 장기적으로 `Advanced search` 접이식 패널에 Exact interval, 쉼표 처리, 리듬 허용 범위, downbeat 기준, 구조 가중치와 결과 내 재검색을 모으는 방향을 채택한다.

## 2026-08-30: Schenker-informed 기둥선 검색

- 완전 자동 셴커 분석이라는 표현 대신 `Schenker-informed structural reduction` 보조 계층으로 구현했다.
- 각 선율 음에 강박, 상대적으로 긴 음가, 프레이즈 양끝, 국소 최고·최저음을 더하고 경과음·보조음을 빼서 `structuralWeight`를 계산한다.
- 동일 방향의 양쪽 step으로 연결되는 가운데 음은 passing, 앞뒤 음이 같고 step으로 이탈·복귀하는 음은 neighbor로 분류한다.
- passing/neighbor는 최소 가중치를 유지하되 local alignment의 삽입·삭제·대체 비용을 낮춘다. 따라서 장식음 수와 표면 리듬이 달라도 기둥음 진행이 정렬될 수 있다.
- weight 0.62 이상의 음을 기둥선으로 축약한다. 기둥음이 너무 적으면 weight 상위 음을 시간순으로 보충하여 최소 비교선을 만든다.
- Query 기둥선과 후보 기둥선을 별도의 transposition-invariant local alignment로 비교한다.
- 구조 similarity 90 이상은 confidence에 따라 최대 +8점, 75 이상은 최대 +4점, 60 이상은 최대 +1점을 준다.
- 구조가 다를 때는 별도의 구조 벌점을 주지 않는다. 표면 선율 점수는 그대로 유지하여 구조 분석의 불확실성이 결과를 과도하게 떨어뜨리지 않게 했다.
- 결과의 Structural score와 Why this matched에 축약된 Query/후보 기둥음 수, 구조 similarity와 bonus 여부를 표시한다.
- 장식음과 다른 표면 리듬을 사이에 둔 동일 기둥선, passing/neighbor 저가중치, 다른 기둥선 무벌점 회귀 테스트를 추가했다.
- 전체 테스트 43개 통과.

## 2026-08-30: Exact interval·결과 내 재검색·Downbeat 가중치

- Melody only와 Melody + Rhythm에 `Exact interval only` 옵션을 추가했다.
- Exact는 절대 MIDI pitch 고정이 아니라 일정한 조옮김을 허용한 연속 음정열의 완전 일치로 정의한다.
- Melody only Exact는 음정열만 비교하고 리듬은 무시한다.
- Melody + Rhythm Exact는 음정열과 내부 쉼표가 만든 IOI 및 마지막 음가까지 정확히 같아야 한다. insertion, deletion, substitution은 허용하지 않는다.
- Exact 결과 설명에 조옮김 허용과 모드별 완전 일치 조건을 명시한다.
- `Search within results` 옵션을 추가했다. 현재 결과에 들어 있는 work ID 집합을 다음 API 요청의 scope로 전달하고, n-gram 후보를 정렬하기 전부터 해당 작품군으로 제한한다.
- 결과가 없거나 첫 검색 전에는 결과 내 재검색을 비활성화하며, Clear 및 Contour 전환 시 scope를 해제한다.
- 두 옵션 상태를 sessionStorage에 보존하고 Copy Query JSON에는 Exact 설정을 포함한다.
- Downbeat는 독립 bonus가 아니라 정렬된 중요 박의 증거로 사용한다. Query downbeat와 후보 downbeat가 선율적으로 일치하면 최대 +4점, 중요한 박이 어긋나면 최대 -8점을 적용한다.
- 결과의 meter score와 Why this matched 설명에 실제 downbeat 대응 개수를 반영한다.
- Exact interval, rhythm 조건, 결과 scope와 downbeat 증거 회귀 테스트를 추가하여 전체 40개 테스트 통과.
- 프로덕션 빌드 통과 및 로컬 브라우저에서 두 옵션의 배치, 활성/비활성 상태와 Exact 검색 동작을 확인했다.

## 2026-08-30: 검색 개선 1–3단계 구현

- Query의 sounding note마다 누적 onset을 계산하고 내부 쉼표 길이를 다음 음까지의 IOI에 보존한다. 선행 쉼표는 첫 sounding onset을 기준으로 정규화되므로 검색에 영향을 주지 않는다.
- corpus note에도 인덱스의 절대 onset을 전달하여 query와 후보가 같은 IOI 표현으로 rhythm DTW에 들어가도록 했다.
- 리듬 오차는 전역 tempo 정규화 뒤 log2 ratio로 계산하며 약 9% 이하는 dead zone으로 무감점 처리한다. 이후에는 선형+제곱 비용으로 큰 변화가 빠르게 불리해진다.
- Melody + Rhythm 최종 점수에 비선형 rhythm gate를 적용했다. 85점 이상은 무감점, 65–85는 약한 감점, 45–65는 큰 감점, 45 미만은 강한 감점이다.
- 제보 Query에서 기존 `Lead the Way` 오탐은 rhythm 54.9점, local similarity 54.9점으로 내려갔다. 이전 값은 rhythm 43.8점, local similarity 77.3점이었다. 새 voice 파서로 인덱스를 재생성하면 비정상 후보 stream 자체도 제거된다.
- Contour는 S/U/D 방향 완전 일치를 계속 필수로 하고 step/leap은 soft ranking evidence로만 사용한다.
- 그린 선의 4px 이하 수직 흔들림은 S로 보고, 나머지 선분 이동량 중앙값의 1.8배이면서 최소 14px 이상인 명확한 움직임만 leap으로 해석한다.
- step/leap 경계에서 멀수록 shape confidence를 높이고, 애매한 제스처는 결과 순위에 적게 반영한다.
- Contour는 sounding point만 만들기 때문에 쉼표를 무시한다.
- 관련 회귀 테스트를 34개로 확장했다.

## 2026-08-30: 리듬·구조·Contour 검색 점수 설계안

- Melody + Rhythm은 전역 tempo 정규화 뒤 각 대응 IOI/duration ratio의 `abs(log2(q/c))` 오차를 사용한다.
- 작은 리듬 변화에는 dead zone과 완만한 quadratic 비용을 적용하고, 중간 범위 이후 비용을 가파르게 높이는 piecewise loss를 권장한다.
- 초기값 제안: 약 9% 이하는 무감점, 9–25%는 작은 감점, 25% 이상은 급격한 감점. 실제 relevance set으로 보정한다.
- rhythm score 85 이상은 최종 순위에 거의 영향을 주지 않고, 65–85는 완만한 감점, 45–65는 큰 감점, 45 미만은 하위 bucket 또는 제외하는 gate를 Melody + Rhythm 모드에 추가한다.
- 쉼표는 독립 pitch event로 비교하지 않되, 앞 음 onset에서 다음 음 onset까지의 IOI에 포함한다. 선행 쉼표는 무시할 수 있지만 내부 쉼표는 리듬 정보로 보존한다.
- 현재 melody local alignment는 음정 크기, U/D/S 방향, step/leap 형태, insertion/deletion을 이미 비용화한다. 향후 query 길이·구조 중요도에 따라 비용을 보정한다.
- downbeat 일치 자체에 무조건 bonus를 주지 않고, 양쪽의 중요한 박절 위치에 대응한 음이 선율적으로도 일치할 때 match weight를 높이며 중요한 박의 불일치는 더 크게 벌점화한다.
- Schenker 검색은 완전 자동 분석이라고 부르지 않고 `structural reduction` 또는 `Schenker-informed` 보조 점수로 구현한다.
- surface, reduced foreground/중경층 후보, phrase anchor의 3단계 stream을 만들고 passing/neighbor tone 축약 뒤 각 단계의 interval/contour local alignment를 비교한다.
- 구조 점수는 duration, downbeat, chord-tone support, tie sustain, local registral prominence, phrase/cadence 위치와 분석 confidence로 산출하며 최종 bonus는 약 10점 이내로 제한한다.
- Contour 검색의 필수 조건은 S/U/D 방향열 일치로 단순화하고 step/leap은 soft bonus로만 사용한다.
- 그린 선의 step/leap 의도는 절대 반음뿐 아니라 각 stroke의 비영(非零) 수직 이동 중앙값과 비교한다. 다른 선분보다 약 1.8배 이상 크게 움직인 선분을 leap 후보로 보고 차이가 클수록 bonus confidence를 높인다.
- Contour의 쉼표는 무시한다. 방향은 연속된 sounding point 사이에서 계산하므로 검색 의미가 유지된다.

## 2026-08-29: Query 복사와 Lead the Way 오탐 재현

- 입력 영역 도구 모음에 `Copy Query` 버튼을 추가했다.
- 현재 mode, meter, 모든 음표·쉼표의 pitch, duration, tie 정보를 포함한 `musicanote-query` JSON을 클립보드에 복사한다.
- 복사 성공 시 버튼이 잠시 `Copied` 상태로 바뀌며, 실패하면 브라우저 클립보드 권한 안내를 표시한다.
- 제보 Query `E4(0.5), F4(1), A4(1), G4(1), rest(1), E4(0.5), F4(1), A4(1), G4(1)`로 `work-1e88e39d02541341`을 재현했다.
- 기존 잘못된 후보 stream `F2–B♭2–D3–C3–A2–B♭2–D3–C3`과 local similarity 77점, contour 100점, rhythm DTW 44점으로 정렬된 것을 확인했다.
- 화음 voice 상속 파싱 오류가 주원인이며, 낮은 리듬 점수 결과를 별도 탈락시키지 않는 현재 기준도 오탐 노출에 기여했다.

## 2026-08-29: 속성이 없는 못갖춘마디와 화음 voice 상속

- Huey Lewis의 `4. The Power of Love, Piano Solo.musicxml.xml`은 첫 마디가 4/4의 1박 길이지만 `implicit="yes"`가 없고 `number="1"`로 저장되어 있었다.
- 첫 마디의 실제 cursor 길이가 박자표의 정규 마디 길이보다 짧은지도 계산하여 못갖춘마디를 판정하도록 확장했다.
- 이 경우 첫 마디는 0, 다음 XML 마디 2는 표시 마디 1이 되도록 이후 숫자 마디 번호 전체에 offset을 적용한다.
- Verovio 상세 악보·악보 조각, 검색 API 표시 번호, 새 MusicXML 인덱스가 같은 판정법을 사용한다.
- `work-1e88e39d02541341`은 `Lead the Way` 피아노 파트의 F2–B♭2–D3–C3 반복을 잡은 결과였으나, 화음 후속 음표에 `<voice>`가 생략되었을 때 voice 1로 새로 분리한 기존 파서 때문에 생긴 잘못된 검색 스트림임을 확인했다.
- 화음 후속 음표는 직전 화음 시작 음표의 voice와 staff를 상속하도록 인덱서 파싱을 수정했다. 인덱스 재생성 후 해당 오탐은 제거 대상이다.
- Python 파서 컴파일 및 Huey Lewis 원본 표본 파싱 확인, 전체 테스트 29개와 프로덕션 빌드 통과.

## 2026-08-29: 못갖춘마디 번호와 악보 조각 재생 위치

- MusicXML 첫 마디에 `implicit="yes"`가 있으면 표시 마디 번호를 `0`으로 정규화한다.
- 검색 엔진 내부의 1부터 시작하는 마디 순번과 MusicXML의 표시 마디 번호를 분리했다.
- 표시 번호 `0`을 falsy 값으로 오인해 내부 순번 `1`로 바꾸던 API fallback 오류를 제거했다.
- 악보 상세 화면과 검색 결과 악보 조각 모두 원본 MusicXML의 마디 번호를 사용한다.
- 앞으로 새로 만드는 검색 인덱스도 첫 implicit measure를 `0`으로 기록한다.
- 실제 corpus의 `3. Carrying You, Piano Solo.xml`에서 첫 마디가 `implicit="yes" number="0"`이고 인덱스에도 `mn: "0"`으로 보존되는 것을 확인했다.
- 검색 결과 악보 조각의 재생 막대를 시간 비율 기반 애니메이션에서 Verovio SVG 음표의 실제 x좌표 기반 이동으로 변경했다.
- 재생 중 현재 음표가 가로 스크롤 영역 중앙에 오도록 자동 스크롤하며, tie로 합쳐진 음은 첫 음표 위치에서 합산 길이만큼 유지한다.
- 전체 테스트 27개와 Vite 프로덕션 빌드 통과.

## 프로젝트 기준

- 검색 corpus: 당분간 `K:/Music Analysis/musicxml`의 MusicXML 데이터
- 악보 렌더링: Verovio
- 검색 구조: compact MusicXML melody stream + SQLite n-gram 역색인 + 후보 정밀 비교
- 최소 query: 음표 4개. 일반 선율은 6–12음, contour는 8–12음 권장
- 원본 표기 보존: 조표, 임시표, 음자리표, 파트, 마디 번호, tie와 쉼표는 원본 MusicXML 기준

## 누적 요청 및 구현 상태

### Query 입력

- Clear 뒤에도 빈 오선과 건반 유지
- Delete last 및 선택 음표 삭제
- 음표별 음가 조절과 64분음표–온음표 입력
- 음가 단계: 0.0625, 0.125, 0.25, 0.5, 1, 1.5, 2, 3, 4박
- 인접한 동일 음 두 개를 선택해 tie 생성; 검색·재생에서는 하나의 sounding event로 병합
- 오선 음표 선택과 수직 드래그 pitch 수정
- Melody only에서는 stem 없는 note head 사용
- 독립 contour 패널, Undo/Redo/Clear 및 contour 전용 검색
- 허밍 입력 실험 기능
- 긴 query 재생 뒤 기본 query로 되돌아가던 상태 문제 수정
- 2026-08-28: Query 건반 범위를 C2–E6(MIDI 36–88)로 확장

### 검색 및 파싱

- MusicXML을 melody/interval/contour/rhythm 특징으로 파싱
- tie chain 병합, source part/staff/voice 식별
- 3-gram 역색인으로 후보 위치 검색
- Melody, Melody + Rhythm, Contour 모드별 점수 분리
- Contour 검색은 이전 오선 query와 분리; U/D/S 전체 일치만 허용하고 Step/Leap 일치를 우선
- 2026-08-28: n-gram 후보 뒤에 semi-global Smith–Waterman 방식 local alignment 추가
  - 후보 앞뒤 자유 절단
  - 장식음/추가음 insertion과 query 누락 deletion 허용
  - 음정, 방향, Step/Leap, 리듬 비율의 모드별 비용
  - query coverage 75% 미만 후보 제거

### 검색 결과와 상세 악보

- 결과별 원본 MusicXML 악보 조각, 파트 이름, 재생, YouTube iframe
- 검색에 감지된 음표만 붉게 표시
- 화음 구성음 하나가 감지되면 같은 onset의 chord stack 전체 강조
- tie continuation 전체 강조
- 원본 조표, 박자표, 음자리표, 임시표, 쉼표와 마디 번호 유지
- 검색 파트만 발췌하고 상세 페이지에서는 전체 XML 악보 표시
- 악보 조각 클릭 시 상세 악보의 일치 위치로 이동
- 카드 악보는 620px 고정 engraving 폭과 가로 스크롤 사용
- 상세 악보 페이지 여백·배율·페이지 하단 잘림 조정
- 2026-08-28: 결과 악보 재생 시 마디 경계 표시용 tie 조각을 다시 하나의 sounding event로 병합
- tie로 합산된 전체 음가 동안 oscillator를 한 번만 attack하고 지속하도록 수정
- 검색 결과 악보 위에 시간 진행을 따라가는 붉은 세로 playhead 추가
- 쉼표 첫 이벤트에 원본 음표 전체를 메타데이터로 덮어써 쉼표가 음표로 재생되던 오류 수정

### 분석과 외부 데이터

- pitch, rhythm, measure density 통계
- 4–8음 가변 길이 interval motif 분석
- motif 점수: 반복 횟수 × 완만한 길이 보너스 × 평균 지속시간 보너스
- 긴 motif에 포함되는 짧은 중복 패턴 억제
- YouTube Data API 일일 quota 범위의 대표 영상 backfill 스크립트와 상태 파일
- 외부 재생 불가 영상 제외를 위한 embeddable/syndicated 조건

### 백업

- 로컬 Git 저장소와 첫 백업 커밋 `e5d8ba8` 생성
- GitHub `snoopyinwonderland/MusicSearch` 원격 연결
- 대용량 재생성 인덱스(SQLite/JSONL), 환경변수, node_modules 및 build 산출물 제외
- GitHub 저장소 Private 전환은 이메일 본인 확인 대기 중이며 아직 push하지 않음

## 검색 개선 로드맵

1. **Local alignment** — 1차 구현 완료, 비용 보정 진행
   - 실제 대응 음표 경로, insertion/deletion 및 결과 악보 인덱스 검증 완료
   - 정렬 비용을 평가 query set으로 보정
   - 반음 경과음은 작은 substitution으로 해석될 수 있으므로 실제 정답 세트에서 insertion 경계를 보정
2. **제한적 rhythm DTW** — 1차 구현 완료
   - n-gram/local alignment 후보의 실제 일치 span에만 적용
   - 전체 템포 확대·축소에 불변인 duration 비교
   - 22% diagonal band와 1:1, 1:2, 2:1 대응만 허용
   - Melody + Rhythm 최종 유사도에 22% 반영; Melody only와 Contour에는 미적용
3. **음표 분할·병합 규칙**
   - 긴 음과 반복음, tie 유무가 다른 동등 표현, grace note 처리
4. **Melody stream 개선**
   - polyphony, chord top/bottom/metric voice, 피아노 양손과 교차 성부
5. **구조적 음표 검색**
   - 강박, 긴 음, 프레이즈 경계, 종지, 음역 극점 기반 salience
6. **다중 인덱스 및 대규모 평가**
   - exact/coarse interval, contour, rhythm, structural n-gram
   - 정답 세트 기반 Recall@K, MRR, 구간 IoU 측정

## 저작권 제한 corpus 공개 정책

### 2026-08-28 요청

- 노래방 MIDI corpus를 한국 가요 저작권·유사도 연구와 검색에 활용
- MIDI 제작자의 전체 편곡/악보는 공개하지 않음
- 검색 결과 악보 조각과 상세 화면의 제한된 문맥만 제공하는 방안 검토
- 저장 공간과 공개 정책이 준비될 때까지 한국 가요 MIDI corpus 추가는 보류하고 검색 엔진 개선을 우선

### 권장 설계

- 원본 MIDI와 전체 변환 악보는 비공개 저장소에만 보관하고 직접 다운로드 API를 두지 않는다.
- 공개 검색 인덱스에는 interval/contour/rhythm n-gram, 통계와 opaque source ID만 저장한다.
- 작품별 권리 상태를 `licensed`, `public-domain`, `research-preview`, `metadata-only`, `blocked`로 관리한다.
- `research-preview`는 검색 일치 음표 중심의 최소 문맥만 서버에서 즉시 렌더링하고 영구 SVG/MusicXML URL을 만들지 않는다.
- 상세 화면은 전체 악보 대신 일치 지점 전후의 제한된 문맥과 분석 설명을 제공한다.
- 사용자가 임의 마디로 이동하거나 연속 조각을 조합해 전체 악보를 복원하지 못하도록 한다.
- 악보 조각에 출처, 연구/비평 목적, 권리자 및 삭제 요청 경로를 표시하고 접근 로그와 rate limit을 둔다.
- MIDI 재생은 원곡/편곡을 복원할 수 있는 긴 재생 대신 검색된 짧은 단선율 또는 합성된 비표현적 preview로 제한한다.
- 허용 길이를 고정 마디 수만으로 결정하지 않고, 전체 대비 비중·핵심성·시장 대체 가능성과 이용 목적을 함께 검토한다.
- 실제 공개 전 한국저작권위원회 상담 또는 음악저작물/편곡 이용허락 검토를 거친다.

## 최근 검증

- 2026-08-28: 전체 테스트 26개 통과
- local alignment 전용 테스트: 전조된 내부 구간, 반복 장식음 insertion, query note deletion
- 실제 SQLite 검색 결과의 alignment index가 악보 조각 범위 안에 있는지 통합 검증
- rhythm DTW: 전역 tempo augmentation, 1→2 음가 분할, 상이한 리듬 페널티 검증
- 마디 경계를 넘는 표시용 tie 조각이 재생 직전에 하나의 2박 sounding event로 복원되는지 검증
- TypeScript 및 Vite 프로덕션 빌드 통과

### 2026-08-30 — A Whole New World 21마디 순위 회귀 수정

- 문제 원인: `E–F–A–G / 쉼표 / E–F–A–G` 쿼리와 조옮김 관계로 연속 음정열이 완전히 같은 21마디 선율이, 길게 타이된 기둥음 때문에 rhythm DTW에서 과도한 감점을 받아 상위 결과에서 사라짐.
- 일반 유사 검색에서도 전체 후보 선율을 대상으로 조옮김 불변의 연속 음정열 완전 일치 구간을 별도로 검출하도록 변경.
- 완전한 음정열 증거가 있으면 타이·긴 지속음 때문에 리듬 점수가 검색 결과 자체를 제거하지 않도록 감점 폭을 제한함. 단, 리듬 차이는 순위 결정에 계속 반영함.
- 리듬을 단순 절대 IOI뿐 아니라 `short / normal / long` 반복 형태와 포화된 상대 길이로 비교하는 phrase-shape 점수를 추가함. 긴 기둥음은 `long`으로 유지하되 무한히 큰 오차처럼 계산하지 않음.
- exact interval 결과에서는 잘린 8음 창의 불안정한 구조 보너스와 n-gram 적중 개수가 과도하게 순위를 바꾸지 않도록 제한함.
- Solo/Duet/Trio/Quartet 중 같은 선율의 중복 판본이 있으면 편성명이 붙지 않은 canonical 판본에 작은 대표성 보너스를 부여함.
- 회귀 결과: `A Whole New World.xml`의 20–23마디(핵심 기둥음 21마디)가 전체 1위, 잘못 우선되던 Piano Solo 44–45마디는 해당 곡 결과 중 후순위.
- 자동 테스트 50개 및 프로덕션 빌드 통과.

### 2026-08-30 — Schenker 관점의 구조적 재순위화 보강

- 기본 검색 후보는 원본의 연속 멜로디로 유지하고, 구조 분석은 후보를 띄엄띄엄 새로 만드는 기본 경로가 아니라 재순위화 계층으로만 사용함.
- 기둥음 중요도에 강박, 긴 음가, MusicXML에서 병합된 타이, 음역의 국소 극점, 쉼표 전후 프레이즈 경계를 함께 반영함.
- 쉼표 직전의 종결음과 쉼표 뒤의 재진입음을 강한 프레이즈 경계로 처리해, 쿼리의 쉼표와 대상 악보의 긴 타이·지속음이 서로 다른 표면 표기여도 골격을 비교할 수 있게 함.
- 단순히 두 이웃 사이를 순차 진행한다는 이유만으로 passing/neighbor로 낮추지 않음. 짧은 음가 또는 약박이라는 표면 증거가 함께 있을 때만 장식음 역할을 부여함.
- cue 음표는 계속 가장 강한 장식층 증거로 취급하고, 일반 음표를 건너뛰는 sparse alignment는 기존처럼 생략 음표의 80% 이상이 명확하게 설명될 때만 허용함.
- 구조 일치 보너스는 일반 유사 결과에서 최대 12점으로 제한함. 이미 연속 음정열이 완전히 일치한 결과에는 최대 3점만 허용해 구조 분석이 리듬·연속 선율 증거를 압도하지 않게 함.
- `A Whole New World` 21마디 계열은 구조 점수 100으로 최상위에 유지되고, 리듬 형태가 덜 맞는 동일 음정열 곡들은 그 아래로 정렬됨.
- 장식음 분류, 강박 보호, 쉼표 경계, 긴 타이 기둥음 및 실제 순위 회귀를 포함한 자동 테스트 52개 통과. 프로덕션 빌드 통과.

### 2026-08-30 — 분석 보고서 반영: 박자표별 metric hierarchy

- 외부 `analysis_report.md`의 음악이론 검토를 반영함. 가장 높은 우선순위로 지적된 4/4 중심의 metric weight 모델을 교체함.
- 기존 문제: 3/4의 3박을 4/4의 중강박처럼 처리하고, 6/8을 길이만 3인 단순박자로 보며, 후보 악보의 실제 MusicXML 박자표 대신 query 박자표로 후보 구조를 분석하고 있었음.
- `metricWeightAt(position, meter)`와 `parseMeter()`를 추가해 박자표별 계층을 분리함.
  - 2/4: 1박 > 2박 > 분할박
  - 3/4: 1박 > 동일한 2·3박 > 분할박
  - 4/4: 1박 > 3박 > 2·4박 > 분할박
  - 6/8·9/8·12/8: 점4분음표 단위의 복합박 그룹 시작을 강박으로 처리
  - 5/4: 기본 3+2 그룹, 7/8: 기본 2+2+3 그룹으로 처리
- query와 후보가 서로 다른 박자표여도 각각의 metric hierarchy를 계산한 뒤 강도 수준을 비교하도록 `metricalEvidence`를 변경함.
- 검색 후보마다 해당 구간의 MusicXML 박자표를 읽어 structural annotation과 metric score에 사용함. 중간 박자 변경도 후보 시작 마디를 기준으로 반영하며, 반복 XML 파싱을 줄이기 위한 meter cache를 추가함.
- MusicXML의 `3+2` 같은 additive `<beats>` 값도 합산해 읽도록 보완함.
- 검색 UI의 박자 선택 항목을 2/4, 3/4, 4/4, 5/4, 3/8, 6/8, 7/8, 9/8, 12/8, unknown으로 확장함.
- 악보 조각의 beat 좌표는 4분음표 단위이므로 6/8 마디를 6이 아닌 3단위로 채우도록 쉼표·타이 분할 계산을 수정함.
- 보고서의 두 번째 높은 우선순위도 반영: spelling의 음이름 글자 간격을 이용해 `F–G♯` 같은 증2도는 contour에서 step, `C–E♭` 같은 단3도는 leap으로 구별함.
- 단순·복합·비대칭 박자, 서로 다른 meter hierarchy 비교, 증2도/단3도 구별, 6/8 악보 조각 길이 및 기존 검색 순위를 포함한 자동 테스트 59개 통과. 프로덕션 빌드 통과.

### 2026-08-30 — 낮은 품질 결과가 목록에 남는 원인 진단

- 사용자 화면의 `All Out of Love`, Violin, 89–90마디 결과를 확인함. Query는 `E–F–A–G / 4분쉼표 / E–F–A–G`, 첫 E는 8분음표이고 나머지는 4분음표인 기존 4/4 query.
- 감지된 후보는 `E♭–F–G♭–E♭–C–D♭–E♭–C`의 연속 8음으로, 삽입·누락 없이 U-U-D-D-U-U-D contour만 완전히 같음.
- component score는 pitch 71, interval 84, contour 100, rhythm 50, meter 58, structural 43, 최종 local similarity 40임. 구조 보너스는 적용되지 않음.
- sparse melody 오검출은 아님. 연속 8음을 사용했기 때문에 `sparseAlignmentAllowed`의 장식음 80% 조건은 검사할 건너뛴 음 자체가 없음.
- 남은 직접 원인 1: 검색 API가 최소 합격점 없이 요청된 상위 20개를 채워 반환하므로 40점 후보도 18위에 표시됨.
- 남은 직접 원인 2: 낮은 결과 제거 조건이 `metric.matches === 0`일 때만 동작함. 이 후보는 시작음이 4.25박의 약박이지만 뒤쪽 음 하나가 query의 중강박 계층과 일치하여 `metric.matches=1`이 되고 필터를 우회함.
- 권장 후속 수정: 정확 음정열 결과는 유지하되 일반 Melody+Rhythm 결과에 최소 local/interval/rhythm admission threshold를 두고, 결과 수가 20개보다 적더라도 낮은 품질 결과로 채우지 않음. 박절 일치 한 곳만으로 저점 필터 전체를 해제하지 않도록 조건을 분리함.

### 2026-08-30 — 결과 합격 기준 및 상세 화면 정렬 경로 수정

- 기존 수정 사항을 보존한 상태에서 현재 검색 코드와 두 사용자 제보 구간을 다시 확인함.
- 검색 결과는 `limit`를 목표 개수가 아닌 최대 개수로만 취급함. 조건을 통과한 작품이 적으면 결과 수도 그대로 적게 반환함.
- 일반 Melody+Rhythm 결과의 기본 합격 조건을 local similarity 55 이상, interval 65 이상, rhythm 55 이상으로 설정함.
- 구조적으로 확실한 변형은 local 50, interval 60, rhythm 45, structural 82 이상일 때만 제한적으로 예외 허용함. 조옮김 불변의 연속 음정열 완전 일치와 순수 contour 검색은 별도 의미가 있으므로 이 gate에서 제외함.
- `All Out of Love` Duet/Trio 89–90마디는 contour 방향만 100이고 local 40, rhythm 50, structural 43이므로 결과에서 제외됨.
- 상세 악보 화면이 URL의 마디 범위 안에서 query를 임의로 다시 정렬하던 로직을 수정함. 검색 결과 카드가 서버 alignment의 `onset:pitch` 대상 목록을 URL에 전달하고, 상세 화면은 이를 원본 전체 악보의 음표에 정확히 매핑함.
- 이전 링크처럼 target parameter가 없는 경우에는 session에 보존된 검색 결과 alignment를 우선 복원하고, 그것도 없을 때만 기존 local fallback을 사용함.
- `A Whole New World.xml` 20–23마디에서 첫 감지 음표가 앞 프레이즈의 4분음표가 아니라 20마디 2.5박의 `F♯4` 8분음표임을 회귀 테스트로 고정함.
- 저점 contour 우연 일치 제외, 결과 수 미충족 허용, 구조 예외, 첫 target 경계를 포함한 자동 테스트 62개 및 프로덕션 빌드 통과.
## 2026-08-30 — 프레이즈 문맥 기반 검색 구간 선택

- 특정 작품·쿼리·음높이를 고정하는 순위 규칙 대신 일반적인 프레이즈 증거 모델을 추가했다.
- `MUSICANOTE_Analysis_Harness_Guide.reviewed.md`의 Sounding Event 원칙에 맞춰 타이 continuation은 새 attack/phrase opening으로 취급하지 않는다.
- 쉼표 전후, 새 attack, 긴 지속음, 타이의 마디 경계 통과를 이용해 `phraseOpeningConfidence`와 `phraseClosingConfidence`를 별도로 계산한다.
- 같은 조옮김 음정열이 여러 곳에 존재하면 첫 출현을 고정 선택하지 않고 모든 출현의 프레이즈 문맥을 비교한다.
- 이전 프레이즈를 마치는 타이 지속음에서 시작하는 후보는 감점하고, 쉼표 뒤 새 attack에서 시작하는 후보를 우선한다.
- 파일명에 `solo/duet/trio/quartet`가 있는지로 판본 순위를 조정하던 `canonicalEditionBonus`를 제거했다.
- MusicXML 인덱서가 병합 Sounding Event의 tie-start provenance를 보존하도록 했다.
- 특정 work ID의 순위를 고정하던 테스트를 제거하고, 합성 음표열로 프레이즈 역할과 복수 출현 선택 논리를 검증한다.
- 검증: Vitest 62개 통과, TypeScript/Vite production build 통과.
## 2026-08-31 — Query 임시표 표기와 Exact 진단

- Query MEI 생성기가 `♯`·`♭` Unicode 표기를 해석하지 못해 MIDI 기반 sharp으로 되돌리던 문제를 수정했다.
- 같은 마디에서 G♯ 뒤 G처럼 동일 음이름을 원래 높이로 되돌릴 때 `accid="n"`을 명시해 제자리표가 표시되도록 accidental state를 추적한다.
- 건반에 ♯/♭ 선택 버튼을 추가했다. 선택은 이후 입력 음의 기본 spelling에 적용하며 sessionStorage에도 보존한다. 기존 음표는 유지하므로 한 Query에서 두 표기를 함께 쓸 수 있다.
- 건반 범위는 E6까지 유지하되 가장 높은 E6 키의 텍스트 라벨은 제거했다.
- Exact 검색은 spelling을 비교하지 않고 MIDI 기반 조옮김 불변 음정열과 리듬만 비교한다는 회귀 테스트를 추가했다. A♯/B♭ 및 G♯/A♭은 같은 Exact pitch evidence로 처리한다.
- 제보된 Hymne à l’amour 구간을 재현한 결과 음정열은 100점으로 완전 일치한다. 다만 Query의 두 번째 G♯4는 1박이고 원본 A♭4는 0.5박이므로 Melody+Rhythm Exact가 아니며 rhythm score는 약 93.61점이다. 이는 enharmonic spelling 때문이 아니다.
- 검증: Vitest 65개 통과, TypeScript/Vite production build 통과.

# 사용자 검증 Query와 오류 사례

이 장은 개발 중 사용자가 직접 입력한 Query, 기대 결과, 발견된 오류를 회귀 검증 자료로 보존한다. 작품 ID나 Query에 맞춘 production 예외를 만드는 용도가 아니다. 각 사례에서 드러난 일반 규칙을 합성 단위 테스트와 corpus 통합 테스트로 검증한다.

## Query 카탈로그

### Q-01 — 기본 7음 연속 선율

- 모드: Melody 또는 Melody + Rhythm
- 음표: `C4(1)–E4(1)–A4(1)–G4(1)–F4(1)–E4(1)–D4(1)`
- 용도: 검색 결과 악보 조각의 배율, 음자리표·조표·박자표 표시 일관성 확인
- 당시 지적: 결과마다 악보 조각 크기가 달랐고 일부 조각에서 음자리표·조표·박자표가 사라졌다.

### Q-02 — 반복 구절과 내부 쉼표

- 모드: Melody + Rhythm, 4/4
- 음표: `E4(0.5)–F4(1)–A4(1)–G4(1)–rest(1)–E4(0.5)–F4(1)–A4(1)–G4(1)`
- contour: `U–U–D–D–U–U–D`이며 쉼표는 방향 계산에서 제외
- 용도: 내부 쉼표 IOI, rhythm DTW, downbeat, phrase boundary, sparse alignment, 결과 합격 기준 검증
- 주요 기대 결과: 조옮김된 `A Whole New World` 20–23마디의 연속 선율이 상위에 나와야 한다.
- 발견된 문제:
  - `work-1e88e39d02541341`에서 잘못 분리된 피아노 voice가 `Lead the Way` 오탐으로 노출됨.
  - `work-4229f41fc20f9574` 26–28마디에서 약박 선율이 contour 100만으로 과대평가됨.
  - `work-f28d9adc7c2a5c75` 89–90마디에서 낮은 품질 후보가 결과 수를 채우기 위해 남음.
  - `work-40153ba016a3ef1f` 20–23마디에서 앞 프레이즈의 타이 종결음이 첫 일치음처럼 표시됨.
  - 긴 타이 기둥음 때문에 정작 적절한 `A Whole New World` 구간이 순위에서 사라진 회귀가 있었음.
- 일반화된 수정: voice 상속, 최소 합격 기준, phrase opening/closing confidence, 타이 continuation 비-attack 처리, 복수 Exact 출현의 문맥 비교.

### Q-03 — Hymne à l’amour 반음계·내부 쉼표 Query

- 모드: Melody + Rhythm, 4/4
- 최종 Query:

```text
B♭4(0.5)–A♭4(0.5)–G4(1)–rest(0.5)–
G4(0.5)–G4(0.5)–B4(0.5)–D5(0.5)–F5(0.5)–E♭5(2)
```

- 최초 입력에서는 `A♯4–G♯4–G4 … D♯5`로 표기했고 두 번째 음가를 1박으로 입력함.
- 원본과 맞게 B♭/A♭/E♭로 respell하고 두 번째 음가를 0.5박으로 수정한 뒤 interval 100, rhythm 100의 Exact가 됨.
- 용도: 이명동음, 제자리표, Exact interval/rhythm, 같은 pitch 반복 target 표시 검증
- 발견된 문제:
  - Unicode `♯/♭`를 MEI parser가 읽지 못해 sharp 기본 표기로 돌아감.
  - G♯ 뒤 G에 제자리표가 표시되지 않음.
  - 건반에서 sharp/flat 입력 선호를 선택할 수 없었음.
  - `work-2a0425eab04e0285` 11–13마디 상세 화면이 같은 마디의 동일 pitch 중 잘못된 음을 색칠함.
- 일반화된 수정: spelling과 MIDI identity 분리, accidental state 추적, 입력 기본 spelling 선택, XML note의 measure/pitch뿐 아니라 정확한 beat까지 target 매핑.

### Q-04 — 긴 Query

- 길이: 약 20개 음표
- 용도: Query 재생과 상태 보존 검증
- 당시 지적: 재생은 끝까지 되었지만 재생 후 Query가 기본 Query로 교체됨.
- 기대 동작: 재생 상태와 Query 편집 상태를 분리하고 재생 종료 뒤 입력 event를 변경하지 않는다.

### Q-05 — Contour draw Query

- 기본 토큰: `S`, `U`, `D`; 쉼표는 무시
- 세부 가중치: 명확한 이동 폭일 때 Step/Leap 일치에 추가 가중치
- 당시 지적:
  - 이전 오선 Query가 contour 검색에 남아 있는 듯한 결과가 나타남.
  - 입력 contour와 무관한 후보가 노출됨.
  - 띄엄띄엄 고른 음의 방향만 같아 contour 100이 되는 결과의 의미가 부족함.
- 기대 동작: contour 전용 검색은 오선 pitch/rhythm Query와 완전히 분리하고 U/D/S 전체 방향 일치를 입장 조건으로 사용한다.

### Q-06 — 동일음 두 개의 Query tie 입력

- 입력: 인접한 같은 pitch의 음표 두 개를 오선 또는 음가 패널에서 선택한 뒤 `Tie` 실행
- 당시 지적: 음가 조정 패널에는 `⌒`가 표시되고 Query 데이터에도 `tieGroup`이 생기지만 Verovio 오선에는 타이 곡선이 나타나지 않음.
- 원인: MEI `<tie startid/endId>` control element를 `<section>` 바로 아래에 두어 Verovio가 오선 control event로 해석하지 못함.
- 해결: tie chain의 첫 note에 `tie="i"`, 마지막 note에 `tie="t"`, 중간 note에 `tie="m"` 역할을 직접 기록한다.
- 회귀 조건: 두 음표의 MEI tie 역할, 한 번의 playback attack, 검색 전 Sounding Event 병합을 각각 독립적으로 검증한다.

## 결과·표시 오류 사례 레지스트리

| ID | 작품·구간 | 사용자 지적 | 일반 회귀 조건 | 상태 |
|---|---|---|---|---|
| R-01 | 초기 전체 검색 | 결과가 계속 `Reach for the Stars!, Piano Solo`만 표시 | mock/default 결과가 실제 API 응답을 덮지 않아야 함 | 수정됨 |
| R-02 | `work-798afc456b55aacb`, 63–71 | 일치 구간이 너무 넓고 마디 전체가 칠해짐 | alignment가 선택한 실제 음표만 강조 | 수정 후 반복 확인 대상 |
| R-03 | 같은 구간 | 악보 조각은 63마디, 상세는 62마디; 마디선·번호 없음 | pickup offset을 포함해 XML 표시 번호를 단일 기준으로 사용 | 수정됨 |
| R-04 | 같은 구간 | 원본은 flat인데 조각은 sharp, 낮은음자리표 구간이 높은음자리표로 표시 | 원본 spelling·clef·key signature 보존 | 수정 후 corpus 회귀 필요 |
| R-05 | 같은 상세 화면 | 페이지 아래가 잘리고 음표가 크며 악보가 빡빡함 | Verovio page margin/scale로 모든 system bbox 보존 | 수정 후 시각 회귀 필요 |
| R-06 | `work-7c19379be93970a6`, 161–166 | tie와 쉼표 처리 오류, D5 tie chain 일부만 강조·재생 | tie chain은 한 Sounding Event, 모든 표기 segment를 강조 | 수정됨 |
| R-07 | 같은 구간 | 감지 음표 패널에 피아노 파트가 섞이고 바이올린만 표시되지 않음 | 검색된 part/staff/voice만 excerpt에 유지 | 수정됨 |
| R-08 | `work-01dcd7e4c462fc59`, 29–30 | 조표·파트명 누락, `파레파레` 원본 음표 소실, 조각과 상세 29마디 불일치 | 원본 마디는 삭제하지 않고 match만 색칠; effective attributes 복원 | 수정 후 시각 회귀 필요 |
| R-09 | `work-2f04f3fbe151954c`, 13 | 화음의 네 번째 attack에서 세 음만 색칠 | root와 모든 `<chord/>` sibling을 함께 강조 | 수정됨 |
| R-10 | `work-1e88e39d02541341`, 45–52 | 빨간 음표가 하나도 없어 무엇을 찾았는지 알 수 없음 | 결과 alignment target을 상세 URL과 session에 보존 | 수정됨 |
| R-11 | `work-4229f41fc20f9574`, 26–28 | 프레이즈와 무관한 upbeat 음들이 선택됨 | 중요 박 불일치와 낮은 structural/rhythm 근거를 입장 조건에 반영 | 수정됨 |
| R-12 | `work-f28d9adc7c2a5c75`, 89–90 | 띄엄띄엄 선택한 음 때문에 contour 100 | sparse skip은 명확한 cue/passing/neighbor 증거가 있을 때만 허용 | 수정됨 |
| R-13 | `work-40153ba016a3ef1f`, 20–23 | 앞 프레이즈 마지막 4분음표가 첫 match로 표시 | 타이 종결 sustain은 새 phrase attack이 아님 | 수정됨 |
| R-14 | `work-2ca726d2e2f7b93e`, 3–5 | sharp/flat 때문에 Exact가 아닌 것처럼 보임 | Exact identity는 MIDI interval; rhythm Exact는 실제 IOI·음가까지 동일 | 진단 완료 |
| R-15 | `work-2a0425eab04e0285`, 11–13 | 반복 G 등 빨간 표시 위치가 잘못됨 | XML `divisions/backup/forward/chord`로 계산한 beat까지 target과 일치 | 수정됨 |

## 입력·재생·탐색 UI 오류 사례

- Clear 후 건반과 빈 오선까지 사라짐: Query event만 비우고 입력 UI는 유지해야 한다.
- Delete가 무엇을 지우는지 불명확함: 선택 음표가 있으면 선택 항목, 없으면 마지막 event를 삭제하고 버튼 문구로 대상을 표시한다.
- 건반 수가 적음: C2–E6 범위를 제공하되 최고 E6 텍스트 라벨은 표시하지 않는다.
- ♯/♭ 선택 버튼 추가 뒤 건반 아래쪽이 잘림: 선택 버튼을 keyboard flow 밖의 absolute overlay로 배치하여 150px 건반 영역을 밀어내지 않게 한다.
- ♯/♭ 버튼이 건반 위를 가림: 건반 왼쪽에 전용 여백을 예약하고 버튼을 위아래로 배치하여 어느 key와도 겹치지 않게 한다.
- 0.5·1박 외 길이 변경 반응 부족: 1/64부터 온음표까지 duration과 오선 공간을 함께 갱신한다.
- `+` 음가 순서: 1.5, 2, 3, 4를 사용하고 2.5·3.5는 제거한다.
- tie 재생 시 attack 반복: tie group을 collapse하여 한 번 attack하고 합산 duration만큼 유지한다.
- 오선 음표 선택·drag 수정: 클릭 선택과 수직 drag pitch 변경을 지원한다.
- 악보 조각 재생선이 왼쪽에 고정: 재생 event 위치를 따라가고 가로 스크롤도 동기화한다.
- 상세 페이지에서 돌아올 때 Query 소실: Query·검색 결과·스크롤을 sessionStorage에 보존한다.
- 검색 결과로 돌아가기 버튼이 새 검색 화면으로 이동: browser history를 사용해 기존 결과 상태로 복귀한다.

## 회귀 테스트 운영 원칙

1. 위 work ID는 corpus 통합 진단용 fixture 식별자이며 production 점수 규칙에서 참조하지 않는다.
2. 핵심 규칙은 작품명·마디·pitch를 고정하지 않은 합성 음표열 단위 테스트로 검증한다.
3. corpus 테스트는 “특정 작품이 무조건 1위”보다 target의 part/staff/voice/measure/beat/pitch와 최소 품질 조건을 검증한다.
4. 사용자 Query JSON은 `schema: musicanote-query` 원형을 보존하되, 회귀 fixture에서는 무작위 event ID를 제거하고 의미 있는 고정 ID를 사용한다.
5. 수정 상태가 “시각 회귀 필요”인 항목은 브라우저 screenshot 기준 이미지를 추가한 뒤 완료로 승격한다.

## 2026-08-31 — Query tie 오선 표시와 건반 영역 수정

- 사용자 검증 사례 Q-06을 추가했다.
- Query MEI tie를 note-level `i/m/t` 역할로 출력하여 Verovio가 실제 타이 곡선을 그리도록 수정했다.
- 기존 tie control element 문자열 검사 대신 시작·종료 note의 tie 역할을 검사하는 회귀 테스트로 교체했다.
- ♯/♭ 선택 토글이 keyboard layout 높이에 포함되어 white key 하단을 자르던 문제를 수정했다. 토글을 absolute overlay로 바꿔 건반의 원래 높이를 보존한다.
- 검증: Vitest 65개 통과, TypeScript/Vite production build 통과.

## 2026-08-31 — ♯/♭ 입력 버튼 배치 보정

- 가로 배치된 accidental toggle이 왼쪽 건반을 가리는 사용자 검증 사례를 기록했다.
- keyboard에 데스크톱 76px, 모바일 62px의 왼쪽 전용 여백을 확보했다.
- ♯과 ♭ 버튼을 세로로 배치하고 해당 여백 안에 고정하여 white/black key와 겹치지 않도록 했다.
## 2026-08-31 — 상세 악보의 동음 반복 target 표시 수정

- `work-2a0425eab04e0285` 11–13마디 Exact 결과의 URL target과 서버 alignment를 대조했다. 올바른 target은 11마디 4·4.5박, 12마디 1·2.5·3·3.5·4·4.5박, 13마디 1박이다.
- 상세 화면의 기존 XML 마커는 마디·pitch·staff·voice만 비교하여 같은 마디에 같은 pitch가 반복되면 앞선 다른 음표를 고를 수 있었다.
- MusicXML의 `divisions`, `backup`, `forward`, `chord`, `grace`를 따라 각 XML note의 정확한 beat를 계산하고 target beat까지 일치할 때만 색칠하도록 수정했다.
- 수정된 B♭–A♭–G Query는 interval, rhythm 모두 100점이며 해당 결과가 Exact임을 확인했다.
- 건반의 ♯/♭ 버튼은 기존 Query 전체를 일괄 변환하지 않고 이후 입력의 기본 spelling만 바꾸도록 조정했다. 따라서 한 Query 안에서 필요할 때 버튼을 전환해 sharp과 flat을 함께 입력할 수 있다.
- 기존 음표 하나만 이명동음으로 바꾸는 기능은 선택 음표 대상 `Respell (♯↔♭)` 명령으로 확장하는 방식을 채택한다.
- 검증: Vitest 65개 통과, TypeScript/Vite production build 통과.
## 2026-08-31 — 검색 결과 클릭 기반 YouTube 백필

- 기존 수집 방식: YouTube Data API `search.list`로 `곡명 official music`을 최대 10개 검색하고, `videos.list`로 공개 여부·외부 임베드 가능 여부·한국 지역 차단·조회수를 확인한다.
- 제목 token 일치율, `official/topic/vevo/soundtrack/ost` 표기, 조회수를 결합해 대표 영상을 선택한다.
- `Piano Solo`, `Violin`, `Duet`, `Trio`, `Quartet` 등 편성명을 제거한 정규화 song title을 cache key로 사용한다. 같은 곡의 여러 편성은 하나의 대표 영상을 공유한다.
- 기존 오류: cache 파일은 `works[normalizedTitle]` 구조인데 검색 서버가 최상위 work ID/title만 조회하여 저장된 영상이 검색 결과에 재사용되지 않았다. 서버 lookup을 실제 cache schema에 맞게 수정했다.
- 검색 결과 악보 조각을 클릭하면 `/api/youtube/backfill/start`에 곡 제목을 `keepalive` POST하고 상세 페이지 이동과 동시에 background worker를 시작한다.
- 클릭한 곡을 첫 검색 대상으로 우선 처리한 뒤 corpus cursor를 이어가며 Pacific Time 기준 하루 최대 100회의 `search.list` 한도까지 백필한다.
- 동시에 여러 결과를 눌러도 서버당 worker 하나만 실행한다. 이미 worker가 동작 중이면 새 process를 만들지 않는다.
- 저장 파일 `data/youtube-matches.json`에는 `titleKey`, `normalizedTitle`, video ID/URL/title/channel/viewCount, embeddable, selectedAt, 검색 query와 편성 공유 여부를 보존한다.
- `data/youtube-backfill-state.json`에는 Pacific date, searchCalls, corpus cursor, 마지막 API 오류와 quota 소진 여부를 저장하여 다음 실행에서 이어간다.
- 같은 날 검색 결과가 없었던 제목은 반복 호출하지 않고 다음 Pacific day에 다시 시도한다.
- 현재 로컬 환경에는 `YOUTUBE_API_KEY`가 설정되어 있지 않다. 이 경우 클릭 endpoint는 worker를 시작하지 않고 `configured: false`를 반환한다.
- 공식 문서 기준 `search.list`는 별도 일일 100회 검색 한도를 사용하고 `videos.list`는 호출당 1 unit이다.
- 검증: 정규화 제목의 편성 공유 cache 테스트를 추가하여 Vitest 66개 통과, TypeScript/Vite production build 통과.
## 2026-08-31 — 상단 음악 카탈로그 키워드 검색

- 상단 메뉴 바에 곡명·작곡가·MusicXML 파일명·파트 키워드로 검색하는 카탈로그 검색창을 추가했다.
- 2글자 이상 입력하면 180ms debounce 후 `/api/catalog/search`를 호출하고 최대 12개의 곡을 자동완성 목록으로 표시한다.
- Solo/Duet/Trio/Quartet 등 편성만 다른 동일 곡은 정규화 제목을 기준으로 한 번만 표시한다.
- 항목을 선택하면 similarity target을 임의 생성하지 않고 `browse=1` 전체 악보 탐색 화면으로 이동한다. 이 화면에서는 검색 일치 패널·붉은 강조·감지 음표 재생을 숨긴다.
- 현재 약 8천 작품에는 별도 Elasticsearch 운영이 과도하므로 SQLite를 유지한다.
- 다음 `index:sqlite` 실행부터 `works_fts` FTS5 virtual table을 만들고 Unicode/diacritic-aware 전문 검색을 사용한다.
- 기존 SQLite 파일에는 FTS table이 없으므로 title/normalized title/composer/source의 case-insensitive LIKE 검색으로 자동 폴백한다.
- 데이터가 수십만~수백만 곡으로 증가하고 다중 서버, 형태소 분석, 복합 facet, typo tolerance가 필요해질 때 OpenSearch/Elasticsearch 이전을 재검토한다.
- 모바일에서는 검색 아이콘만 보이다가 focus 시 헤더 폭으로 확장한다.
- 검증: 카탈로그 검색·편성 중복 제거 테스트를 추가하여 Vitest 67개 통과, TypeScript/Vite production build 통과.
## 2026-08-31 — Tuplet 구현 상태 점검과 결과 악보 playhead 정렬

- Tuplet은 앞서 `N notes in the time of M`, QueryEvent 필드, effective duration 계산 원칙까지만 설계했으며 실제 입력 버튼·MEI 표기·검색 처리는 아직 구현되지 않았음을 확인했다.
- 구현 순서는 (1) 3:2/2:3/5:4/6:4/7:4 preset과 다중 음표 선택, (2) written/effective duration 분리, (3) MEI tuplet bracket/number, (4) 재생·Exact rhythm·복사 JSON 회귀 검증으로 유지한다.
- 검색 결과 playhead는 존재했지만 SVG 전체 음표 개수와 재생 event ordinal의 비율로 위치를 추정했다. 화음·쉼표·tie·반복음이 있으면 실제 음표와 대응하지 않는 것이 원인이었다.
- 원본 XML의 part/staff/voice/measure/beat/pitch로 각 재생 event에 `data-playback-index`를 부여하고, 재생기는 이 ID 순서의 정확한 SVG 음표로 이동하도록 수정했다.
- playhead를 3px로 굵게 하고 상단에 붉은 삼각형 포인터를 추가해 밝은 악보에서도 위치를 식별할 수 있게 했다.
- 가로 overflow가 있는 악보 조각은 현재 음표가 viewport 중앙에 오도록 기존 자동 스크롤을 유지한다.

### 구현 완료 및 재검증

- 문제 재현: playhead가 재생 시작 시의 SVG node 목록을 보관했기 때문에 Verovio/React 재렌더 뒤에는 제거된 node를 추적했다. `playbackNotes` 배열도 매 render마다 새로 생성되어 악보 재렌더를 반복시켰다.
- 해결: 재생 event 목록을 `useMemo`로 고정하고, 각 attack 시점마다 현재 DOM에서 정확한 `data-playback-index`를 다시 조회한다.
- 브라우저 검증: 첫 검색 결과에 playback marker 6개가 연결되었고, 재생 0.3초 후 playhead `left=373.545px`, 1.2초 후 `left=482.104px`로 실제 이동함을 확인했다.
- Tuplet 입력은 오선/음가 패널에서 연속 event를 2개 이상 선택하는 방식으로 구현했다. 같은 음가일 때는 선택 개수가 N이 되고, 혼합 음가일 때는 `표기 음가 합 ÷ 선택 구간의 최소 표기 음가`로 실제 subdivision 수 N을 계산한다. 기본 normal notes는 2개→3, 3개→2, 5개 이상→4이며 `in 2 / in 3 / in 4`에서 사용자가 합계를 바꿀 수 있다.
- QueryEvent에 `tupletGroup`, `actualNotes`, `normalNotes`, `writtenDuration`을 추가했다. `writtenDuration`은 악보에 보이는 음가, `durationRatio = writtenDuration × M/N`은 재생·검색에 쓰는 실제 시간이다.
- Verovio용 MEI에는 `<tuplet num="N" numbase="M">`를 생성하여 bracket/number를 표시하고, 내부 음표에는 effective duration이 아닌 written duration을 기록한다.
- 이미 묶인 Tuplet 전체를 다시 선택하면 `Remove tuplet`으로 해제할 수 있다. Tuplet 내부 음가 slider를 바꿀 때에도 N:M 비율을 보존한다.
- Query 사례 Q-07: 동일 음가 3개를 선택해 3:2 적용. 각 음표가 8분음표라면 JSON에는 `writtenDuration: 0.5`, `durationRatio: 0.333…`, `actualNotes: 3`, `normalNotes: 2`가 저장되어야 한다. 기존 문제는 Tuplet 버튼과 표기/재생 경로가 전혀 없었던 것이며, 위의 written/effective duration 분리로 해결했다.
- 검증: Vitest 68개 통과, TypeScript/Vite production build 통과. 실제 브라우저에서 3개 선택 시 `Tuplet 3:2` 활성화와 적용 후 각 음가 패널의 `· 3:2` 표시를 확인했다.

### Query 사례 Q-08 — 쉼표 및 혼합 음가 Tuplet

- 문제: 최초 구현의 활성화 조건이 `음표만`, `모두 같은 writtenDuration`으로 제한되어 있어 쉼표가 포함된 튜플릿과 `4분음표 + 8분음표` 같은 혼합 음가 튜플릿을 만들 수 없었다.
- 판단: Tuplet의 time modification은 그룹 안의 각 event에 동일한 `M/N` 비율을 적용하며, event가 음표인지 쉼표인지 또는 written duration이 서로 같은지는 성립 조건이 아니다.
- 해결: 연속된 event 2개 이상이라는 조건만 유지했다. 음표와 쉼표를 함께 선택할 수 있고 서로 다른 written duration도 허용한다.
- 예: 4분음표 + 8분음표를 선택하면 event는 2개지만 최소 단위인 8분음표 세 칸이므로 N을 3으로 추론해 `Tuplet 3:2`를 제안한다. 4분음표는 `1 × 2/3 = 0.666… beat`, 8분음표는 `0.5 × 2/3 = 0.333… beat`로 재생·검색된다. 합은 1 beat이며 악보에는 각각 4분음표와 8분음표로 유지된다.
- 회귀 테스트에 4분음표 + 8분음표 + 8분쉼표 혼합 그룹을 추가해 MEI 안에서 각각 `dur="4"`, `dur="8"`, `<rest dur="8">`로 보존되는지 확인했다. Vitest 69개와 production build가 통과했다.

## 2026-08-31 — 검색 결과 점수 축 재구성 및 모티프 중요도

- 사용자 의견: Pitch와 Interval은 조옮김 허용 검색에서 같은 선율 관계를 중복 설명하는 느낌이 강하다. Downbeat, Schenker 분석, 해당 음악에서의 반복·비중을 결과 근거로 표시하는 편이 낫다.
- UI 점수 축을 `Melody Interval`, `Rhythm`, `Downbeat Weight`, `Schenker-Informed`로 재구성했다. Pitch 점수는 회귀 분석과 내부 진단을 위해 응답에 보존하지만 일반 결과 카드에서는 숨긴다. 점수 항목은 Title Case를 적용한다. 일반 문장에서는 `Schenker-informed`가 자연스럽지만 UI 항목명에서는 `Schenker-Informed`로 표기한다.
- `Downbeat weight`는 Query의 meter와 후보 MusicXML의 실제 meter를 각각 사용해 중요 박 대응과 충돌을 계산한 `scores.meter`이다. 따라서 4/4의 1·3박 규칙을 다른 박자에 그대로 적용하지 않는다.
- `Schenker-informed`는 완전한 Schenker 분석을 주장하지 않는다. 강박, 지속음, tie, 프레이즈 경계, 음역상 돌출을 기둥음 근거로 사용하고 짧은 경과음·보조음은 낮춘 structural reduction 유사도다.
- 기존 `Occurrence importance`는 사실상 stream melody-role 값에 가까워 반복성을 충분히 설명하지 못했다. 새 `Motif importance`는 (1) 해당 파트의 melody-role 50%, (2) 같은 interval motif의 반복 횟수 35%, (3) 반복 구간이 전체 파트에서 차지하는 비중 15%를 결합한다.
- 완전 interval 일치는 전 구간 occurrence를 세고, 유사 결과는 n-gram retrieval에서 독립적으로 검출된 후보 시작점 수를 근사 반복 횟수로 사용한다. 결과의 Why 항목에는 추정 반복 횟수와 중요도 점수를 함께 표시한다.
- 이 중요도는 현재 설명용 보조 점수이며 local melodic similarity를 덮어쓰지 않는다. 반복이 많다는 이유만으로 덜 닮은 결과가 상위에 오는 것을 방지하기 위한 결정이다.

## 2026-09-01 — 카탈로그 다중 단어 AND 검색

- 문제 사례: `I christmas`처럼 서로 떨어진 두 단어를 입력하면 FTS가 없는 기존 SQLite fallback에서 전체 문자열을 연속 구문으로 검색하여 결과가 0개였다.
- 검색어를 Unicode 단어 token으로 분리하고 모든 token을 포함해야 하는 AND 검색으로 변경했다. 단어 순서와 두 단어 사이의 거리는 제한하지 않는다.
- 한 글자 `I`를 단순 `%i%` 또는 prefix로 처리하면 `White Christmas`, `Christmas In Our Hearts`도 잘못 통과하므로, SQL 후보를 가져온 뒤 제목을 Unicode 단어 단위로 다시 나눈다. 한 글자 검색어는 완전한 단어 일치, 두 글자 이상은 단어 prefix 일치로 검증한다.
- 따라서 `ALL I WANT FOR CHRISTMAS IS YOU`, `I'LL BE HOME FOR CHRISTMAS`는 검색되지만 `White Christmas`는 `I christmas` 결과에서 제외된다.
- 제목에서 결과가 없을 때만 작곡가·원본 파일명 등 metadata 전체의 token AND 검색으로 fallback한다.

## 2026-09-01 — 악보 상세 화면 제목·스크롤·분석 명칭

- 상세 화면 sticky toolbar에 `TITLE` eyebrow와 실제 작품 제목을 추가했다. MusicXML 내부 credit/title은 계속 제거하므로 악보 본문과 중복되지 않는다.
- `Melody analysis`는 선율 이외의 리듬·모티프·밀도 통계도 포함하므로 `Analysis and Statistics`로 변경했다.
- 기존 자동 스크롤은 `scrollIntoView(start)` 후 고정값 115px을 다시 빼는 두 단계 동작이라 화면이 튀었고, sticky 검색 악보 조각이 본문을 가리는 문제가 있었다.
- 검색 악보 조각의 sticky를 해제하고 문서 흐름에 두었다. 자동 이동은 목표 음표의 현재 좌표에서 viewport 높이의 20%(최소 110px)를 한 번에 계산해 즉시 배치한다.
- 검색 악보 조각을 클릭한 수동 이동은 같은 위치 계산을 사용하되 smooth behavior를 적용한다. 초기 로드 애니메이션과 사용자의 이후 스크롤을 방해하는 반복 보정은 사용하지 않는다.

## 2026-09-01 — 상세 악보 최초 1회 스크롤과 Trepak/내성부 검색

- Query 사례 Q-09: `G4 G4 F#4 G4 G4 E4 D4 C4 E4 D4 D4 C#4`, 음가 `.5 .25 .25 .5 .5 .5 .5 .5 .5 .5 1 1`, Melody + Rhythm, 4/4.
- 원본 인덱스에서 Trepak은 이 11개 interval을 피아노판 6회, 바이올린판 6회 등 여러 위치에 정확히 포함한다. 원 악보의 마지막 두 D–C# 음가는 각각 .25지만 Query는 1이므로 Rhythm은 약 83점이며 완전 rhythm match는 아니다.
- 누락 원인은 결과 threshold가 아니라 refinement 전 후보 절단이었다. 기존에는 동일 작품의 반복 위치도 각각 상위 350개 슬롯을 사용해 다른 작품을 밀어냈다.
- 후보를 work/stream별 최대 3곳으로 제한하고 첫 번째 후보를 모든 stream에 우선 배분한 뒤 두 번째·세 번째 후보를 추가하는 다양화 방식을 적용했다.
- 다중 stream 인덱스 확장 뒤에는 후보가 26,000개 stream으로 늘어났다. 긴 정확 interval 근거가 단순 contour/rhythm 반복보다 먼저 refinement되도록 interval n-gram retrieval evidence에 3배 가중치를 적용하고, 같은 시작점에서 Query의 모든 interval 3-gram이 확인된 후보는 refinement 우선 큐에 넣는다. 특정 제목이나 Query를 고정하지 않는다.
- 흔한 3-interval gram은 token당 3,000행 조회 제한을 넘겨 뒤쪽 stream을 누락할 수 있다. 제한을 크게 늘려 검색 시간을 악화시키는 대신 5-interval gram(`i5`)을 인덱스에 추가하고 긴 Query 후보 생성에서 6배 retrieval evidence로 사용한다.
- 후보 refinement 상한은 8음 이상 Query 900개, 짧은 Query 350개로 구분한다. 긴 동기의 recall을 보존하면서 4음 Query가 다중 stream 26,000개 환경에서 과도하게 느려지는 것을 막는다.
- MusicXML 파서는 원래 `(part, staff, voice)`별 stream을 만들었지만 JSON에서는 역할 상위 4개만 보존하고 SQLite builder는 첫 stream만 색인했다. 파서의 4개 제한을 제거하고 SQLite가 보존된 모든 stream을 고유 ID로 색인하도록 수정했다.
- 기존 v2 JSON에서 보존된 stream들을 즉시 재색인해 SQLite가 약 8천 대표 stream에서 26,000 melody stream으로 확장됐다. 기존 `search.sqlite`는 `search.sqlite.pre-multistream`으로 보존했다. 아직 JSON에서 잘렸던 5번째 이하 stream은 다음 전체 MusicXML 재파싱 때 추가된다.
- 상세 악보의 자동 위치 이동은 `streamId:start:end` key별 최초 한 번만 허용한다. Verovio pages가 다시 생성되거나 parent가 재렌더되어도 같은 상세 페이지에서는 사용자의 수동 스크롤을 되돌리지 않는다.
- 같은 작품/stream에서 실제 검출된 surface 선율과 리듬이 완전히 같은 반복은 카드 여러 장으로 만들지 않고 최고 위치 카드 하나에 `동일 선율·리듬 N회 · 마디 …`로 표시한다. Query와 rhythm이 일부 달라도 후보 악보 안에서 서로 같은 반복은 세며, 변형 반복은 이 목록에 섞지 않는다.
- 각 part/staff/voice의 melody-role을 최종 ranking에 최대 12점 범위의 감점으로 반영한다. 내성부·반주 voice는 검색 대상에서 제거하지 않되 대표 선율보다 아래에 정렬한다.
- 같은 MusicXML source의 여러 파트에서 검출 구간의 실제 interval+normalized rhythm signature가 같으면 가장 melody-role이 높은 파트 한 장을 대표 카드로 사용한다. 카드 안에 파트별 순번, 파트 이름, 동일 등장 횟수, 마디 목록을 표시한다.
- Query에 대한 유사도만 같고 실제 검출 surface melody/rhythm이 다른 variation은 같은 파트 목록으로 합치지 않는다.
## 2026-09-01 한국어 MusicXML 제목 인코딩 복구

- 사례: `work-446c05b114906da2`의 상세 화면 제목이 `³» ÁÖ¸¦ °¡±îÀÌ ÇÏ°Ô ÇÔÀº`로 표시되었다.
- 원인: 실제 CP949/EUC-KR 한국어 바이트가 원본 XML의 문자 인코딩 처리 과정에서 Latin-1 문자로 해석된 뒤 검색 인덱스에 저장되었다. 폰트나 React 렌더링 문제는 아니다.
- 확인: 해당 문자열을 CP949로 복구하면 `내 주를 가까이 하게 함은`이다.
- 해결: 인덱서가 제목, movement title, 작곡가, 파트 이름을 읽을 때 Latin-1→CP949 변환 결과에서 한글 문자가 실제로 증가하는 경우에만 복구한다. 프랑스어·독일어 등 정상적인 Latin 문자는 변환하지 않는다.
- 기존 인덱스를 전부 다시 만들기 전에도 상세 화면, 검색 결과, 텍스트 검색 결과, YouTube 제목 정규화에서 같은 안전 검사를 수행해 올바른 제목을 즉시 표시한다. 다음 전체 재인덱싱부터는 저장 데이터 자체도 올바르게 생성된다.
- 후속 보완: 향후 일본어와 중국어 간체·번체 자료를 위해 복구 후보를 UTF-8, CP949/EUC-KR, Shift_JIS, GB18030, Big5로 확대했다. 이미 올바른 Unicode 문자열은 바이트 재해석 대상에서 제외하고, 복구 결과에 실제 한글·가나·한자가 증가할 때만 채택한다.
- 회귀 사례로 한국어 `내 주를 가까이 하게 함은`, 일본어 `日本語タイトル`, 중국어 간체 `简体中文标题`, 중국어 번체 `繁體中文標題`, 정상 유럽어 `Prélude in C♯ minor`를 검증한다.

## 2026-09-01 Trepak 긴 Query의 한 음 변화와 후보 recall

- Query 사례 Q-10: `G4 G4 F#4 G4 G4 E4 D4 C4 E4 D4 D4 C#4 D4 A3`, 음가 `.5 .25 .25 .5 .5 .5 .5 .5 .5 .25 .5 1 1 1`, Melody + Rhythm, 4/4.
- 문제: Trepak 원본과 직접 local alignment하면 전조된 선율의 앞부분이 연속 일치하고 전체 유사도가 약 90점인데도 검색 결과에서 완전히 사라졌다.
- 진단: Trepak은 retrieval 후보에는 포함되어 있었다. Melody Interval 94.6, contour 92.3, rhythm DTW 47.2, 리듬까지 반영한 local score 78.6이었지만, 기존 admission의 rhythm 최소 55 조건 때문에 refinement 뒤에서 제거되었다. Query 뒤쪽 음가가 원본과 여러 곳 달라 “음 하나의 pitch 차이”보다 rhythm 차이가 크게 계산된 사례다.
- 해결: interval gram 완전 일치 보너스가 한 음 변화로 갑자기 사라지지 않도록 높은 gram coverage에 연속적인 후보 보너스를 주었다. 또한 8음 이상이며 interval 90 이상·contour 85 이상인 강한 긴 선율은 rhythm factor의 하한을 0.78로 둔다. rhythm 차이는 약 90점의 melodic local alignment를 약 71점까지 낮추지만 기존처럼 약 45점으로 반감해 탈락시키지는 않는다. 최종 admission은 local 68 이상, rhythm 40 이상을 요구하므로 exact match로 취급하지 않는다.

### Query 사례 Q-11: Rhythm이 약한 강한 Trepak 선율

- Query: Q-10 뒤에 `B3` 온음표를 추가하고 앞부분의 두 `D4`를 각각 8분음표로 입력한 15음 Query.
- 비교 결과 `She's Always a Woman` 52–53마디는 Melody Interval 85.0, contour 78.6, rhythm 66.1이었고, Trepak은 Melody Interval 96.8, contour 92.3, rhythm 41.8이었다.
- 기존 곱셈식에서는 rhythm 66.1이 전자의 낮은 멜로디 점수를 유지시키고 rhythm 41.8이 Trepak의 강한 멜로디를 과도하게 압축해 순서가 뒤집혔다.
- Melody + Rhythm 정렬 비용을 선율 92%(interval 48%, direction 30%, step/leap 14%)와 rhythm 8%로 변경했다. 정렬 후에는 local melodic alignment 88%와 Rhythm DTW 12%를 가산 결합한다. 리듬 완전 일치는 이점을 주지만 중간 수준의 리듬 점수가 약한 멜로디를 과도하게 구제하지 못한다.
- 8음 이상 강한 선율 예외의 rhythm 하한은 35로 조정하되 interval 90, contour 85, local 68 조건을 유지한다.

### Query 사례 Q-12: 가운데 한 음의 반음 변경

- 원본 Query: `F4 A4 C5 E5 G5`, 8분쉼표, `G5 C5 A4 A4 C5`; 변경 Query는 두 번째 G5만 G#5로 올렸다.
- 원본 결과의 가장 강한 melodic evidence는 `I Loves You, Porgy`로 Pitch 93.0, Melody Interval 87.6, Contour 88.9였다. 기존 1위 `Blue Christmas`는 Pitch 74.0, Melody Interval 79.8이지만 Rhythm 91점 때문에 위에 올라 멜로디 우선 정책과 맞지 않았다.
- 한 음의 pitch substitution은 앞뒤 interval 두 개를 바꾸며, 겹치는 interval 3-gram과 5-gram 여러 개를 동시에 파괴한다. 변경 전후 한쪽에 남은 5-interval 연속 일치는 6개 음의 전조 동형을 뜻하므로 강한 retrieval 근거다.
- interval 5-gram retrieval 가중치를 6에서 50으로 높여 가운데 한 음이 달라도 양쪽의 긴 정확 조각으로 원곡 후보가 refinement에 진입하도록 했다. 최종 local alignment에서는 바뀐 음과 두 interval의 불일치가 정상적으로 감점된다.
- 추가 진단: `I Loves You, Porgy` 전체 stream에 직접 정렬하면 원본은 Pitch 98, Interval 93.8, Rhythm 100이고 변경 Query도 Pitch 97, Interval 90.7, Rhythm 100이었다. 그런데 정확한 구간은 stream 뒤쪽에 있으며, 작품별 시작점 상위 3개 제한 때문에 앞쪽의 반복 n-gram 시작점만 refinement되고 진짜 구간은 평가되지 않았다.
- 8음 이상 Query는 작품별 시작점 후보를 3개에서 8개로, 전체 refinement 후보를 900개에서 1,400개로 확대했다. 작품을 결과에 여러 번 표시하려는 변경이 아니라, 내부적으로 여러 시작점을 비교한 뒤 가장 좋은 구간 하나를 선택하기 위한 recall 보완이다.
- 작품별 30개·전체 3,000개 시작점 확장도 실험했으나 정확 구간은 복구하지 못하고 약 24초가 걸려 폐기했다. 문제 구간을 구성하는 정확 n-gram 자체가 SQL 조회 제한에서 seed가 되지 않으면 시작점 개수만 늘려도 해결되지 않는다.
- 최종 방식은 n-gram evidence를 작품별로 합산해 상위 160개 melody stream을 고른 뒤, 각 stream 전체에 semi-global local alignment를 한 번 수행하는 2단계 refinement다. 나머지 작품에는 기존의 제한된 시작점 정렬을 유지한다. 이 방식은 한 음 변화로 정확 seed가 사라져도 작품 수준 근거와 전체 정렬을 결합해 실제 구간을 복구한다.
## 2026-09-01 Query 선택 음표 반음 이동 버튼

- 음가 조정 카드 왼쪽의 빈 공간에 위·아래 화살표를 세로로 배치했다. 오선이나 음가 카드에서 음표를 선택한 뒤 위 화살표는 +1 semitone, 아래 화살표는 -1 semitone을 적용한다.
- 여러 음표를 선택하면 모두 같은 간격으로 이동하며 쉼표는 바뀌지 않는다. tie 음표 중 하나를 선택하면 tie의 음정 동일성을 보존하기 위해 같은 tie group 전체를 함께 이동한다.
- 기존 flat 표기 음표는 이동 후에도 flat 선호를 보존하며, natural 음에서 검은 건반으로 이동할 때는 Query 건반의 현재 sharp/flat 설정을 따른다. 변경은 Undo/Redo history와 오선, 재생, 검색 Query에 즉시 반영된다.
## 2026-09-01 Search Evaluation Harness 진행 원칙

- 앞으로 개발의 중심을 제안된 검색 개선 과제와 사용자가 실행하는 실제 Query 사례로 전환한다.
- 특정 사례에 결과를 하드코딩하지 않고 Query, 기대 작품·구간, 문제 유형, 수정 전후 순위와 점수, 해결 방법을 구조화된 evaluation case로 누적한다.
- 구현 계획은 `docs/search-evaluation-harness-plan.md`에 정리했다. Phase 1은 JSONL case schema, 실제 production 검색 CLI, Recall@K·MRR·latency report, 기존 Query 사례 이관으로 구성한다.
- 정답을 사용자가 나중에 알려 주려는 사례는 먼저 `draft`로 저장하고 검색기의 독립적인 추론을 기록한 뒤, 정답 확인 후 `verified`로 승격한다.
- 이후 검색 가중치·threshold·retrieval 변경은 단일 Query 성공만으로 채택하지 않고 전체 verified suite의 정확도와 latency 회귀를 함께 확인한다.
## 2026-09-02 Harness 1단계 사용자 Query 검증 라운드

- 지금부터 사용자가 수행하는 여러 검색 테스트를 Phase 1 Harness의 평가 사례로 수집한다.
- 저장 위치는 `evaluation/cases/user-queries-phase1.jsonl`이며 기록 규칙은 같은 폴더의 `README.md`에 명시했다.
- 각 사례에는 Query 원문, 문제 설명, 정답 공개 전 시스템 예측, 확인된 정답 작품·파트·구간, 수정 전후 순위·세부 점수·latency, 원인, 일반화된 해결 방법, 전체 suite 회귀 결과를 보존한다.
- 정답 미확인 사례는 `draft`, 사용자 확인이 끝난 사례는 `verified`, 전체 평가 회귀까지 통과한 사례만 `resolved`로 구분한다.
- 동일 Query를 수정해 다시 실행하는 경우 기존 사례를 덮어쓰지 않고 variant 또는 후속 run으로 연결해 변화 과정을 남긴다.
## 2026-09-02 Phase 1 사례 Q-P1-001 — 내부 음 변경과 interval 이중 영향

- Query 원문과 baseline을 `evaluation/cases/user-queries-phase1.jsonl`에 `Q-P1-001`로 기록했다.
- 기대 결과는 사용자가 명시한 `I Loves You, Porgy`다. 현재 검색은 71개 결과, 약 20.5초, 목표 결과 없음, 1위 `Wet Hands`였다.
- 목표 stream 직접 정렬은 melodic alignment 92, Pitch 98, Melody Interval 93.8로 강하므로 최종 유사도보다 candidate/full-stream refinement 선택 실패가 직접 원인이다.
- 작품별 full-scan 우선순위를 모든 시작점 evidence 합계로 계산하면 반복 패턴이 많은 긴 stream이 과도하게 유리하다. 작품별 최강 시작점 evidence의 최댓값으로 변경해 실제 motif 근거를 우선한다.
- 후속 검증에서 여전히 recall이 부족하면 interval 4-gram 색인을 추가한다. 최종 Melody Interval은 인접 edge 오차와 중앙값 전조 제거 후 note-wise pitch residual을 결합해 한 음 변화가 두 edge에서 중복 벌점되는 문제를 줄일 예정이다.
- 작품 evidence 합계를 최강 시작점의 최댓값으로 바꾸자 Q-P1-001 latency는 약 20.5초에서 4.3초로 감소했지만 목표 recall은 아직 실패했다.
- 종합 evidence 상위 100개뿐 아니라 interval evidence 상위 80개와 rhythm evidence 상위 60개 stream의 합집합을 full-stream refinement 대상으로 사용한다. Rhythm은 이 단계에서 최종 점수 보너스가 아니라 후보 recall 채널로만 사용된다.
- Feature별 후보 분리만으로도 Q-P1-001은 복구되지 않았다. 목표 작품에 query prefix의 interval 3-gram `[4,3,4]`와 `[3,4,3]`이 각각 12회 있지만 corpus 전체 빈도는 1,864회와 2,795회여서 개별 seed의 식별력이 낮았다.
- 인접한 interval 3-gram 두 개가 동일한 `(workId,start)`에서 만나는 교집합에 20점 evidence를 주는 interval 4-gram equivalent seed를 추가했다. SQLite 재색인 없이 기존 index로 5개 연속 음의 전조 동형을 식별하며, 한두 개의 내부 pitch 변경으로 모든 5-gram이 파괴되는 경우를 보완한다.
- 4-interval seed를 일반 interval evidence에만 합치면 흔한 3-gram 후보에 다시 묻혔다. 별도의 작품 evidence 채널을 만들고 동일 작품 내 4-interval seed occurrence를 누적해 상위 60개 stream을 full scan 합집합에 추가한다.
- 목표 작품은 full scan 대상이며 시작점 0·102·200이 모두 evidence 172였지만, breadth-first 다양화가 1,400개 작품의 첫 후보만 채우면서 작품별 두 번째 이후 시작점이 실제 refinement에 들어가지 않는 결함이 있었다.
- Full-scan 합집합에 든 작품은 evidence 상위 시작점 4개를 `deepSeedCandidates`로 별도 보존한다. 전체 stream alignment가 선택한 melodic 반복과 각 seed의 rhythm·metric 문맥을 함께 비교해 같은 작품에서 더 적합한 occurrence를 선택한다.
### Q-P1-001 후속 — interval 중복 벌점과 보조 점수 상한

- Deep seed 적용 후 `I Loves You, Porgy` 22–24마디가 2위로 복구됐다. Pitch 98, Interval 93.8, Rhythm 100, latency 약 5.2초였다.
- 당시 1위 `Misty`는 Pitch 65, Rhythm 49인데 Downbeat 79와 structural 92가 과도하게 보상했다. 목표 곡은 metric score 15에서 -14를 받아 멜로디 우선 원칙과 맞지 않았다.
- Melody Interval을 adjacent edge interval 60%와 median-transposition 제거 후 note-wise residual 40%로 결합한다. 한 pitch 오차가 두 interval edge에 영향을 주더라도 note residual에서는 한 번만 벌점된다.
- Local melodic alignment도 기존 DP similarity 70%와 robust Melody Interval 30%로 결합한다. Downbeat adjustment는 -5~+4, structural bonus는 최대 10으로 제한해 보조 분석이 강한 멜로디·리듬 증거를 뒤집지 못하게 했다.
- 최종 Q-P1-001 결과는 `I Loves You, Porgy` 22–24마디 1위, Pitch 97.2, robust Interval 95.1, Rhythm 100, local 88.5, ranking 92.2다. 동일 프로세스 내 측정 latency는 5.3초와 2.8초로 변동했다.
- Smoke regression에서 Trepak 15음 Query와 이전 Porgy G# Query도 각각 1위를 유지했다. 다만 latency는 Trepak 22.2초, G# 사례 8.3초로 편차가 커 Phase 1 성능 계측의 우선 과제로 남긴다.
- Vitest 8개 파일, 76개 테스트가 통과했다.

## 2026-09-02 Q-P1-001-V2 — 두 개의 큰 음높이 변경에 대한 견고성 확인

- 직전 검증 변형을 기준으로 내부 두 음을 크게 바꿨다: A4→E4(-5반음), G4→D♭4(-6반음).
- `I LOVES YOU, PORGY`는 22–24마디 결과로 4위에 남았다. 1–3위가 같은 제목의 판본 중복이므로 고유 제목 기준으로는 사실상 2위다.
- 벌점은 분명하게 적용되었다. Pitch는 97.2→82.7, Melody Interval은 95.1→73.9, local similarity는 88.5→66.4, ranking은 92.2→70.0으로 내려갔다. Rhythm은 94.2로 비교적 높게 유지되었다.
- 따라서 두 개의 큰 오음 때문에 목표가 완전히 소실되지는 않으면서도 순위와 멜로디 점수가 충분히 내려가는 방향은 긍정적이다. 다만 한 사례만으로 일반 성능을 입증할 수 없으므로 무관한 음형의 negative control과 1·2·3·4음 변경 sweep을 추가해야 한다.
- 검색 latency는 8.7초로 여전히 Phase 1 성능 개선 대상이다.

## 2026-09-03 PDMX classical 검색 코퍼스 통합

- `K:\PDMX.csv`와 `K:\mxl`을 대조해 `classical`, `subset:all_valid=True`, `subset:deduplicated=True`인 49,625작품을 선택했다. 누락 MXL은 0건이다.
- K 드라이브 여유 공간은 62.18GB, U 드라이브는 184.65GB였다. 빌드 중간 산출물과 XML 캐시는 `U:\MusicSearch-PDMX`에 만들고 최종 SQLite만 K에 배치했다.
- `scripts/build-pdmx-inventory.py`를 추가해 해시형 MXL 경로와 song name, title, composer, genre, license 및 PDMX metadata를 연결했다.
- MusicXML 인덱서가 PDMX 메타데이터를 보존하고 화면 제목은 `song_name → title → XML title`, 작곡가는 `composer_name → artist_name → XML composer` 순서로 선택하게 했다.
- 500작품 pilot은 실패 0건, 2,135 melody stream, 269,600음, SQLite 89.64MB였다.
- 단일 프로세스 파싱은 약 16 files/s까지 내려갔으나 8-worker ProcessPool을 추가해 평균 82.9 files/s로 개선했다. 전체 49,625작품 파싱은 실패 0건으로 완료되었다.
- 전체 PDMX v2는 198,137 melody stream, 26,588,886음, 2.061GB JSONL이다. 기존 8,111작품과 병합한 결과는 57,736작품이며 work hash 중복은 0건이다.
- SQLite builder는 입력·출력 CLI 경로를 받고, gram index를 모든 행 입력 뒤 일괄 생성하도록 변경했다. 통합 DB는 224,353 melody stream, 11.391GB다.
- 같은 Q-P1-001 Query A/B에서 기존 DB는 cold 11.40초/warm 1.93초, 통합 DB는 cold 4.52초/warm 2.10초였다. 데이터가 약 7.1배 늘었지만 warm latency 증가는 약 9%였다.
- MXL 상세 악보를 위해 `scripts/extract-pdmx-musicxml.py`로 49,625개 XML 캐시(14.889GB)를 U에 생성했다. 실패는 0건이며 서버는 `.mxl` source를 자동으로 XML 캐시에 연결한다.
- Unicode line separator가 JSONL reader에서 행 경계로 오인되는 문제를 수정해 ASCII LF만 레코드 경계로 처리한다. 한국어·일본어·중국어 간체·번체 metadata 복구 테스트를 포함해 Vitest 76개와 production build가 통과했다.
- 기존 DB는 `data/search-index-v2/search.sqlite.pre-pdmx`로 보존하고 통합 DB를 기본 `search.sqlite`로 전환했다. PDMX 제목 검색, 작곡가 표시, 전체 XML 상세 로딩을 검증했다.

## 2026-09-03 PDMX 통합 후 결과 수와 cold latency 개선

- 검색 API와 화면 요청의 결과 상한을 20개에서 100개로 늘렸다. admission 기준을 통과한 결과가 적으면 일정 수를 억지로 채우지 않고 실제 통과 결과만 반환한다.
- 100개 결과 자체의 추가 비용은 작았지만 첫 검색이 약 21초까지 늘어나는 현상을 확인했다. 주원인은 초기 후보 약 1,400개에서 local alignment 전에 원본 XML을 반복해서 열어 박자를 읽는 순서였다.
- 1차 정렬은 Query 박자로 수행하고 local alignment의 coverage·sparse 조건을 통과한 후보에만 원본 박자를 읽도록 순서를 변경했다. 최종 metrical score와 결과 표시는 여전히 원본 박자를 사용한다.
- 원본 XML에는 64개 LRU cache를 추가하고 SQLite에는 256MB page cache와 4GB memory map을 설정했다.
- Q-P1-001, 100개 결과 기준 cold latency는 21.06초에서 5.36초로 약 74.5% 감소했고 warm latency는 2.64초에서 2.30초로 줄었다. `I LOVES YOU, PORGY` 1위는 유지됐다.
- 대규모 stream 중복 때문에 `I christmas` 텍스트 검색 후보가 한 작품의 여러 파트로 채워지는 문제를 발견해 FTS pre-dedup 후보 폭을 확대했다.
- Vitest 76개와 production build가 통과했으며 localhost:5173 서버를 재시작했다.

## 2026-09-03 반복 마디 번호가 있는 PDMX 악보 조각 축소 오류

- 사례: `work-bd980e8b68c3e32f`, Etude op.849, 검색 표시 마디 13–15.
- 이 MXL은 여러 연습곡이 한 part에 연속 수록되어 총 1,253마디이며, 각 곡에서 마디 번호가 다시 1부터 시작한다.
- 기존 excerpt 추출은 XML의 인쇄 마디 번호가 13–15인 마디를 전부 선택해 75마디·1,642음표를 한 조각에 넣었다. 그 결과 전체 악보처럼 극단적으로 축소되었다.
- 검색 인덱스의 절대 XML 마디 순번을 `measureOrdinal`로 표시 번호와 별도 보존했다. excerpt 추출과 음표 강조·재생 위치 매칭은 ordinal을 우선하고, 일반 악보에서는 기존 표시 마디 번호를 fallback으로 사용한다.
- 수정 후 해당 조각은 실제 검색된 절대 13–15번째 마디 3개·60음표만 포함한다. 반복 마디 번호 배열에서 ordinal 13–15만 선택하는 회귀 테스트를 추가했다.
- Vitest 9개 파일·77개 테스트와 production build가 통과했다.

## 2026-09-03 KYSing 매칭 코퍼스와 특정 파트 제한 미리보기

- API 메타데이터와 직접 연결된 KYSing XML 37,826개를 `research-preview` 인벤토리로 만들었다. 원본 XML은 `U:\KYSing_MusicXML`에 변경 없이 유지한다.
- 인덱스 source ID에는 `kysing/` 접두사를 붙여 기존 Music Analysis 및 PDMX 파일명과 충돌하지 않게 했다. 제목·가수·작곡가·작사가·금영 번호·등록일과 메타데이터 출처를 별도 보존한다.
- 검색 결과와 상세 화면은 검색된 `part + staff + voice`가 속한 part 하나만 사용한다. 다른 악기 part는 CSS로 가리지 않고 서버가 만드는 MusicXML 응답에서 제거한다.
- 제한 상세 화면은 일치 구간 전후 2마디만 포함한다. 첫 마디에 필요한 divisions·조표·박자·음자리표 attributes는 앞선 마디에서 복원한다. 검색 구간이 없는 카탈로그 직접 접근에는 XML을 제공하지 않는다.
- `restrictedPreviewXml` 회귀 테스트는 다중 파트 원본에서 목표 part만 남고 다른 score-part/part가 제거되며 제한된 6마디와 유효 attributes만 반환되는지 검사한다.
- 공식 금영 미매칭 백필 도구는 기본 하루 100건, 1.5초 간격으로 동작하고 매 10건마다 결과와 cursor를 저장한다. 5곡 pilot에서 5곡 모두 복구했으며 중단 후 재개 상태를 확인했다.

## 2026-09-03 금영 곡목 메타데이터 스냅샷

- Manana 기본 금영 endpoint는 전체 목록이 아니라 최신 20곡만 반환하며 `page` 인자를 처리하지 않았다.
- 곡번호 endpoint가 부분 일치 결과를 반환하는 성질을 이용해 숫자 1–9를 각각 한 번 조회하고 곡번호로 중복 제거했다. 총 45,758개의 금영 곡목을 확보했다.
- 원본 스냅샷은 `data/kysing-metadata/kumyoung-2026-09-03-all.json`, 검증 결과는 `data/kysing-metadata/kumyoung-2026-09-03-report.json`에 저장했다. 재현용 스크립트는 `scripts/download-kysing-metadata.mjs`이다.
- KYSing XML 50,874개 중 37,826개(74.35%)가 파일명의 선행 0을 제거한 금영 곡번호와 직접 일치했다. 13,048개는 Manana 목록에 없었다.
- 누락 표본 114, 120, 121, 122번은 금영 공식 검색에서는 각각 정상적으로 제목과 가수가 확인되었다. 따라서 번호 체계 불일치가 아니라 비공식 목록의 과거곡 누락으로 판단한다.
- 공식 사이트 누락 보완은 13,048건을 한꺼번에 요청하지 않는다. 공식 데이터 제공 가능 여부를 우선 확인하고, 필요할 경우 요청 간격·재시작 가능한 캐시·일일 상한을 둔 별도 백필 작업으로 수행한다.

## 2026-09-03 악보 조각 재생 지연과 KYSing 제한 공개 준비

- 악보 조각 재생이 잠시 밀린 뒤 빠르게 몰려 나오는 현상은 각 음의 `setTimeout` 콜백 안에서 `AudioContext`를 새로 만들던 구조와 대형 Verovio 렌더링의 메인 스레드 점유가 결합한 문제였다.
- 한 번의 사용자 재생 동작에서 AudioContext 하나를 만들고 모든 attack/release를 Web Audio 자체 시계에 미리 예약하도록 변경했다. 재생 위치 표시는 DOM 타이머를 계속 사용하지만, 화면 렌더링 지연이 소리의 박자까지 밀어내지는 않는다.
- `U:\KYSing_MusicXML`에는 XML 50,874개, 약 42.35GB가 있다. K 드라이브 여유 공간은 약 60.5GB, U 드라이브는 약 96.9GB이다.
- KYSing 원본은 `research-preview`로 분류한다. 검색 인덱스에는 특징량과 검색용 단선율을 넣되, 상세 API가 전체 XML을 브라우저로 보내서는 안 된다.
- 공개 조각은 검색된 part/staff/voice와 일치 구간 주변의 제한된 마디만 서버에서 새 MusicXML로 구성한다. 다른 파트와 범위 밖 마디는 CSS 마스킹이 아니라 응답 데이터에서 제거하여 개발자 도구로 복구할 수 없게 한다.
- 상세 화면도 전체 악보 대신 동일한 제한 조각과 분석 통계만 제공하며, 임의 마디 탐색·원본 다운로드·연속 구간 조합은 허용하지 않는다. 구체적인 공개 마디 수와 재생 길이는 권리 검토 후 설정한다.
- 표본 XML에는 작품 제목·작곡가가 없고 숫자 파일명과 파트 정보만 있어, 유용한 검색 결과 표시를 위해 별도의 노래 번호–제목–작곡가 메타데이터 매핑이 필요하다.
- Vitest 9개 파일·77개 테스트와 production build가 통과했다.

## 2026-09-03 악보 조각 템포 중복 및 대용량 전체 악보 빈 화면

- 사례: PDMX 검색 결과의 악보 조각에 같은 템포 표시가 반복되고, 상세 화면의 전체 악보는 그려지지 않았다.
- 원인: 조각 생성 시 MusicXML의 중복 metronome/sound tempo 지시를 모두 유지했고, 전체 악보는 Verovio의 모든 페이지 SVG를 동기적으로 만든 뒤에야 React 화면에 한꺼번에 반영했다.
- 일반화 수정: 악보 조각에서 연속된 동일 템포 지시만 제거한다. 실제 템포 변화와 템포 이외의 direction은 그대로 유지한다.
- 대용량 전체 악보는 두 페이지 단위로 화면에 점진적으로 반영하고 페이지 사이에 브라우저 렌더링 시간을 양보한다. 수백 페이지짜리 합본 XML도 전부 끝날 때까지 빈 화면으로 남지 않는다.
- 점진 렌더링 중 목표 페이지가 아직 없을 때 자동 스크롤 완료로 잘못 기록하지 않도록 수정했다. 목표 음표가 실제 DOM에 나타난 뒤 최초 한 번만 이동한다.
- Vitest 9개 파일·77개 테스트와 production build가 통과했다.
## 2026-09-03 — 금영(KYSing) 매칭 데이터 반영과 제한 악보 공개

- 원본 보존 위치: `U:\KYSing_MusicXML` (50,874 XML, 약 42.35GB). 원본 파일은 수정·이동·삭제하지 않는다.
- 확보한 금영 메타데이터 45,758곡과 파일명을 대조해 37,826개 파일(74.35%)을 1차 매칭했다. 파싱 실패는 0건이었다.
- 기존 데이터와 합칠 때 중복 레코드 3,623개를 제거했다. 최종 통합 JSONL은 45,914개 고유 작품이며, 검색 DB는 약 18.9GB다.
- 금영 데이터는 `metadata.accessPolicy = "research-preview"`로 저장한다. 서버는 `kysing/` 소스를 `U:\KYSing_MusicXML`에서만 읽는다.
- 검색 결과/상세 화면의 악보는 매치된 `streamId`의 part 하나만 남기고, 일치 구간 앞뒤 2개 ordinal measure만 포함한다. 필요한 이전 `attributes`(조표·박자·음자리표 등)는 첫 표시 마디에 이식한다.
- 검색 구간이 없는 금영 상세 요청에는 XML을 반환하지 않는다. 결과 응답에는 `accessPolicy: "research-preview"`, `fullScoreAvailable: false`를 표시한다.
- 빈 `targets` 문자열이 `Number('') === 0` 때문에 유효 onset처럼 해석되던 오류를 수정했다.
- 실제 샘플 검증: 무구간 XML 길이 0, 제한 미리보기 part 1개, score-part 1개, 주변 measure 4개.
- 새 DB 기준 단순 4음 melody 검색(20개 제한): cold 약 2.1초, warm 약 0.43초/0.34초. 후보 생성은 n-gram 인덱스를 사용하지만 대규모 데이터에서 cold latency 추가 개선이 필요하다.
- 기존 DB는 `data/search-index-v2/search.sqlite.pre-kysing`으로 보존했다.
- 검증: Vitest 9 files / 78 tests 통과, TypeScript 및 Vite production build 통과.

## 2026-09-03 통합 DB 복구 및 KYSing 미리보기 범위 수정

- KYSing 병합 때 기준으로 사용한 중간 JSONL에는 8,111개 작품만 남아 있어, 전체 PDMX DB에 있던 `Invention in C major BWV 772`를 포함한 다수 작품이 검색 대상에서 누락된 것을 확인했다.
- 전체 PDMX DB와 KYSing DB를 stable stream ID로 합친 28.44GB 통합 DB를 생성해 `data/search-index-v2/search.sqlite`로 활성화했다. 직전의 불완전 DB는 `search.sqlite.kysing-incomplete`, 전체 PDMX 원본은 `search.sqlite.pre-kysing`으로 보존했다.
- Q-P1-002 동일 쿼리에서 BWV 772는 2위(91.2345점, Pitch/Interval/Contour 100, Rhythm 82.75)로 복구되었고, 기존 1위였던 KYSing `기억 속의 멜로디`는 상위 20개에서 제외됐다. Monteverdi 작품이 근소하게 1위인 것은 사용자가 허용한 유사 클래식 결과 범위에 해당한다.
- 제한 미리보기 API에서 생략된 `ordinalStart`를 `Number(null) === 0`으로 해석해 실제 `start` 마디를 무시하던 오류를 수정했다. 이제 `start=79`는 ordinal 77–81의 5마디 미리보기를 반환한다.
- 잘라낸 첫 마디 중간에 clef-only `<attributes>`가 있으면 이전 divisions/time/key를 상속하지 못하던 오류를 수정했다. 각 속성을 이전 마디들에서 독립적으로 찾아 첫 음표 앞에 합성하며, 빠른 16분음표들의 beat와 강조 위치가 정확히 계산된다.
- 서버에서 이미 잘라낸 제한 XML을 클라이언트가 원래 ordinal로 다시 자르던 이중 trim을 제거하고, `previewOrdinalStart` offset으로 마디와 강조 음표를 연결했다.
- MusicXML에 검색 음표 색상을 직접 기록해 Verovio가 beam 내부 개별 note ID를 보존하지 않는 경우에도 모든 감지 음표가 붉게 표시되게 했다.
- `MusicXML 쨌 Soprano Guitar`의 `쨌`은 UTF-8 가운데점 `·`이 잘못 해석된 mojibake였다. 화면용 구분자를 정상 `·`로 교체했다.
- `사랑,두려움` 사례의 검색 stream은 `Carillon, S3`이며 79마디는 16분음표 16개의 빠른 반주형이다. 기존의 비정상적인 오선은 잘못 자른 마디와 divisions 누락 때문이었고 이는 수정됐다. 다만 이 stream이 선율 결과로 채택되는 현상은 현재 melody-role 공식이 높은 음역·단선율·긴 stream을 선율로 과대평가하고, 동일 비율 리듬 정규화가 4분음표 query와 16분음표 반주를 동일 리듬으로 볼 수 있는 별도의 검색 품질 문제다. 특정 곡 예외가 아니라 반주 texture 판별을 Phase 1 harness에 추가한다.
- 검증: 통합 DB schema, BWV/KYSing 동시 title 조회, Q-P1-002 재검색, 브라우저에서 KYSing 79마디의 5마디 제한 미리보기와 16개 음표 강조(조각·상세 합계 32개)를 확인했다.

## 2026-09-03 검색 중 코퍼스 규모 동적 표시

- 검색 버튼의 `Searching 8,111 works…`는 초기 코퍼스 규모를 `App.tsx`에 직접 적어 둔 상수였으며, 현재 DB를 조회하지 않았다.
- 검색 DB 통계 API `/api/search/v2/stats`를 추가해 고유 source 작품 수와 실제 검색 stream 수를 반환하도록 했다.
- 현재 활성 통합 DB의 실제 규모는 95,520 works / 384,006 melody streams다. 작품 하나의 part·staff·voice가 여러 melody stream이 될 수 있으므로 두 수치를 구분해서 표시한다.
- 통계를 불러온 뒤 검색 중에는 `Searching 95,520 works · 384,006 melody streams…`를 표시한다. API 응답 전에는 부정확한 숫자 대신 `Searching indexed corpus…`를 표시한다.
- 검증: 통계 API 응답, Vitest 9 files / 80 tests, TypeScript 및 Vite production build 통과.

## 2026-09-03 PDMX 악보 조각 강조 및 대용량 전체 악보 우선 렌더링

- 회귀 사례: `Domine salvam fac` 25–28마디, `Brandenburg Concerto No.2 BWV 1047` 7–8마디, `Invention in C major BWV 772` 7마디 상세 화면을 점검했다. 세 XML 모두 API에서 정상 반환됐지만 Verovio 렌더링이 느렸고, public-domain 조각의 붉은 강조가 누락됐다.
- public-domain excerpt를 ordinal 범위로 자른 뒤 내부 마디 index가 다시 1부터 시작했지만 target은 원래 ordinal을 유지해 매칭되지 않았다. 잘라낸 첫 ordinal만큼 position offset을 적용해 조각과 전체 악보가 동일한 음표를 강조하도록 수정했다. 못갖춘마디가 있어 표시 7마디가 XML ordinal 8인 경우도 처리한다.
- 전체 악보가 큰 경우 과거에는 1페이지부터 순서대로 Verovio SVG를 만든 뒤 목표 페이지에 도달했다. 이제 전체 페이지 자리를 먼저 예약하고 `getPageWithElement()`로 검색 음표가 있는 모든 페이지를 우선 렌더링한다. 나머지 페이지는 악보 순서를 유지한 채 점진적으로 채운다.
- 아직 생성되지 않은 페이지에는 `전체 악보 렌더링 중 · page n/N` placeholder를 표시한다. 전체 악보는 고정 page height로 렌더링해 앞 페이지가 추가될 때 목표 위치가 밀리거나 페이지 아래가 잘리는 현상을 줄였다.
- 브라우저 검증: Brandenburg는 조각 9개와 전체 악보 9개, BWV 772와 Domine salvam fac는 각각 조각 10개와 전체 악보 10개의 붉은 target을 확인했다. 대용량 Brandenburg는 101페이지 중 목표가 걸친 두 페이지를 먼저 렌더링했다.

## 2026-09-03 대용량 전체 악보 페이지별 진행 상태

- Brandenburg처럼 101쪽인 악보에서 목표 페이지를 먼저 표시한 뒤 나머지 페이지가 오랫동안 같은 `렌더링 중` 문구로 남아, 작업이 멈춘 것처럼 보이는 문제를 개선했다.
- 검색 일치 페이지 다음에는 1쪽으로 되돌아가지 않고 목표 쪽과 거리가 가까운 앞뒤 페이지부터 채운다. 사용자가 보고 있는 구간의 연속된 주변 페이지가 먼저 나타난다.
- 전체 악보 조판을 시작하기 전부터 `전체 악보 구조를 분석하는 중 · Verovio 조판 준비` 상태를 표시하고 pulse animation을 적용했다.
- 페이지 수가 결정되면 sticky 진행 패널에 `rendered / total pages`와 progress bar를 표시한다. 빈 페이지에도 해당 page 번호와 대기 상태를 표시한다.
- 각 SVG 페이지를 만든 뒤 `requestIdleCallback`으로 브라우저에 렌더링·스크롤·입력 처리 시간을 양보한다. 이를 통해 긴 동기 조판 루프가 여러 페이지에 걸쳐 화면 갱신을 굶기지 않게 했다.

## 2026-09-06 Motif 기반 변형 Query 100개 실제 검색 평가

- 실제 28.66GB 검색 DB에서 KYSing 6곡, MusicXML 7곡, PDMX 7곡의 모티프 후보 20개를 선별했다. 박자는 4/4 15곡, 3/4 2곡, 6/8 2곡, 3/2 1곡이다.
- 각 원형에 중간 음높이 ±1, 내부 한 음 옥타브 이동, 국소 리듬 재분배, 특징적 도약 축소, 쉼표 삽입/길이 변화의 다섯 변형을 적용해 총 100개 Query를 만들었다.
- 생산 `searchDatabase`를 Top100으로 실제 실행했다. 결과는 Top1 78, Top5/Top100 86, 미회수 14였으며 실행 오류는 없었다. 회수된 사례의 중앙 및 p90 순위는 모두 1이었다.
- 원곡 직접 local alignment 진단을 추가한 결과 미회수 14개가 모두 입장 기준을 통과했다. 순위 감점 문제가 아니라 한 음 변경으로 인접 interval seed가 함께 깨지거나 흔한 gram의 후보 제한에서 사라지는 전단 recall 문제로 분류했다.
- 변형별 Top100은 pitch 12/20, octave 15/20, rhythm 20/20, leap 19/20, rest 20/20이다. 다음 개선은 희귀 gram 우선, 좌우 분할 seed, bounded fallback 순으로 A/B 평가한다.
- 결과가 존재한 99개 모두 검색 alignment 좌표가 excerpt XML에 해석됐고 Verovio SVG에 붉은 target이 보존됐다. 결과 0개인 Q-M100-097만 강조 대상이 없었다.
- 검색 latency는 평균 15.67초, 중앙 9.93초, p90 32.68초, 최장 63.75초였다.
- 원자료는 `evaluation/motif-100/cases.jsonl`, 실행 snapshot은 `evaluation/runs/motif-100-latest.json`, 사람이 읽는 전체 보고서는 `docs/motif-100-search-evaluation.md`에 저장했다. 실행기는 사례별 원자 저장과 동일 DB·코드·Query hash 기반 재개를 지원한다.

## 2026-09-06 KY 공식 메타데이터 자동 수집

- 예약 시간을 놓친 뒤 같은 날짜에 수동 재개했다. 공식 조회 100개가 모두 번호 정확 일치와 비어 있지 않은 제목 조건을 통과했다.
- 누적 205개, cursor 205, 미처리 12,843개이며 429·차단·실행 오류는 없었다.
- 원본 XML은 변경하지 않았고, 검색 DB 반영은 수집과 분리해 아직 수행하지 않았다.
- 날짜별 목록은 docs/ky-collection/2026-09-06.md에 저장했다.

## 2026-09-06 YouTube 대표 영상 일일 수집 예약

- 한 작업에는 heartbeat 자동화 하나만 연결할 수 있어 별도 오전 10시 예약 대신 기존 `ky` 자동화에 YouTube 수집을 통합했다. 매일 한국시간 오전 9시에 KY 수집 후 순서대로 실행한다.
- `scripts/youtube-backfill.mjs`와 기존 title-key cache/state를 사용하며, 하루 최대 search call은 기본 quota 여유를 위해 95회로 설정했다.
- 공개·외부 재생 가능·syndicated 가능·한국 비차단 영상만 저장하고, 편성이 다른 같은 곡은 정규화 제목으로 대표 영상을 공유한다. quota 오류는 우회하지 않는다.
- 현재 `YOUTUBE_API_KEY`가 설정되어 있지 않아 실제 API 호출은 하지 않는다. 예약은 활성 상태이며 키가 예약 실행 환경에 제공된 뒤부터 수집된다.
- 운영 규칙과 실행 기록 위치는 docs/youtube-collection-log.md이다.

## 2026-09-06 Motif 100 후보 회수 보완 및 독립 Motif 200 실행

- 첫 100개에서 확인한 candidate retrieval 누락을 보완했다. 긴·정보량 높은 Query는 interval posting을 확대하고, Query의 서로 떨어진 위치에서 같은 후보 시작점을 지지하는 seed에 가산점을 준다. 반복음 위주의 낮은 정보량 Query는 후보 폭발 방지를 위해 제외한다.
- 동일 100개 A/B는 Top1 78→88, Top5/Top100 86→98, 누락 14→2였다. 회수 12개, 신규 누락 0개, 1위→2위 이동 1개다.
- 정확도 대가로 p50 9.93→22.79초, p90 32.68→46.16초가 되어 posting 회수의 성능 재설계가 다음 우선순위다.
- Harness에 `--suite motif-100|motif-200`을 추가했다. motif-200 생성 시 motif-100의 sourceId를 제외해 다른 작품 20개를 선택한다.
- 독립 Motif 200을 100/100 실행했다. Top1 64, Top5 97, Top10/Top100 98, 누락 2이며 강조 XML/SVG 실패는 0이다. 평균 30.36초, p50 23.68초, p90 55.32초, 최대 110.62초다.
- 실행 중 일부 원본 MusicXML의 열린 slur/tie Verovio 경고를 확인했다. 후속 Harness에는 검색 실패와 분리된 source-notation-integrity 기록을 추가한다.
- 동시에 발생한 브라우저 `Failed to fetch`는 검색 부하가 아니라 5173 Vite 서버가 꺼져 있던 것이 원인이었다. 개발 서버를 PID 23524로 다시 시작하고 `http://127.0.0.1:5173/` 응답을 확인했다.

## 2026-09-06 상세 검색·리듬 Query·전체 악보 재생

- 과거 상세 검색 후보를 다시 확인했다. 사용자가 기억하지 못한 항목은 `쉼표 포함 여부`였고, 기존 문서에는 Exact interval, 쉼표 처리, 리듬 허용 범위, Downbeat 기준, 구조 가중치, 결과 내 재검색을 한 접이식 패널로 모으는 방향이 기록돼 있었다.
- `상세 검색` 버튼을 누르면 checkbox 패널이 아래로 펼쳐진다. Exact Interval, Exact Pitch, Exact Rhythm, Include Rests, Strengthen Downbeat Weight, Search within results를 배치했다.
- Exact Interval은 조옮김을 허용한 음정열 완전 일치, Exact Pitch는 옥타브를 포함한 MIDI 음높이 완전 일치, Exact Rhythm은 전체 tempo/음가 배율을 정규화한 상대 IOI·음가 완전 일치다. 복수 체크는 AND 조건이다. 기존 `absoluteExactOnly` Query는 호환용으로 계속 읽는다.
- Include Rests를 끄면 Query의 rest event를 제거한 뒤 onset을 다시 계산한다. 원곡 음표를 임의 삭제하는 옵션은 아니다.
- Strengthen Downbeat Weight는 우선 기존 metric adjustment의 양·음 방향을 2배로 적용한다. UI에 실험값임을 표시했고, 확정 배율은 Harness A/B로 정한다.
- `Rhythm only` 모드를 추가했다. Query 음표와 쉼표를 오선 대신 한 직선 위의 note head/rest glyph와 길이 비례 폭으로 표시하고 rhythm n-gram 및 제한형 rhythm DTW만으로 검색한다. 실제 5173 API에서 0.5:0.5:1:2 Query가 656ms에 Exact 결과 3개를 반환했다.
- 선택된 event 뒤에 C4 또는 rest를 삽입하는 Insert Note/Insert Rest를 추가했다. 선택이 없으면 끝에 넣는다. 한 번의 `commit`으로 처리되어 Undo/Redo 한 단계에 보존된다.
- 여러 event가 선택된 상태에서 각 음가 카드의 +/−를 누르면 선택된 모든 음표·쉼표의 written duration을 각자 한 단계씩 함께 변경한다. tuplet은 written/effective 비율을 유지한다.
- 악보 상세/카탈로그 전체 화면에 `화면 악보 전체 재생`을 추가했다. public-domain은 표시된 전체 stream, research-preview는 실제 제한 XML에 포함된 마디만 재생한다. tie는 한 attack으로 합치며 현재 음표에 붉은 세로 playhead를 표시한다.
- 검증: Query 편집·검색 관련 Vitest 63개 통과, TypeScript 및 Vite production build 통과, 실제 Rhythm-only API smoke test 통과.
- Windows 브라우저 자동화 helper가 sandbox 초기화 오류로 두 번 종료되어 최종 육안 클릭 검증은 남아 있다. 사용자의 브라우저 수동 확인 또는 helper 복구 후 panel layout, 삽입 위치, 다중 +/−, 긴 전곡 재생을 추가 확인한다.

### 리듬 경계와 악보 재생 탐색 보완

- Rhythm only 직선에서 이벤트마다 오른쪽 세로 경계선을 그리고 첫 이벤트에는 왼쪽 경계도 표시했다. 각 칸의 가로 폭은 음가 비율, 경계는 음표·쉼표가 끝나는 지점을 나타낸다.
- Insert Rest의 일반 추가 아이콘을 제거하고 실제 4분쉼표 glyph `𝄽`로 교체했다.
- 전체 악보 상단에 음표 단위 재생 위치 range를 추가했다. 정지 중 이동하면 다음 재생 시작점과 붉은 막대가 바뀌고, 재생 중 이동하면 기존 Web Audio 예약을 중단한 뒤 선택 위치부터 다시 예약한다.
- 붉은 막대가 화면 밖으로 이동하면 해당 음표를 화면 중앙으로 부드럽게 스크롤한다.
- 관련 Vitest 25개와 production build가 통과했다.
- 기존 Vite PID 23524는 정적 페이지도 23.6초 걸리는 비정상 상태여서 해당 프로세스만 교체했다. 새 PID 35288에서 첫 응답 702ms와 5173 포트 정상 상태를 확인했다.

## 2026-09-06 검색 속도 4단계: 적응형 interval posting

- 모든 interval 3-gram을 최대 250,000행 읽던 고회수율 경로를 적응형으로 교체했다. 일반 gram은 16,000행, 좌우 절반의 희귀 gram은 50,000행, Query 첫·마지막 gram은 100,000행까지만 읽는다.
- 단순 16,000행 제한에서 빠진 `Q-M100-081`을 분석했다. 내부 한 음 변형 때문에 희귀 중간 gram은 원곡과 달라졌고, 실제 surviving seed는 Query 양 끝의 흔한 gram이었다. 따라서 희귀도만이 아니라 변형 후에도 보존될 가능성이 큰 edge evidence를 확장한다.
- 16개 회귀 묶음은 전면 확장과 같은 found 12/16, Top5 12/16을 유지했다. 최종 경계 검증에서 `Q-M100-004`는 1위/9.19초, `Q-M100-081`은 1위/12.73초였다.
- 최종 전체 100개 재실행 중 일부 사례가 1–2분의 긴 꼬리 지연을 보여 중단했다. 실행 결과는 원자 저장되어 있으며, 다음 candidate evaluation 최적화 뒤 전체 Motif 100/200을 다시 실행한다.
- 진단 및 회귀 도구로 `scripts/diagnose-adaptive-postings.mjs`, `scripts/benchmark-adaptive-postings.mjs`를 추가했다. 상세 설계와 측정은 `docs/performance-stage-4.md`에 기록했다.
- 검색 API Vitest 57개와 TypeScript/Vite production build가 통과했다.

## 2026-09-06 Q-P1-007 희소 downbeat 과대평가와 표시 순위

- Query와 문제 제보를 `evaluation/cases/q-p1-007-sparse-downbeat-ranking.json`에 원문 음높이·음가·쉼표, 대상 work/range, 수정 전후 실측치와 함께 보존했다.
- `우리 함께라면` P3:1:1의 4–15마디는 한 마디에 한 음꼴의 희소한 선율인데 기존 Downbeat Weight가 100이었다. 기존 산식이 Query의 중요 박만 검사하고 Query 약박이 후보 강박으로 과도하게 대응하는 경우를 검사하지 않은 것이 원인이었다.
- 모든 alignment pair에서 `Query metric weight < .5`이고 `candidate metric weight >= .65`인 over-accent를 계산해 Downbeat 점수와 보정을 감점한다. 특정 작품·파트 예외는 넣지 않았다.
- 실제 재검색에서 해당 결과는 Downbeat 100→63, 순위 9→14, 최종 ranking 94.01→89.34로 조정됐다. Melody Interval 90.92와 Rhythm 44.01은 그대로여서 변경 범위가 박절 과대평가에 한정됨을 확인했다.
- 카드의 큰 숫자는 과거 `localSimilarity`였지만 목록은 retrieval·phrase·melody-role을 포함한 `ranking`으로 정렬해 숫자와 순서가 달라 보였다. 이제 Similar 카드의 큰 숫자를 실제 `ranking`인 Match score로 표시한다. Exact 결과를 Similar보다 먼저 두는 기존 정책은 유지한다.

## 2026-09-07 점진적 악보 렌더링과 재생 위치 동기화 · Rhythm glyph

- 전체 악보는 검색 일치 페이지를 먼저 렌더링한 뒤 가까운 페이지와 앞쪽 페이지를 점진적으로 채우지만, 재생 컨트롤은 실제 SVG에 어느 playback index가 나타났는지 전달받지 못했다.
- 각 페이지 SVG에서 렌더된 playback index의 최소·최대값과 전체 렌더 완료 여부를 `FullXmlNotation`에서 `FullScorePage`로 전달한다. 사용자가 slider를 직접 조작하지 않은 동안에는 재생 시작 위치가 현재 렌더된 가장 앞 음표로 계속 이동하며, 첫 페이지까지 렌더되면 전체 악보 첫 음표로 갱신된다.
- 사용자가 재생 위치 slider를 직접 옮긴 뒤에는 자동 동기화가 그 선택을 덮어쓰지 않는다. callback은 stable ref를 사용해 재생 상태 변화가 Verovio 전체 재조판을 다시 시작하지 않게 했다.
- Rhythm only 직선의 단순 검은 note head를 written duration에 따른 온·2분·4분·8분·16분·32분·64분 음표 glyph로 교체했다. 쉼표도 같은 음가별 glyph를 사용하며 점음표와 tuplet 비율을 표시한다. 칸 경계와 음가 비례 폭은 유지한다.
- 검증: rhythm glyph 및 FullXmlNotation 관련 Vitest 9개, TypeScript 검증, production build 통과.

## 2026-09-07 Q-P1-008 Similar 점수 보정 · Downbeat 4배 옵션

- 제공 Query를 `evaluation/cases/q-p1-008-similar-score-calibration.json`에 보존하고 실제 생산 검색으로 재현했다. 수정 전에는 Melody Interval 92.92, Rhythm 81.17인 Similar 결과도 retrieval·구조 가산점 뒤 100으로 clamp되어 Exact와 구별되지 않았다.
- Exact 결과의 최종 Match score는 100으로 고정한다. Similar는 `55% local similarity + 45% surface score`로 다시 보정하고, retrieval·phrase·part-role 보정 합계는 -3~+1 범위로 제한하며 최종 상한을 97로 둔다. melody+rhythm surface score는 Melody Interval 75%와 Rhythm 25%다.
- 실제 재검색에서 Exact TOP GUN ANTHEM은 100을 유지했고 상위 Similar는 97, 97, 97, 95.22, 94.91로 분리됐다. `À Dieu dame`은 100에서 94점대로 내려갔다.
- 1위 Exact의 Rhythm은 100이지만 Downbeat Weight 58, Schenker-Informed 79다. 시작은 3마디 1박이나 중요 박 유효 일치는 2곳뿐이며, 구조 축약은 Query 기둥음 3개와 후보 문맥 기둥음 7개를 비교한다. 음가 완전 일치와 다른 평가축이므로 임의로 100으로 올리지 않았다.
- 상세 검색의 `Search Within Results` 표기를 통일했다. `Strengthen Downbeat Weight` 설명은 `Downbeat 가중치 4배 적용`으로 바꾸고 실제 metric adjustment multiplier도 2배에서 4배로 변경했다.
- 검색 API Vitest 60개와 TypeScript 검증 통과.

## 2026-09-07 세 번째 독립 변형 Query 100개 평가

- scripts/motif-100-benchmark.mjs가 motif-300을 지원하고 이전 suite의 source를 누적 제외하도록 확장했다. 새 세트 100개/원곡 20개가 motif-100·200과 source 중복 0임을 확인했다.
- 실제 검색 100건을 끝까지 실행했다. Top1 70, Top5 96, Top10 98, Top100 99, 미회수 1이며 중앙 순위 1, p90 순위 3이다.
- 변형별 Top5는 pitch 20/20, octave 18/20, rhythm 20/20, leap 20/20, rest 18/20이다. Q-M300-067 'Amarillis'의 내부 한 음 옥타브 이동만 admission에서 미회수됐다.
- Q-M300-090 'THAXTED (Holst)'의 15위는 같은 Holst 선율의 'I Vow to Thee, My Country'·'Jupiter' 판본들이 상위를 차지한 결과다. 알고리즘 오답으로 단정하지 않고 canonical tune/edition family 기반 다중 정답 Harness 과제로 기록했다.
- 강조 XML 및 Verovio 렌더는 100건 모두 성공했다. latency는 평균 21.36초, p50 20.04초, p90 34.85초, 최대 55.61초로 정확도에 비해 여전히 느리다.
- 전체 Query와 결과는 docs/motif-300-search-evaluation.md, evaluation/motif-300/cases.jsonl, evaluation/runs/motif-300-latest.json에 보존했다. 실행기 Vitest 2개도 통과했다.

## 2026-09-07 KY 공식 메타데이터 자동 수집

- 예약 시간을 놓친 뒤 같은 날짜에 수동 재개했다. 공식 조회 100개가 모두 번호 정확 일치와 비어 있지 않은 제목 조건을 통과했다.
- 누적 305개, cursor 305, 미처리 12,743개이며 429·차단·실행 오류는 없었다.
- 원본 XML은 변경하지 않았고, 검색 DB 반영은 수집과 분리해 아직 수행하지 않았다.
- 날짜별 목록은 docs/ky-collection/2026-09-07.md에 저장했다.

## 2026-09-07 YouTube 대표 영상 자동 수집

- YOUTUBE_DAILY_SEARCH_LIMIT=95로 실행했으나 YOUTUBE_API_KEY가 설정되지 않아 API 호출을 보내지 않았다.
- search call 0, 신규 매칭 0, no-match 0이며 quota 및 기존 영상 자료는 변경되지 않았다.
- 영상 DB 및 검색 DB 동기화는 수행하지 않았다. 수집을 시작하려면 실행 환경에 YouTube Data API 키 설정이 필요하다.

## 2026-09-07 상세 악보 주요 Motif 오선·유사 음악 탐색

- 상세 악보 오른쪽의 '주요 interval motif' 숫자 막대를 실제 4–8음 대표 음표열과 음가를 보여주는 Verovio 오선 카드로 교체했다.
- 서버 motif 분석 결과에 대표 음표·spelling·음가, 시작/종료 마디, 반복 occurrence 위치를 포함한다. 렌더링은 기존 MEI/Verovio 런타임을 재사용하므로 별도 SVG·PNG 파일이나 전체 motif 쌍 유사도 저장소를 만들지 않는다.
- 각 카드의 '비슷한 Motif' 버튼은 선택 motif를 melody+rhythm Query로 기존 검색 API에 요청하고 현재 작품을 제외한 상위 6개 작품·파트·마디·Match 점수를 표시한다. 결과를 누르면 해당 검색 구간의 상세 악보로 이동한다.
- 임의 motif가 반드시 강박에서 시작한다고 가정하지 않도록 startsOnDownbeat은 false로 요청한다.
- 오른쪽 aside를 viewport 안의 독립 스크롤 영역으로 만들고 overscroll 격리, 안정적인 scrollbar gutter, 모바일 단일열 해제를 적용했다.
- 실제 THAXTED 8음 motif 검색에서 I Vow to Thee, My Country 및 Jupiter의 여러 파트가 100–94.59점으로 반환되는 것을 확인했다. 작품 API는 motif 8개와 첫 motif의 8음·14회 occurrence·3/4·조표 -2를 반환했다.
- motif payload 및 MEI 관련 Vitest 76개, TypeScript 검증, production build가 통과했다. 실행 사이트 HTTP 200도 확인했다.
- Windows 브라우저 자동화 helper가 sandbox 초기화 오류로 재시도 후에도 종료되어 최종 육안 클릭 검증은 남아 있다.

### 반복음 지배 Motif 억제

- 단순 반복음이 occurrence 수만으로 주요 motif 상위에 오르지 않도록 음고 정보량 하한을 추가했다.
- 길이의 60%에 해당하는 서로 다른 음고를 요구하되 최대 4개까지만 요구한다. 한 음이 전체의 절반 이상을 차지하거나, 연속 동일음 진행이 interval의 34%를 넘는 후보는 제외한다.
- 조건을 통과한 후보도 고유 음고 비율과 비반복 진행 비율이 낮으면 motif score를 감점한다.
- 실제 THAXTED 응답에서 연속 동일음 지배 패턴은 제거됐고, 추가 확인에서 발견한 2음 교대 4음 패턴도 새 기준으로 제외했다.

### 주요 Motif 6–12음과 검색 예상시간

- 주요 motif 분석 범위를 4–8음에서 6–12음으로 변경했다. 8–10음은 길이 가중치 1.25, 11–12음은 1.08, 6–7음은 0.88을 적용해 중간 길이를 우대한다.
- 작품 내부 후보 선별은 반복·길이·음가·음고 정보량을 사용하는 경량 분석으로 유지한다. 각 motif의 '비슷한 Motif'는 별도 단순 비교가 아니라 일반 Melody+Rhythm 메인 검색 API의 후보 검색, local alignment, rhythm, downbeat, structural/admission 논리를 그대로 사용한다.
- 모든 6–12음 window를 전체 corpus 메인 검색으로 미리 실행하는 방식은 작품 하나당 수백~수천 번의 전체 검색을 발생시키므로 적용하지 않았다. 사용자가 선택한 상위 motif만 요청 시 메인 검색한다.
- Query 검색 버튼에 초 단위 예상 잔여 시간을 표시한다. mode, 음표 길이 구간(short/medium/long), 전체 corpus/결과 내 검색별로 실제 완료 시간의 지수 이동 평균을 localStorage에 학습한다.
- 예상 시간이 남아 있는 동안 N초 남음으로 감소하고, 예측 시간을 넘으면 잘못 0초 완료로 보이지 않게 '마무리 중…'으로 전환한다. 검색 성공·실패 모두 실제 경과 시간으로 다음 예측을 갱신한다.
- 실제 THAXTED 응답에서 주요 motif가 8음 1개와 12음 후보들로 반환되고 모든 후보가 6–12음 범위임을 확인했다. 관련 Vitest 78개, TypeScript 검증, production build 및 실행 사이트 HTTP 200이 통과했다.

# 2026-09-15 — Motif 다중 증거 유사도 v0.2

- 기존 같은 배열 위치끼리 비교하던 Motif 가족 점수를 동적 정렬 기반 비교기로 교체했다. 조옮김 불변 음정, 윤곽, 반복/순차/도약 음형, 정규화 음가·IOI, metric strength, 정렬 coverage를 개별 evidence로 보존한다.
- 결합 점수는 melodic 40%, shape 20%, rhythm 25%, coverage 15%다. 이는 미보정 휴리스틱이며 정답 확률이 아니다.
- 장식음 삽입·누락, 반복음 확장, 음높이 대체, 리듬 변화, 조옮김, 긴 종결음 길이 변화를 transformation tag로 설명한다.
- Motif 상세 패널은 결합 점수뿐 아니라 멜로디·음형·리듬·정렬 범위와 감지된 변형을 따로 표시한다.
- `docs/README.md`를 문서 진입점으로 추가해 현재 기준 문서, 구현 설명, 날짜순 기록, 역사 문서를 구분했다. 기존 문서는 사례 링크를 깨지 않도록 이동하지 않았다.
- 회귀 검사는 완전 조옮김, 장식음 삽입, 긴 종결음 길이 변형을 포함한다. Beam transport와 exact signature 없는 sliding-window 후보 생성은 다음 단계다.

## 2026-09-15 — Beauty and the Beast Motif 가족 과잉 병합 수정

- `S-STRUCT-002`의 34개 `four-short-plus-long-arrival` 후보가 rhythmFamily 문자열 하나 때문에 모두 Motif 1의 prime 변형으로 강제되던 원인을 확인했다.
- rhythmFamily를 후보 생성 근거로만 낮추고, 가족 자동 재사용에는 결합 유사도 84 이상과 coverage 70 이상을 요구한다. 짧은 동일 길이 구간의 delete+insert 정렬이 다른 음형을 과대평가하지 않도록 gap cost도 0.48로 높였다.
- 표기는 prime 누적 대신 가족-변형 번호인 `Motif 1-1`, `Motif 1-2`, `Motif 2-1`을 사용한다. 같은 변형의 재등장은 같은 표기를 쓰되 occurrence ID는 독립적이다.
- 실제 34개 후보는 6개 가족 후보로 분리됐다. 이는 정답 가족 수가 아니라 이전의 강제 단일 가족 오류가 해소됐다는 진단 결과다.
- 관련 악보·event snapshot은 기존 `S-STRUCT-002` 자산을 재사용하고 사용자 피드백, 원인, 일반화 규칙, 실행 결과를 evaluation case에 추가했다. 대상 테스트 36개와 production build가 통과했다.
