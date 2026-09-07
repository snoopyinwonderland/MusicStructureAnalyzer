# Search performance: stage 3 — profiling and persistent meter context

## 2026-09-05 result

Search profiling now separates retrieval, note JSON decoding, exact scans,
local alignment, window preparation, scoring, meter lookup, occurrence scans,
and result enrichment. It is enabled only by `MUSICANOTE_PROFILE_SEARCH=1`.

Q-P1-004 showed that local alignment was not the dominant cost. In a warmed
filesystem run, baseline total was 6,571 ms: retrieval 613 ms, decoding 590 ms,
alignment 498 ms, and MusicXML meter lookup 4,147 ms. The prior 89-second run
was strongly affected by cold filesystem state and must not be treated as a
stable latency figure.

An exact meter-timeline cache is now stored in
`data/search-index-v2/meter-context.sqlite`. The cache key is source plus part.
It stores the parsed MusicXML timeline, not an inferred 4/4 default. Its table
is invalidated automatically when the active search DB modification time
changes. New timelines are committed once at the end of a search.

Fresh-process Q-P1-004 measurement around initial population and reuse:

| Run | Total | Meter lookup | Meter persistence |
| --- | ---: | ---: | ---: |
| Initial population | 7,124 ms | 4,265 ms | 93 ms |
| Reuse after process restart | 2,322 ms | 83 ms | 0 ms |

The returned result count remained six. This optimization does not alter
candidate limits, alignment, score weights, admission thresholds or ranking.
The next measured bottleneck is n-gram retrieval (roughly 0.6–3.3 seconds in
these runs). A covering index or retrieval redesign must be storage-tested
because K: currently has only about 15 GB free and the active DB is 28.4 GB.

Validation: 94 tests in 13 files and TypeScript build passed.
