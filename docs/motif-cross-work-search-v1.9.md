# Motif Cross-Work Search v1.9

## Purpose

The main-Motif search in the score analysis panel must retrieve evidence from other compositions. Repeated occurrences in the current score and alternate files or arrangements of the same title are useful for within-work Motif analysis, but they are not cross-work search results.

## Search exclusion contract

The Motif card sends two optional query constraints:

- `excludeWorkIds`: contains the score currently open in the viewer.
- `excludeTitle`: contains its displayed title.

The search server removes an excluded work before candidate diversification. After candidate metadata is loaded, it also compares the existing normalized title used for edition/arrangement grouping. A candidate whose normalized title equals the query's normalized excluded title is skipped before alignment and ranking.

This means that different files, parts, karaoke editions, and labels such as `Piano Solo` or `Melody` cannot fill the result list when they represent the same normalized song title. The ordinary global search is unchanged when these fields are absent.

## Estimated duration UI

Each Motif card displays `예상 검색 시간 · 약 N초` immediately above its search button. The initial fallback uses the Motif note count and the same note-count bucket as the main melody search. After a search completes, the estimate is updated from 65 percent of the prior estimate and 35 percent of the observed duration and is stored locally for later searches. During execution, the label becomes a remaining-time estimate and finally `검색 결과 정리 중…` after the estimate is exhausted.

The duration is an operational estimate, not a completion guarantee. Corpus size, disk cache state, candidate density, and concurrent indexing work can change actual time.

## Validation

- Unit coverage verifies fallback, learned, and bounded estimates.
- Search integration coverage verifies that neither the current work ID nor any normalized same-title edition appears in results.
- Production build verifies the score viewer bundle.

