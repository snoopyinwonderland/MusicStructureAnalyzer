# MUSICANOTE 개발 기록

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
