# Motif / Phrase Structure Overlay v1.7

## 목적

이번 변경은 A Whole New World에서 발견된 오류를 특정 작품 예외로 고치는 작업이 아니다. 부분 일치, Motif occurrence의 완전한 길이, Phrase 후보, tie의 기보상 표시가 서로 다른 의미임을 구현과 데이터 계약에 반영한다.

## 발견된 원인

1. 반복 검색 relation의 `length`는 공통으로 일치한 signature 길이일 뿐, 완전한 Motif의 끝을 보장하지 않는다.
2. 이전 prototype은 짧은 Phrase 후보를 Motif 길이 후보로도 사용했다. 이 때문에 근거 없는 F#4–F#4 중도 절단과 재등장 구간의 한 음 과장이 생겼다.
3. 가까운 Motif 반복은 묶었지만, 긴 평행 재현 전체를 비교하지 않아 뒤쪽에서만 짧은 Phrase 경계가 생겼다.
4. Canonical occurrence의 마지막 event와 악보에서 보이는 tie continuation을 같은 것으로 취급해, 다음 마디까지 지속되는 음의 범위가 짧게 보였다.

## 적용한 일반 규칙

### Prototype extent projection

가까운 반복 주기 또는 평행 cell 배치로 완전한 기준 occurrence가 성립하면, 먼 재등장에는 relation의 부분 길이 대신 기준 occurrence의 attack 수를 투영한다. 마지막 음가만 다른 경우 음정 진행, 윤곽, event coverage가 같으면 같은 Motif 변형으로 유지할 수 있다.

### Phrase-to-Motif isolation

Phrase 후보의 시작이나 끝은 Motif occurrence 길이를 정하는 자료로 사용하지 않는다. Motif 경계는 Motif relation과 cell 구조로, Phrase 경계는 호흡·시간·선율 종결·화성·Cadence 증거로 판단한다.

### Parallel-cell bounding

같은 source-to-recurrence displacement와 같은 내부 간격을 가진 두 relation은 대응되는 cell 쌍을 만든다. 첫 cell은 다음 cell 시작 직전까지, 두 번째 cell은 source와 recurrence에서 대응하는 끝까지 표시한다.

### Tie-aware display endpoint

Motif Analysis Record의 끝은 마지막 attack event로 유지한다. 그 attack이 tie chain의 시작이면 score overlay만 tie continuation glyph까지 이어 그 소리가 다음 마디까지 지속됨을 보여 준다.

### Repeated-passage Phrase consistency

12개 이상의 정렬된 attack을 가진 두 긴 구간이 조옮김을 고려한 음고와 리듬에서 높은 일치를 보이면, 두 구간의 Phrase 분할도 함께 비교한다. 한쪽에만 존재하는 약한 내부 경계는 `internal-repeated-passage`로 낮추되 원래 강도는 `rawStrength`로 보존한다. 검증된 Cadence, 명확한 실제 쉼, human correction은 이 연속성 가설을 덮어쓸 수 있다.

`observed-gap`이 있더라도 직전 event의 tie chain이 현재 마디까지 이어지면 실제 호흡 쉼으로 간주하지 않는다. 검색용 attack event의 notated duration만 보고 계산한 가짜 공백일 수 있기 때문이다. 반대로 tie가 덮지 않는 강한 실제 공백은 반복 유사성보다 우선한다.

평행 cell의 길이는 이미 가까운 반복 주기로 확립된 prototype이 있으면 그 길이를 우선한다. 더 넓은 부분 일치 relation이 나중에 발견되어도 prototype을 한 음 늘리지 않는다. prototype이 없을 때만 평행 relation 묶음의 길이를 사용한다.

## S-STRUCT-001 결과

Motif occurrence는 다음처럼 정렬된다.

- Motif 1: event 0–5, 재등장 27–32
- Motif 1′: event 6–12, 재등장 33–39
- Motif 2: event 54–57, 재등장 83–86
- Motif 2′: event 58–65, 재등장 87–94

두 Motif 2′의 마지막 attack은 각각 다음 마디의 tie continuation까지 화면에 표시된다. 특히 30마디에서 시작하는 재등장은 32마디 첫 tie continuation 음표까지 보인다.

Phrase 분석기는 다음 긴 평행 구간을 인식한다.

- source event `[0,27)` ↔ recurrence `[27,54)`
- source event `[54,83)` ↔ recurrence `[83,112)`

이에 따라 이전의 짧은 오류 구간이 억제되어 자동 Phrase 수가 20개에서 12개로 줄었다. 해당 후반부는 20–28마디와 28–38마디의 상위 Phrase로 표시된다. 31–32마디의 tie를 notated duration만으로 계산해 만들었던 가짜 `observed-gap`도 상위 Phrase를 다시 자르지 않는다.

## 제한과 다음 검증

이 단계의 유사도와 경계 강도는 아직 미보정 값이다. 긴 반복이라는 이유만으로 실제 종지를 제거하지 않도록, 다음 단계에서는 완전한 MusicXML 수직 화음에 기반한 Cadence 증거와 여러 작품의 reviewer 사례로 override 조건을 검증해야 한다.

구현 버전은 `local-boundary-evidence-v1.7`이며, 사례 원문·MusicXML context·canonical event snapshot·사용자 판단은 `S-STRUCT-001`에 함께 보존한다.
