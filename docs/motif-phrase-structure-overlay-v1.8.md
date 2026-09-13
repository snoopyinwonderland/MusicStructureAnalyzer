# Motif / Phrase Structure Overlay v1.8

## 검토 사례

`S-STRUCT-002`는 Beauty and the Beast의 전곡 MusicXML, 선택 melody stream의 181개 event, 전체 harmony event, 사용자 구조 판단을 함께 보존한다. 구현에는 작품 제목, work ID, 고정 마디, 고정 음높이를 조건으로 사용하는 코드가 없다.

## 새 Motif evidence

이 사례의 지배적 리듬 골격은 네 개의 짧은 attack이 하나의 긴 도착음으로 향하는 형태다. 검출기는 절대 음가가 아니라 local unit에 대한 비율을 사용한다.

- pickup: 짧은 attack 4개
- pickup 전체 span: local short unit의 약 4배
- arrival: local short unit의 3.5배 이상
- straight variant: 네 짧은 음의 비율이 약 `1:1:1:1`
- syncopated variant: 네 음의 총 span은 유지하면서 내부 음가가 재분배됨

`[8분, 점8분, 16분, 8분]`뿐 아니라 `[8분, 점8분, 8분, 16분]`처럼 accent 위치가 달라진 변형도 같은 `four-short-plus-long-arrival` rhythm family의 변형 후보로 둔다. 이를 syncopation이라고 확정하는 것은 Analysis Layer 판단이며 Canonical Core 사실이 아니다.

## Phrase grouping prior

다음 조건을 모두 만족할 때만 주제 cell 기반 Phrase prior를 사용한다.

1. 검출된 cell이 8개 이상이다.
2. cell이 melody attack의 55% 이상을 덮는다.
3. straight와 syncopated variant가 함께 존재한다.

조건을 만족하면 한 cell을 곧바로 하나의 Phrase로 확정하지 않는다. 기존 경계가 연속된 1-cell Phrase 두 개를 만들면 두 cell의 상위 Phrase로 합친다. `1 cell + 4 cells`처럼 불균형한 이웃은 `2 + 3`으로 이동한다. 네 cell 이상인 긴 구간은 2–3개의 완전한 cell 뒤에 오는 다음 주제 attack을 새 Phrase 시작 후보로 추가한다.

이 과정에서 기존 경계의 strength와 cue는 삭제하지 않는다. 억제된 경계는 `rawStrength`, `thematic-cell-internal-continuation`, `requiresCadenceReview`와 함께 보존한다. 새 경계도 확정 정답이 아니라 `thematic-cell-phrase-restart` 가설이다. 독립적으로 검증된 Cadence와 human correction은 이 prior를 덮어쓸 수 있다.

## S-STRUCT-002 적용 결과

- 1–2마디 A–B♭–G–A–F를 포함해 34개의 주제 cell을 찾았다.
- 기존 9–10마디와 11–12마디 Phrase를 9–12마디 한 Phrase로 합쳤다.
- 17마디 cell과 19마디 A–C–E–F–G cell을 합치고, 다음 Phrase를 20마디 A5 attack에서 시작한다.
- 24–25마디와 26–27마디의 주제 cell을 한 Phrase로 합쳤다.
- 28마디부터 32마디 첫 긴 G5까지를 한 Phrase로 두고, 32마디 두 번째 B4 attack에서 다음 Phrase를 시작한다.
- 이후의 긴 구간도 같은 2–3 cell 규칙으로 분할한다.

선택된 경계 index는 `22, 32, 47, 57, 72, 82, 97, 112, 127, 146, 156, 171`이다. 사용자 검토 범위의 핵심 이동은 `27/52/77` 억제와 `57/97` 추가다.

## UI 표기

Phrase 선택 목록, 악보 위 Phrase label, Phrase 상세, Motif 상세의 시작·마지막 음은 `음높이(음가)` 형식을 사용한다.

- `A3(8분음표)`
- `G4(온음표)`
- `C6(5박·타이 지속)`

음높이와 일반 문장은 Campania를 사용하지 않는다. 로마숫자 화성 값만 Campania 대상이다.

## 제한

2–3 cell은 보편적 음악 법칙이 아니라, 지배적인 rhythm family가 확인된 작품에서만 쓰는 미보정 prior다. 여러 리듬 가족이 비슷한 빈도로 공존하거나, 명확한 full cadence가 각 cell을 독립 Phrase로 닫는 반례를 추가 수집해야 한다.

