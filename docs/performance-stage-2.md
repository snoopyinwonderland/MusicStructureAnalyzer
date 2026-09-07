# Search performance: stage 2 — experimental seed windows

## Request and implementation (2026-09-04)

Replace expensive full-stream local alignment with merged neighborhoods of
retrieval seeds. Opt in with `MUSICANOTE_SEED_WINDOWS=1`; default remains the
existing full-stream fallback. Contour search is unchanged. Whole-stream
exact-match detection is retained. No per-title or per-query ranking rule added.

Select up to 12 distinct seed positions per stream, keeping one query-length
separation. Each window extends one query length before and two after its seed;
overlapping windows merge. If there are no usable seeds, retain full scan.
Existing narrow seed candidates remain. Excerpt indexes retain global offsets.

## Reproducible evaluation

Run `node scripts/benchmark-seed-windows.mjs` from the repository root.
It uses the separately stored Q-P1-002, Q-P1-003 and Q-P1-004 fixtures and writes
`evaluation/runs/performance-stage-2.json` with query-file hashes, timings,
work IDs, scores, ranking and measure ranges for both strategies.

These are sequential fresh-process measurements, not cold-filesystem tests.
Both paths use limit 100. A baseline result absent from the new top 100 may
have moved down in rank; it is not automatically a proven retrieval loss.
The comparison is not a relevance judgment or a production recall benchmark.

Initial measurements: Q-P1-002 47,586 → 8,176 ms; Q-P1-003 43,076 → 9,120 ms.
Q-P1-004 completed in 55,865 → 10,003 ms (six results in both paths).
Timing variance from the earlier stage-1 run is substantial; these values
must not be presented as stable server latency or percentile measurements.
The former changes three work/range identities (two work IDs absent from the
new top 100); the latter changes twenty. Therefore **do not enable by default**.

## Validation and next gate

- 92 tests across 12 files pass; TypeScript build passes.
- Keep the default path until changed results are assessed using judged cases,
  uncapped/scoped comparison, and wider/diverse seed recovery where needed.
- Windowing also changes alignment boundary context, not just CPU work;
  meter/phrase-context parity and retrieval bonuses need explicit comparison.
- Next safe production optimization: stage timings and worker isolation;
  do not sacrifice search recall merely to report faster latency.
