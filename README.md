# MUSICANOTE Similarity Search Lab

전조·템포 변화·일부 장식음을 허용하는 설명 가능한 선율 유사 검색 프로토타입입니다. 기존 production `/search`와 분리된 독립 프로젝트이며 실제 음악 저작권 침해를 판정하지 않습니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173/search-lab` 또는 `/`을 엽니다.

## 검증

```bash
npm test
npm run eval
npm run build
```

## Music Analysis 데이터 동기화

기본 검색 corpus는 `K:\Music Analysis\output\latest-canonical-ir-review\canonical_music_ir_v0.1.json`에서 생성합니다.

```powershell
pnpm sync:music-analysis
```

가장 바쁜 part의 동시 onset 중 최고음을 임시 melody stream으로 선택합니다. 이는 운영용 main-melody 판정이 아니라 Canonical IR 연동을 위한 임시 정책입니다.

### 전체 MusicXML 검색 index

전체 corpus 검색에는 분석용 Canonical IR 전체를 복제하지 않고 compact JSONL index를 사용합니다.

```powershell
pnpm index:musicxml      # inventory의 고유 MusicXML을 중단 후 재개 가능한 방식으로 파싱
pnpm index:finalize      # grace/zero-duration 제거 및 feature 재계산
```

최종 index: `data/search-index-v2/works.jsonl`

- work/source hash와 정규화 작품명
- part/staff/voice identity 및 melody-role heuristic
- tie가 병합된 sounding note의 measure, beat, onset, MIDI pitch, duration
- pitch interval, 5-class contour (`LU/SU/SAME/SD/LD`), 평균 대비 정규화 rhythm

Canonical IR은 분석·검증·원본 역추적의 기준 모델로 유지합니다. 검색 서비스는 전체 Canonical IR 대신 위 compact index와 향후 생성할 n-gram inverted index만 사용합니다.

## YouTube 대표 영상 백필

YouTube Data API 키는 저장소에 넣지 않고 환경변수로 제공합니다.

```powershell
$env:YOUTUBE_API_KEY='...'
pnpm youtube:backfill   # 오늘 남은 최대 100개 작품 처리 후 종료
pnpm youtube:worker     # 실행 상태를 유지하며 매일 quota reset 후 계속 처리
pnpm sync:music-analysis
```

- 결과는 `data/youtube-matches.json`에 누적되고 진행 상태는 `data/youtube-backfill-state.json`에 저장됩니다.
- Pacific Time 기준 일일 100회 `search.list` 상한을 지킵니다.
- solo/duet/trio/quartet 등 편성 표기를 제거한 작품명으로 묶어 같은 대표 영상을 공유합니다.
- 조회수 정렬 후 제목 일치, official/OST/channel 신호로 대표성을 보정합니다.
- `videoEmbeddable=true`, `videoSyndicated=true`로 검색하고 `videos.list`의 공개·embed 상태와 한국 지역 차단을 다시 검사합니다.

## 구현 범위

- `QueryEvent[]`가 유일한 입력 상태이며 여기서 MEI를 생성합니다.
- Verovio WASM이 MEI를 SVG로 렌더링합니다. abcjs는 사용하지 않습니다.
- C2–E6 건반, 검은 건반, 쉼표, 64분음표–온음표 snap, Undo/Redo/Clear/Delete, 박자와 모드 선택, Web Audio 재생을 제공합니다.
- 음가 증감은 `1/16, 1/8, 1/4, 1/2, 1, 1.5, 2, 3, 4 beat`만 사용합니다. 인접한 같은 음 두 개를 선택해 Tie로 묶을 수 있으며 검색에서는 합산된 하나의 sounding event로 처리합니다.
- 음정/윤곽 q-gram 후보화, downbeat 제한 exact search, 장식음 비용을 낮춘 weighted DTW를 제공합니다.
- Exact/Similar bucket, alignment, component score, occurrence importance, analysis confidence를 분리해 표시합니다.
- 결과의 악보 버튼을 누르면 매치가 포함된 마디 구간을 다시 렌더링하고 정렬된 음표를 붉게 표시합니다.
- 현재 corpus는 동작 검증용 synthetic fixture입니다. 운영 corpus 또는 외부 유료 API는 포함하지 않습니다.

설계 근거와 제한은 [docs/search-lab-audit.md](docs/search-lab-audit.md), [docs/adr-001-search-architecture.md](docs/adr-001-search-architecture.md)를 참고하세요.
