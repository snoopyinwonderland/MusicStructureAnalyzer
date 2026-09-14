# MusicStructureAnalyzer 문서 안내

문서가 늘어나더라도 현재 계약, 현재 구현, 과거 개발 기록을 혼동하지 않도록 이 파일을 진입점으로 사용한다.

## 1. 현재 기준 문서

- `MUSICANOTE_Creator_Preclearance_Development_Spec_KO.md`: 검색·사전검토 제품 규격
- `motif-variation-analyzer-v0.2-plan.md`: Motif 변형·범위 분석 구현 순서
- `motif-similarity-v0.2.md`: 현재 다중 증거 유사도 알고리즘의 구현 계약
- Canonical IR과 Analysis Layer의 정본 규격은 별도 MusicAnalysisHarness 저장소의 `MUSICANOTE_Canonical_Music_IR/README.md`에서 시작한다.

## 2. 현재 구현 설명

- `motif-phrase-structure-overlay-v1.9.md`: Phrase/Motif 오버레이의 최신 동작
- `creator-preclearance-search-stage.md`: 구조 기반 검색 단계
- `phrase-review-viewer.md`: 검토 화면과 Annotation 저장 흐름
- `evaluation-case-knowledge-base.md`: 사용자 피드백 사례의 보존 형식

## 3. 개발 기록과 평가

- `development-log.md`: 날짜순 전체 변경 기록. 새 변경은 이 파일 최상단에 추가한다.
- `motif-*-search-evaluation*.md`, `query-100-evaluation-report.md`: 검색 평가 결과
- `creator-preclearance-search-evaluation-*.md`: 사전검토 평가 결과

## 4. 역사적 설계 문서

`motif-phrase-structure-overlay-v1.5.md`부터 `v1.8.md`, `phrase-boundary-v1.*.md` 등은 당시 결정과 회귀 이유를 보존하는 역사 문서다. 최신 규칙보다 우선하지 않는다. 파일은 링크와 사례 추적성을 유지하기 위해 당분간 이동하지 않는다.

## 변경 기록 규칙

모든 분석 변경은 (1) 현재 구현 계약, (2) 테스트/평가 사례, (3) `development-log.md`를 함께 갱신한다. Canonical 의미나 계층 계약이 바뀌면 MusicAnalysisHarness 정본 규격도 갱신한다.
