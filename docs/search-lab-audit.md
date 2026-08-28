# Search Lab Phase 0 감사

작성일: 2026-08-27

## 발견 사항

- `K:\MusicSearch`는 소스, Git 메타데이터, package manifest가 없는 빈 폴더였다.
- 따라서 기존 production `/search`의 component tree, API, DB schema, parser, CI와 feature flag 구현은 로컬에서 감사할 수 없었다.
- 공개 `musicanote.com/search`는 상단의 Search/AI Studio/Pricing 탐색, Undo/Clear/Search 입력 동작, Suggested Motifs, ABC 문자열과 YouTube iframe 결과를 사용한다.
- 이번 작업은 production을 건드리지 않는 독립 Vite/React 프로젝트로 구현한다. 운영 DB migration, index, YouTube live lookup은 수행하지 않는다.

## 확정한 구현

| 영역 | 선택 | 근거 |
| --- | --- | --- |
| UI | React + TypeScript + Vite | 빈 저장소에서 독립적이고 검증 가능한 lab 제공 |
| 악보 | QueryEvent → MEI → Verovio WASM SVG | 입력 state와 engraving을 분리하고 abcjs 의존 제거 |
| 재생 | QueryEvent를 Web Audio로 직접 schedule | 검색 상태와 renderer/player 상태의 결합 방지 |
| 검색 | in-memory q-gram + application DTW | corpus/DB가 없는 상태에서 동일 인터페이스의 검증 가능한 harness 제공 |
| 구조 분석 | continuous salience + confidence gate | 자동 Ursatz 판정의 과도한 확신 방지 |
| 결과 | work별 최고 occurrence, Exact/Similar 분리 | 중복 카드와 순위 역전 방지 |

## 미확인/운영 연동 전 필수 감사

- 실제 absolute match API와 회귀 fixture
- relational DB 종류와 work/source/YouTube 저장 위치
- MusicXML/MIDI parser의 tie, repeat, chord, part/voice 처리
- corpus 크기, stream 길이, source rights status와 오류 표본
- Elasticsearch/OpenSearch/Redis 사용 여부
- dev 배포와 production feature flag/rollback 방식

## 기준선

현재 `npm test`는 전조 불변 exact, 리듬 정규화, exact 우선, alignment 근거를 검사한다. `npm run eval`은 synthetic 전조/tempo scale과 역방향 contour hard negative를 검사한다. 실제 Recall@10, MRR, nDCG, p95는 운영 gold set과 corpus를 제공받은 뒤 측정해야 하며 이 fixture 수치를 성능 주장으로 사용하지 않는다.
