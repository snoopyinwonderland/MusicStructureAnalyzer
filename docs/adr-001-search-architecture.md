# ADR-001: 설명 가능한 2단계 선율 검색

상태: Accepted for lab

## 결정

1. 음표 철자보다 MIDI semitone과 상대 음정을 검색의 일차 표현으로 사용한다.
2. exact 단계는 rest를 제외한 interval 배열과, rhythm mode에서 정규화 duration을 비교한다. 시작점은 downbeat로 제한한다.
3. 후보 단계는 interval/5-class contour q-gram overlap을 사용한다. 운영에서는 동일 contract를 SQL inverted table 또는 Elasticsearch keyword array로 교체할 수 있다.
4. 최종 단계는 application layer weighted subsequence DTW를 사용한다. passing/neighbor 후보의 insertion 비용은 chord/structural tone보다 낮다.
5. structural salience는 metric strength, duration, harmonic support, phrase/cadence evidence의 연속 값이다. confidence가 낮으면 영향이 자동으로 줄며 deep Ursatz 일치에는 별도 보너스를 주지 않는다.
6. 최종 표시에서 local similarity, occurrence importance, analysis confidence를 합치지 않고 각각 공개한다.

## 이론적 근거

Schenkerian 관점에서 foreground의 장식과 middleground의 voice-leading skeleton은 동일하지 않다. 따라서 passing/neighbor 음의 삽입·삭제 비용을 낮추되 foreground 고유 interval/rhythm은 보존한다. 박자상 강한 위치, 긴 지속, 화성 지지를 구조적 중요도의 관찰 가능한 proxy로 사용한다. 이는 Schenker 분석 자체를 자동 판정한다는 주장이 아니다.

Verovio 공식 문서는 Vite/React 같은 bundler에서 WASM/ESM 모듈 사용을 권장하고, `renderToSVG`, `renderToMIDI`, `renderToTimemap`을 제공한다. 본 lab은 SVG에는 Verovio를 사용하고 즉각적 입력 재생에는 QueryEvent 기반 Web Audio를 사용한다.

## 결과와 제한

- 장점: 결과별 alignment와 점수 구성 요소를 설명할 수 있고 retrieval backend를 교체하기 쉽다.
- 제한: synthetic corpus의 structural metadata는 fixture이며 자동 화성/프레이즈 분석기가 아니다.
- 운영 이행: source/stream/version schema, resumable indexing, gold set calibration, SQL/ES candidate recall 검증이 선행되어야 한다.
