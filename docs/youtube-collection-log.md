# YouTube 대표 영상 수집 기록

## 운영 규칙

- 자동화 ID `ky`의 일일 실행에서 KY 메타데이터 수집 다음 순서로 실행한다.
- YouTube Data API의 Pacific date를 기준으로 하루 최대 95회 search call을 사용한다. 검색 결과 클릭으로 이미 사용한 호출 수도 같은 state에 포함한다.
- 정규화한 곡 제목을 key로 사용하여 solo·duet·trio·quartet 편성은 대표 영상 하나를 공유하고, 이미 `videoId`가 저장된 곡은 다시 검색하지 않는다.
- public, embeddable, syndicated 가능, 한국 지역 비차단 영상만 저장한다. 제목 일치도, official/topic/VEVO/OST 단서와 조회수를 종합해 대표 영상을 선택한다.
- quota 초과나 반복 오류가 발생하면 우회하지 않고 중단한다.
- 저장 위치는 `data/youtube-matches.json`, 진행 상태는 `data/youtube-backfill-state.json`이다.

## 2026-09-06 예약 설정

- 매일 한국시간 오전 9시 KY 수집 후 YouTube 수집을 이어서 실행하도록 기존 heartbeat 자동화에 통합했다.
- 현재 로컬 실행 환경에는 `YOUTUBE_API_KEY`가 설정되어 있지 않다. 키가 없는 동안에는 API 요청을 보내지 않고 설정 필요 상태만 기록한다.
- 검색 DB 반영은 영상 수집과 분리하며, 검증된 동기화 경로를 사용할 때만 수행한다.

## 2026-09-07 실행

- API 키 설정 여부: 미설정.
- search call: 0/95, 신규 매칭: 0, no-match: 0.
- state: Pacific date 미설정, cursor 0, 누적 search call 0.
- YOUTUBE_API_KEY가 없어 외부 요청을 보내지 않았으며 quota는 사용하지 않았다.
- 영상 DB 및 검색 DB 반영은 수행하지 않았다.
