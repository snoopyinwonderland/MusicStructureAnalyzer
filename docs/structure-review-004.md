# S-STRUCT-004 검토 및 적용

## 2026-09-15 후속 수정: 고정 rhythm-cell의 빠진 앞부분

- 사용자 검토와 원본 대응은 S-STRUCT-004의 “당시 Motif 4-1” 항목에 기록했다. 75..79 core를 검출한 뒤 73..79 complete extent로 복구한다.
- `rest-anchored-short-pickup-v1`: rhythm-cell 앞 최대 네 attack을 역탐색한다. cell의 종결음 제외 duration 중앙값을 unit으로 하며, 앞의 음가가 unit의 0.5–1.5배이고 release/다음 onset이 연속일 때만 탐색한다. 탐색 결과는 악보 시작이거나 앞에 `max(0.5 quarter, unit)` 이상의 공백이 있어야 채택한다. 다른 후보가 차지한 음, 긴 도착음, tie continuation 또는 중간 gap을 넘어가지 않는다. 탐색 한계/수치는 초기 휴리스틱이다.
- family 비교 전에 complete extent를 복구한다. 원래 coreStartIndex와 확장된 completeStartIndex를 extentEvidence에 함께 보존한다. 원본 이벤트와 Phrase 경계는 바꾸지 않는다.
- 가족 비교 기준을 느슨하게 하지 않았다. 해당 후보는 복구 후 결합 91/정렬 범위 78로 Motif 3-3이 된다. 단순 계산 곤란을 이유로 새 가족을 확정하지도, Prolongation을 주장하며 강제로 병합하지도 않는다. 낮은 확신은 별도 후보로 유지하는 정책이다.
- 검증: 실제 사례의 복구된 음높이/범위/가족 관계, 다른 후보 침범 방지, gap 없는 경우, 긴 앞 음, 탐색 한계를 포함한 관련 54개 테스트 통과. TypeScript 검사와 프로덕션 빌드 통과(기존 Verovio 번들 경고 유지). 브라우저 시각 검증은 별도이다.

## 2026-09-15 후속 수정: 반복 주기보다 실제 종결 증거 우선

- 원인: 인접 반복 시작점의 간격을 다음 Motif에도 그대로 투영하여, 짧아진 타이 종결음 뒤의 쉼과 새 음형까지 포함했다.
- 구현: `src/music/motifExtent.ts`, `long-arrival-rest-v1`. cycle/parallel-cell의 시간 기반 끝 계산에서 반복 주기는 상한으로만 사용한다. 최소 네 attack 이후 도착음 길이가 `max(1 quarter, 직전 세 attack 길이 중앙값의 2배)` 이상이고 실제 release 뒤의 gap이 `max(0.5 quarter, 같은 중앙값)` 이상이면 해당 도착음에서 끝낸다. 이 수치는 초기 휴리스틱이며 음악적 보편 법칙이나 종지 판정이 아니다.
- durationRatio는 누적 sounding tie 길이를 사용한다. 중간 tie continuation도 release 검사에 포함해 가짜 쉼을 방지하고 원본 이벤트/음가는 바꾸지 않는다. explicit rest는 attack으로 세지 않는다.
- Phrase-frame 및 rhythm-cell 자체의 경계 로직은 변경하지 않는다. 새 규칙은 시간 기반 투영에 한정하며 독립적인 Motif 최소 음수 규칙을 새로 선언하지 않는다.
- 실제 저장 사례: 두 번째 occurrence `[8,18)`이 `[8,16)`으로 바뀌어 D#5(index 15, 8마디까지 타이 지속)에서 끝난다. 쉼 뒤 D#5/C#5는 제외된다. 첫 occurrence `[0,8)`은 유지한다. 가족 명칭은 수정된 범위로 다시 계산하므로 바뀔 수 있다.
- 회귀: 실제 사례, 변형 종결음, 쉼만 있는 반례, 짧은 gap, tie continuation, explicit rest, 반열린 구간을 검증했다. 관련 5개 파일 45개 테스트 및 TypeScript/프로덕션 빌드 통과. 빌드에는 기존 Verovio 외부 모듈/큰 번들 경고가 남는다.

사용자 의견과 변경 전 번호는 [사례](../evaluation/cases/s-struct-004-review.md), 원본 전체 문맥과 298개 이벤트는 evaluation/case-assets/S-STRUCT-004에 저장했다.

Motif 2의 첫 구간 [3,8)은 Motif 1 [0,8)의 꼬리였다. 긴 도착음 rhythm-cell 검출기가 이를 독립 후보로 생성했다. 큰 후보 내부의 rhythm-cell을 containedFragments로 보존하고 독립 표시는 제외하도록 수정했다. 일부만 일치하는 모든 Motif를 일괄 제거하는 규칙은 아니다.

local-boundary-evidence-v1.10은 원본 MusicXML의 fermata/breath-mark/caesura를 part/staff/voice/measure/beat/pitch로 연결하고 XML 위치를 증거에 보존한다. 다음 attack에 각각 .45/.55/.7 지지를 부여한다. 기존 경계 강도가 .25 이상이면 기존 값에 기호 지지의 절반을 더하며 최대 .9로 제한한다. 최종 자동 표시 기준 .65는 유지한다. 타이 지속음은 건너뛰며 실제 연주 시간을 추정하지 않는다. 이 값들은 검토용 미보정 기준이다.

원본 페르마타는 ordinal 89마디에 두 개 존재한다. 25마디 F#5에 대한 사용자 발언은 가정/대안이며 원본에 추가하지 않았다. 프레이즈 병합과 25마디 대안, 긴 Phrase 11의 재분할 요청은 사례에 보존했다. 구체적 분할점과 화성/반복 근거 검증 전에는 해당 악보만을 위한 수동 경계 변경을 하지 않았다.

검증: 기존 프레이즈·Motif 및 신규 출처/타이·부분 포함관계 회귀 59개 통과. 화면 분석에서는 기호 adapter가 연결되며 기존 검색 인덱스의 전체 재파싱은 하지 않았다.
