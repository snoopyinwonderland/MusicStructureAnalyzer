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

## 변형 태그

`transposition`, `pitch-substitution`, `ornament-insertion`, `note-deletion`, `rhythm-variation`, `repeat-expansion`, `terminal-extension`을 지원한다. 태그는 정렬의 설명이며 작곡기법에 대한 확정 해석이 아니다.

## 현재 한계

- Beam 그룹은 아직 검색 event로 운반되지 않아 점수에 포함되지 않는다.
- core/complete extent 후보 생성은 이 비교기 외부 단계다.
- 현재 가족 임계값은 경험적이며 competing hypothesis margin을 아직 UI에 표시하지 않는다.
- 반복음 축약과 여러 장식음이 동시에 나타나는 경우 affine gap 또는 many-to-one 정렬이 더 적합할 수 있다.

## 다음 단계

Beam transport 후 metric/beam 채널을 추가하고, exact signature가 없는 구간에도 sliding-window 후보를 제안한다. 이후 동일 사용자 사례를 고정 회귀 fixture로 평가해 가족 임계값과 모호성 범위를 보정한다.
