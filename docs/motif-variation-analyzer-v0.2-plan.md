# Motif Variation Analyzer v0.2 Implementation Plan

The normative design is `MUSICANOTE_Canonical_Music_IR/MOTIF_VARIATION_AND_EXTENT_SPEC_v0.1.md` in MusicAnalysisHarness. This document maps it to the current MusicStructureAnalyzer prototype.

## Current findings

- MusicAnalysisHarness already parses MusicXML `<beam>` values into `notation.beams`.
- MusicSearch `CorpusNote` and its index cache do not preserve normalized beam groups.
- `addMotifSupport` discovers candidates from exact fixed-length signatures and rejects low interval-diversity cells.
- `buildMotifSpans` now uses recurring Phrase-frame internals to complete anchored cores and recover answer units.
- Motif-family grouping still needs a general approximate candidate-discovery stage and calibrated multi-channel clustering.

## Delivery stages

### Stage A — beam transport

Define and validate beam objects in Canonical JSON Schema, normalize stable beam group IDs, add optional beam fields to search events, and add MusicXML-to-search regression fixtures. No Motif decision changes in this stage.

### Stage B — evidence vectors

Generate interval, contour, log duration/IOI, metric, beam position, pitch entropy, rhythmic entropy, long-arrival ratio, and gap/tie evidence. Persist raw channels so weights can change without reparsing.

Status 2026-09-15: interval, contour, step/leap shape, normalized duration/IOI, optional metric strength, coverage, alignment, and transformation tags are implemented in `src/music/motifSimilarity.ts`. Beam, entropy, long-arrival, and persisted evidence remain open.

Correction 2026-09-15: a detected rhythm-family name is proposal evidence only. It no longer forces all such cells into one Motif family. Automatic family reuse requires combined similarity >= 0.84 and coverage >= 0.70; the 0.72–0.84 ambiguity band still needs persisted competing hypotheses.

### Stage C — multi-channel proposals

Keep exact anchors, add approximate melodic alignment, repeated-note rhythm proposals, short correspondence fragments, and Phrase-parallel units. Record the proposal channel and do not discard low-retrieval candidates.

### Stage D — extent decoding

Represent `core_span`, `occurrence_span`, and optional `arrival_span`. Score the next zero-to-three attacks as possible extensions. Phrase internals are evidence, not compulsory endpoints.

### Stage E — family and variant hypotheses

Cluster with interval, contour, rhythm, metric/beam, coverage, arrival, and Phrase-position channels. Retain competing families inside the ambiguity margin and attach explicit transformation tags.

### Stage F — dual scoring and UI

Display work-internal role separately from cross-work retrieval distinctiveness. The review panel shows why a core was proposed, why the extent was extended, why a family/variant was selected, and what evidence argues against it.

## First acceptance cases

1. ENDLESS LOVE core ending C#5 extends through the following D5 arrival despite two- versus three-beat variation.
2. Its 6–7 measure repeated-note rhythm remains a work-local Motif candidate but is marked weak for cross-work retrieval.
3. The short E–D–C# correspondence remains a fragment linked to parallel Phrase position.
4. A beam group with no recurrence or structural role is not promoted to Motif.
5. A changed-pitch or ornamented occurrence can enter the same family without any complete exact signature.

## Non-goals for the first implementation

- training a supervised model before sufficient reviewed cases exist;
- treating every beam group as a Motif;
- forcing one family label when alternatives are close;
- using one score for both structural analysis and copyright/search ranking.
