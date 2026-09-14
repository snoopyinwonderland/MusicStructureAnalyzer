# Motif Multi-Evidence Similarity v0.2

## 상태

2026-09-15 구현된 미보정 휴리스틱이다. Motif 정답 확률이 아니며, 사용자 Annotation으로 임계값을 보정하기 전까지 Analysis Layer 가설로 취급한다.

## 목적

음형, 멜로디, 리듬을 동시에 비교하되 개별 근거를 잃지 않는다. 정확 일치만 찾지 않고 장식음 삽입·누락, 반복음 확장, 조옮김, 일부 음높이·음가 변화, 긴 종결음의 길이 변형을 허용한다.

## 정렬

전역 동적 정렬로 두 occurrence의 음표를 대응시킨다. 음표 대응 비용은 조옮김 불변 음정, 윤곽 방향, 반복/순차/도약 음형 등급, 중앙값으로 정규화한 음가와 IOI, 가능한 경우 metric strength를 사용한다. 삽입과 누락은 고정 비용을 내며 결과 alignment에 보존된다.

## 출력 점수

- `melodic`: 대응된 음 사이의 조옮김 불변 음정 65% + 윤곽 35%
- `shape`: 윤곽 65% + 반복/순차/도약 분류 35%
- `rhythm`: 정규화 음가 55% + 정규화 IOI 45%
- `coverage`: 긴 occurrence 대비 대응된 음표 비율
- `similarity`: melodic 40% + shape 20% + rhythm 25% + coverage 15%

`interval`과 `contour`도 진단 및 이전 UI 호환을 위해 따로 반환한다. 결합 점수만으로 가족을 확정해서는 안 된다.

## 가족과 표기

`rhythmFamily`는 후보를 만드는 증거이며 Motif 가족 ID가 아니다. 같은 `four-short-plus-long-arrival` 리듬형이라도 결합 유사도 84 이상, coverage 70 이상을 함께 충족해야 기존 가족의 자동 후보가 된다. 그 아래는 별도 가족으로 두며 72–84 구간의 경쟁 가설 보존은 후속 Analysis Record 작업에서 구현한다.

표시는 prime 문자를 계속 붙이지 않고 `Motif <가족>-<변형>`을 사용한다. 예를 들어 `Motif 1-1`의 음가나 종결부가 의미 있게 달라지면 `Motif 1-2`, 다른 멜로디 가족이면 `Motif 2-1`이다. 동일 변형의 재등장은 같은 표기를 재사용하되 내부 occurrence ID는 별도로 유지한다.

짧은 동일 길이 음형에서 한 음을 삭제하고 다른 한 음을 삽입하는 정렬은 유사도를 과장하기 쉽다. 따라서 gap cost를 0.48로 두어 가능한 경우 동일 위치의 pitch substitution으로 평가한다. 실제 `S-STRUCT-002`에서는 같은 rhythmFamily로 강제되던 34개 후보가 이 규칙과 다중 증거 가족 판정을 거쳐 6개 가족 후보로 분리됐다. 이 수는 정답 개수가 아니라 과잉 병합이 해소됐는지를 보는 미보정 진단값이다.

## 변형 태그

`transposition`, `pitch-substitution`, `ornament-insertion`, `note-deletion`, `rhythm-variation`, `repeat-expansion`, `terminal-extension`을 지원한다. 태그는 정렬의 설명이며 작곡기법에 대한 확정 해석이 아니다.

## 현재 한계

- Beam 그룹은 아직 검색 event로 운반되지 않아 점수에 포함되지 않는다.
- core/complete extent 후보 생성은 이 비교기 외부 단계다.
- 현재 가족 임계값은 경험적이며 competing hypothesis margin을 아직 UI에 표시하지 않는다.
- 반복음 축약과 여러 장식음이 동시에 나타나는 경우 affine gap 또는 many-to-one 정렬이 더 적합할 수 있다.

## 다음 단계

Beam transport 후 metric/beam 채널을 추가하고, exact signature가 없는 구간에도 sliding-window 후보를 제안한다. 이후 동일 사용자 사례를 고정 회귀 fixture로 평가해 가족 임계값과 모호성 범위를 보정한다.
