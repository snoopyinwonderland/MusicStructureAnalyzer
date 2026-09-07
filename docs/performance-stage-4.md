# Search performance stage 4: adaptive interval postings

## Problem

The high-recall Motif 100 configuration read as many as 250,000 rows for every interval 3-gram. It improved Top100 recall from 86 to 98, but increased median latency from 9.93s to 22.79s and p90 from 32.68s to 46.16s.

Simply capping every interval 3-gram at 16,000 rows was faster, but regressed `Q-M100-081`. Its changed pitch invalidated the rare middle grams. The surviving evidence was at query positions 0, 1, and 6; the first token alone had 379,706 postings and its expected occurrence appeared after the 16,000-row prefix. Rarity-only expansion therefore selected the mutated, non-matching grams.

## Implemented policy

For long, sufficiently discriminative melody queries:

- ordinary interval 3-grams: at most 16,000 rows;
- the rarest interval 3-gram in each query half: at most 50,000 rows;
- the first and last interval 3-grams: at most 100,000 rows;
- interval 5-grams keep the existing 18,000/6,000 limits;
- repeated-note/low-information queries keep the stricter existing path.

The edge expansion is deliberate: a single changed internal pitch destroys adjacent grams, while the beginning and ending evidence usually survives and can agree on one candidate start. It avoids restoring a 250,000-row scan for every gram.

## Verification

- The 16-case regression set retained 12/16 found and 12/16 Top5, equal to the full-posting configuration for those known recoverable cases.
- At the intermediate 50,000-edge setting, the set averaged 11.43s, but `Q-M100-004` was missed.
- With the final 100,000 edge cap, `Q-M100-004` returned at rank 1 in 9.19s and `Q-M100-081` at rank 1 in 12.73s.
- Search API tests: 57/57 passed.
- TypeScript and Vite production build passed.

The final full Motif 100 run was started and stopped after discovering individual 1–2 minute tail cases. It is intentionally left incomplete. A full rerun should follow the next candidate-evaluation optimization so the expensive suite is executed once against the combined changes. The preserved full-posting reference remains `evaluation/runs/motif-100-post-retrieval-2026-09-06.json` (Top1 88, Top100 98).

## Next bottleneck

Retrieval is no longer the only dominant cost. Some queries spend most of their time decoding and evaluating too many candidate works/windows. The next stage should profile the slowest saved cases, add a bounded SQL-side aligned-start aggregation or a two-stage cheap score, and only then run Motif 100 and Motif 200 in full.
