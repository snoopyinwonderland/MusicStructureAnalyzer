# Motif / Phrase Layer Separation v1.4

## Decision

Motif and Phrase are different structural levels. A Motif is a short recurring or transformable musical idea; a Phrase is a larger span with a beginning, continuation, and closure. One Phrase may contain one Motif, several Motifs, repeated occurrences of one Motif, or material that receives no Motif label.

The processing hierarchy is:

`Canonical attacks → Motif occurrences → Motif groups → Phrase hypotheses → Section/Form`

Motif boundaries therefore do not become Phrase boundaries by themselves.

## v1.3 failure mode

The v1.3 detector correctly kept repeated cells as subphrase evidence, but it still added Phrase-boundary strength at a repeated Motif start and promoted the beginning of a repeated-figure run with a fixed `0.72` contribution. This mixed Motif segmentation with Phrase segmentation and could create short standalone Phrases around repeated figures.

## v1.4 rule

- `repeated-motif-start` is retained as a Motif-layer cue with `contributesToPhraseStrength=false`.
- `repeated-figure-run-start` is retained as a Motif-layer cue and no longer adds a fixed Phrase-boundary score.
- A run start may coincide with a Phrase boundary only when independent Phrase evidence already passes the normal threshold.
- Repeated cells inside a larger group remain available as `subphrase-cell` structure; they are not deleted.
- Phrase closure remains the responsibility of breathing/rest, melodic and rhythmic closure, governing harmony/Cadence, and later human review.

The implementation contains no work ID, Phrase number, measure, title, or expected segmentation for a particular score.

## Data separation

Motif records should eventually carry their own IDs, occurrence spans, transformation relations, and group membership. Phrase records should reference their own spans and may cite Motif occurrence IDs as evidence without absorbing Motif labels into notes or Canonical Core. Competing groupings remain versioned Analysis records.

## Validation

- A repeated Motif start is recorded but contributes zero additional Phrase-boundary strength.
- A repeated-figure run start without independent closure evidence is not a primary Phrase boundary.
- Internal repeated-cell locations remain preserved as subphrase/Motif evidence.
- Existing rest, tie, continuity, alignment, boundary-harmony, and viewer selection tests remain regression coverage.

## Deferred UI

The current score uses a Phrase overlay and separate Motif cards. A later UI increment should provide independent `Phrase` and `Motif` layer toggles, use visually distinct shapes/colors, and allow selecting a Motif occurrence without changing the selected Phrase unless the user explicitly asks to navigate to its containing Phrase.
