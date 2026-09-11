# Phrase Boundary v1.2 — Repetition Hierarchy

## Decision

`local-boundary-evidence-v1.2` treats a rest between repeated or sequential cells as a possible subphrase articulation, not automatically as a full phrase boundary. The default viewer segmentation uses the outer repeated-run span while retaining internal cells and their original evidence.

This is an Analysis Layer rule. It does not alter MusicXML, indexed notes, Canonical Core, or deterministic evidence.

## Trigger case

- Work: `work-25517ce2d093550b`
- Source: `Somewhere in My Memory (From Home Alone)`; analyzed stream `P1:1:1`
- Human review: phrase 1 was acceptable; the preceding phrase should include the first B3 in measure 15; the repeated figure beginning at the second note of measure 15 should not be split at every later rest. The analogous later repetition should follow the same logic.
- Machine coordinate: the second note is index 29, measure 15 beat 2, written pitch C#5. The visible note name may be read as C under the three-sharp key signature; user-facing octave naming and stable engraving identity remain a mapping issue.

## Failure mechanism in v1

The local detector correctly observed gaps but saturated their strength independently. It had no representation for a larger repeated run, so indices 33, 37, 41 and 106, 110, 114 all became primary boundaries. `repeated-motif-start` could add evidence but could not express continuation or suppress an internal division.

## v1.2 rules

### Repeated figure run

1. Collect independently observed gap candidates with strength at least 0.65.
2. Compare consecutive cells of 3–8 attacks.
3. Normalize duration and IOI by the cell's local median duration.
4. Score cell similarity as 45% duration shape, 35% IOI shape, and 20% contour direction.
5. Require the first adjacent comparison to be at least 0.82 and the next at least 0.72.
6. Merge overlapping runs of the same attack length.
7. Add `repeated-figure-run-start` (0.72) and `repeated-figure-run-end` (0.68).
8. Preserve internal gap strength in `rawStrength`, set effective strength at most 0.49, continuity at least 0.90, and `primaryLevel=subphrase-cell`.

Repetition does not prove that an internal boundary is wrong. Every run carries `requiresCadenceReview=true` so a later cadence/form/human layer can restore or compete with the primary segmentation.

### Rhythmic gesture chain

This narrower rule handles two cells that are related in rhythm but not by exact melodic contour.

1. Use three consecutive observed gaps: outer start, internal breath, outer end.
2. Each intervening gesture contains 3–8 attacks.
3. Their first three durations, normalized by the first duration, must match within 12%.
4. The prefix must be genuinely pickup-like: its first two values are no more than 60% of the third.
5. The following outer gap must be at least 2 quarter notes and 2.5 times the internal gap.
6. Only the middle point is demoted, with continuity 0.82; the outer observed boundaries remain.

This is the rule that changes the formerly separate viewer regions around measures 25–27 into the current Phrase 5. It is not keyed to Phrase 5: the implementation contains no work ID, title, measure number, absolute onset, or absolute pitch. The phrase number is assigned later by the generic span builder from the ordered supported boundaries.

Two explicit counterexamples guard the scope:

- Matching pickup prefixes do not merge when the following gap is not substantially larger than the internal gap.
- A large following gap does not merge gestures whose normalized rhythm prefixes differ.

## Actual output change

| Region | Before | v1.2 primary segmentation | Preserved internal cells |
|---|---|---|---|
| m15–18 | starts at m16 b2, m17 b2, m18 b2 | start m15 b2 (index 29), end m19 b1 (index 45) | 33, 37, 41 |
| m25–27 | split again at m26 b2 | start m25 b2 (65), next primary start m28 b1 (74) | 70 |
| m36–39 | starts at m36/m37/m38/m39 b2 | start m36 b2 (102), end m40 b1 (118) | 106, 110, 114 |

Five repeated runs and one rhythmic gesture group were found in the complete work. Later runs at indices 138–153, 177–192, and 202–217 are exposed for review rather than claimed as gold structure.

The viewer span builder was also corrected to honor the analyzer's “boundary immediately before note `i`” contract. Phrase 2 now ends on measure 15 beat 1 B3 (index 28), and Phrase 3 starts on measure 15 beat 2 C#5 (index 29). The boundary note is no longer silently counted in both phrases.

Displayed measure ranges follow the full boundary time span, not only the measures containing attacks in the selected melody stream. Thus a phrase whose last sounding melody note is in measure 4 but whose next boundary is measure 11 beat 1 is displayed as measures 1–10; the endpoint pitch still reports the last included note.

## API additions

- analysis version: `local-boundary-evidence-v1.2`
- top level: `repeatedFigureRuns[]`, `rhythmicGestureGroups[]`
- boundary fields when applicable: `rawStrength`, `primaryLevel`, `suppressedBy`
- new cues: `repeated-figure-continuation`, `repeated-figure-run-start`, `repeated-figure-run-end`, `rhythmic-gesture-continuation`

## Validation

- `server/phrase-boundaries.test.js`, `src/components/FullScorePage.test.ts`, and `src/components/FullXmlNotation.test.ts` cover the hierarchy, its negative cases, `[start,end)` spans, and boundary-label semantics: 39/39 passed.
- `pnpm run build`: TypeScript and Vite production build passed.
- Running API after server restart returned version v1.2, five repeated runs, one gesture group, and the primary boundaries shown above.
- Chrome visual verification confirmed `Phrase 1 · 1–10마디 · E5→B4`, `Phrase 2 · 11–15마디 · E4→B3`, and `Phrase 3 · 15–18마디 · C#5→B5`, with no shared endpoint note.
- The full repository test run had one pre-existing unrelated failure: `q-p1-007-sparse-downbeat-ranking.json` lacks required `createdAt`; 203/204 tests passed.

### Generalization scope audit

A deterministic 500-work sample from the current local corpus contained 105,306 analyzed attacks. The repeated-figure rule triggered for 100 works and produced 239 groups. The narrower rhythmic-gesture rule used for the Phrase 5 case triggered for 12 works and produced 17 groups, or 2.4% of sampled works.

This audit answers only whether the rule is reusable and reasonably selective. It is not an accuracy estimate because these detections have not yet been independently labeled. Each group remains `requiresCadenceReview=true`; held-out human review and cadence comparison are required before threshold calibration.

## Deferred work and risks

- Cadence and harmony are not yet allowed to override the merge. The next version should compare outer and internal cadence hypotheses and retain competing segmentations.
- Exact thresholds are uncalibrated and must be evaluated on instrumental works, not tuned only to this score.
- Transposition, augmentation/diminution, sequence variation, polyphonic voice exchange, fermata/breath marks, and formal repeats need separate fixtures.
- The UI currently hides demoted cells from the primary band. An optional lighter subphrase-cell overlay and a direct “move/insert boundary” review action are still needed.
- Transitional note-array indices must migrate to Canonical IR attack IDs and rational time before feedback becomes durable annotation.
