# S-STRUCT-004 — THE LAST NIGHT OF THE WORLD

## 후속 검토 — 당시 Motif 4-1의 앞부분과 가족 관계

사용자: “Motif 4-1은 3-1의 변형 같은데 앞부분을 잘못 잡았고, 길이 차이가 조금 있어서 Prolongation을 읽지 못한 모양입니다. 이런 거 계산이 까다로우면 새로운 모티프로 잡는 게 나을 수도 있겠네요. 어떤가요. 어쨌든 앞 부분 미파솔은 포함해야 합니다.”

스냅샷 대응: 기존 3-1은 index 53..61, 기존 4-1은 75..79였다. 실제 23마디 index 73..75의 E5–F#5–G#5 중 E5/F#5가 빠졌다. 73의 onset 90.5에 앞서 72의 C#5가 89.5에 release되어 1 quarter의 공백이 있고, 73..78은 연속된 짧은 음이다. 고정 `four-short-plus-long-arrival` 창이 75..79만 생성한 것이 직접 원인이다. Prolongation 미인식은 사용자 가설이며 확정 원인으로 저장하지 않는다.

`rest-anchored-short-pickup-v1`로 core 시작 75를 보존하면서 complete 시작을 73으로 확장했다. family 임계값 84/coverage 70은 유지했다. 수정 후 53..61 대비 melodic 95, shape 94, rhythm 88, coverage 78, combined 91로 기존 분류기가 Motif 3-3을 반환한다. 이는 검토용 후보이며 Prolongation/화성적 연장 확정이나 학습용 gold label이 아니다. 원본 XML과 앞뒤 이벤트는 기존 S-STRUCT-004 자산을 재사용한다.

## 후속 진단 — Motif 1-2가 쉼 뒤까지 확장되는 이유

사용자 질문: D#5 tied note에서 끝나지 않고 쉼표 뒤 레도까지 포함하는 이유는 무엇인가?

저장된 이벤트와 FullScorePage.tsx의 buildMotifSpans를 대조한 결과, 반복 시작점 간 간격을 다음 occurrence의 길이로 투영하는 cycle 후보가 원인이다. 첫 시작 onset 16과 다음 시작 24의 차이 8 quarter를 다음 시작에 더해 exclusive end 32를 만든다. cycleEnd는 이 시각보다 앞의 attack을 모두 포함하며, 그 사이의 쉼이나 긴 도착음의 release는 검사하지 않는다.

첫 occurrence의 D#5(index 7)는 onset 19.5, duration 3.5로 release 23이다. 두 번째 D#5(index 15)는 onset 27.5, duration 2.5로 release 30이다. 뒤의 D#5(index 16, onset 31), C#5(index 17, onset 31.5)는 1 quarter의 쉼 뒤에 있지만 투영 끝 32보다 앞이어서 포함된다. 타이 누적 길이 자체는 저장되어 있으며, 오류는 이를 종결 후보로 사용하는 검사 누락이다. family/variant 판별은 이 잘못 확장된 구간을 받은 뒤 실행되므로 1-2라는 명칭은 구간의 음악적 타당성을 보증하지 않는다.

진단 당시에는 endpoint 알고리즘을 변경하지 않았다. 이후 사용자의 수정 요청으로 `long-arrival-rest-v1`을 적용했다. 반복 주기는 상한으로 사용하며 긴 도착음과 실제 쉼을 함께 확인해 complete extent를 검증한다. 저장 사례의 두 번째 occurrence는 index 8..15로 수정되고 첫 occurrence 0..7은 유지됨을 회귀 테스트로 확인했다. 타이 지속은 끝까지 보존한다. 구체적 기준과 제한은 docs/structure-review-004.md에 기록했다.

2026-09-15 사용자 검토. work-b4fdcba72f89a969. 전체 원본 문맥과 분석 당시 번호는 ../case-assets/S-STRUCT-004/ 에 보존한다.

| 당시 표시 | 사용자 의견 | 상태 |
|---|---|---|
| Motif 1 / 2 | 1은 적절하나 2는 1의 부분으로 보이며 완결성 부족 | 후보 포함관계와 독립 종결 근거 검사 필요 |
| Phrase 2+3 | 합치는 것이 좋음 (event [16,27), 8–11마디) | 사용자 선호, 일반 규칙 검토 |
| Phrase 5+6 | 같은 이유로 합침 ([43,53), 16–19마디) | 반복 문맥 대응 검토 |
| Phrase 8 | 현재 해석도 가능, 25마디 F#4부터 다음 Phrase로 넘기는 대안 | 복수 해석 보존 |
| F#5 fermata | 페르마타가 있다면 더 어울릴 것 같다는 가정 | 원본 기호로 생성하거나 확정하지 않음 |
| Phrase 10+11 | 짧은 10은 11에 연결, 긴 11은 내부 분할 | 병합 뒤 재분할 의견; 분할 위치 미지정 |

호흡 기호 규칙: 원본의 fermata, breath-mark, caesura를 출처가 있는 관찰로 보존하고, 해당 음의 release/다음 attack에 경계 증거로 연결한다. tie continuation에서 새 경계를 만들지 않는다. fermata는 음의 연장 기호이므로 단독으로 Phrase 종결을 확정하지 않고 쉼·반복·선율 도착·화성 근거와 결합한다. 가정한 fermata는 annotation의 대안 해석에만 둔다.

부분 Motif 규칙: 완성된 occurrence 안에 포함되는 약한 exact-match 부분 후보는 독립 Motif로 기본 노출하지 않는다. 독립적으로 등장하거나 명시적 호흡/종결 근거를 가진 경우 fragment/submotif 관계로 유지할 수 있다. 부분 관계만으로 원 데이터를 삭제하지 않는다.
