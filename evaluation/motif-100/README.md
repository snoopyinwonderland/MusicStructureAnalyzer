# Motif 100 evaluation data

이 디렉터리는 실제 검색 DB에서 고른 20개 원형과 다섯 변형씩 만든 100개 검색 사례를 보관한다.

## 파일

- `cases.jsonl`: Query, 기대 work/source/stream, 원형 onset·pitch·measure, 변형 종류, 선별 근거를 포함한 재사용 가능한 사례 원자료
- `../runs/motif-100-latest.json`: DB 크기·수정 시각, 검색 코드 hash, Query hash, 실제 Top100 결과, 순위, direct expected alignment, 경쟁 결과, XML/SVG 강조 검증, latency를 포함한 실행 snapshot
- `../../docs/motif-100-search-evaluation.md`: 사람이 읽는 전체 결과와 개선 방향

## 재실행

```powershell
pnpm harness:motif-100
```

단계를 나누려면 다음과 같이 실행한다.

```powershell
node scripts/motif-100-benchmark.mjs prepare
node scripts/motif-100-benchmark.mjs run --max 100
```

runner는 DB 크기·수정 시각, 검색 코드 hash, Query hash가 모두 같을 때만 완료 사례를 이어 쓴다. 하나라도 바뀌면 새 기준선으로 다시 실행한다. `prepare`는 사례를 다시 선별하므로 기존 사례를 그대로 재평가하려면 `run`만 사용한다.

## 판정 범위

모티프 원형은 반복성, 음정·리듬 정보량, 시작 박의 강도, melody-role을 결합한 휴리스틱 후보다. 사람의 주제 분석을 대신하지 않는다. 강조 검증은 XML 좌표와 Verovio SVG target의 존재를 자동 검사하며, 브라우저 레이아웃의 육안 품질은 별도 표본 검토가 필요하다.
