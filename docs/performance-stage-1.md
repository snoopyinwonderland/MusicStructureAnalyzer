# Search performance: stage 1

## Implemented

- Parse each work note JSON once per search request; reuse its corpus-note array.
- Evaluate duplicate candidate keys only once.
- Parse and cache a compact meter timeline per source/part, with a 2048-part bound.
- No candidate limits, matching thresholds or full-stream fallback changed in this stage.

## Next stages

1. Persist meter/part/measure metadata in the index so cold requests do not need XML.
2. Profile retrieval, decoding, XML metadata, local alignment and result enrichment separately.
3. Replace full-stream alignment with merged seed windows only after Harness recall comparison.
4. Move search execution to a worker pool to keep score loading responsive.

The earlier repeated-note benchmark exceeded 90 seconds and was cancelled. A
new timing must be recorded before claiming an end-to-end speed improvement.

## Measured follow-up

Q-P1-004 completed in 86,541 ms with request caching/deduplication, then in
7,321 ms after adding the meter timeline. Both runs returned the same six
work IDs, ordering, measure ranges and numeric scores. Sequential execution
can benefit from OS filesystem caching; this is not a cold-cache comparison.
All 88 tests in 10 test files passed. See evaluation/runs/performance-stage-1.json.
