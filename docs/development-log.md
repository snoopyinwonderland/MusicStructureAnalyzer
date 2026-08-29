# MUSICANOTE 개발 기록

이 문서는 사용자 요청, 구현 결정, 검증 상태와 다음 작업을 누적 기록한다. 기능을 변경할 때마다 관련 항목과 검증 결과를 갱신한다.

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
