# Phrase review layer prototype

The full MusicXML score viewer is the shared review surface for MusicSearch and Music Analysis Harness.

## What is implemented

- `GET /api/work/:workId` includes the versioned `phraseAnalysis` payload.
- The current analyzer is `local-boundary-evidence-v1.2`. It preserves repeated-cell gaps as `subphrase-cell` evidence while using the larger repeated run for the default phrase bands.
- The `Phrase 분석` layer is on by default when the score page opens.
- The score displays complete, alternating-color `P1`, `P2`, ... ranges above the staves, including the analyzed stream's first and last notes.
- Each range uses a visible band with start/end caps, a final `끝` marker, and a label such as `Phrase 1 · 17–18마디 · F#5→F#5`.
- A phrase crossing systems is continued with one range segment on every affected system so both endpoints remain visible.
- A supported vertical marker is labelled by the phrase that starts there, for example `P2 시작`. The former `P1│P2` form incorrectly suggested that its anchor note belonged to both phrases.
- A boundary index means “immediately before this note.” Default phrase spans therefore follow `[start,end)` semantics: the preceding phrase ends at the previous note and the boundary note starts the following phrase. No note is shared unless a future explicit overlap hypothesis says so.
- A split-color shared-note anchor and `P1│P2`-style wording are reserved for a future explicit, versioned overlap hypothesis; neither is inferred from a normal boundary.
- Selecting a marker synchronizes the candidate shown in the right panel.
- The panel displays location, evidence strength, and evidence cues.
- The selector is phrase-first rather than coordinate-first: every option shows phrase number, measure range, starting pitch, ending pitch, and harmony availability. Raw measure/beat coordinates remain secondary evidence details.
- The current `boundary-harmony-cadence-v0.1` prototype analyzes only a bounded window around each supported phrase boundary. It displays preparation/arrival/post-boundary surface candidates and a PAC/IAC/HC/DC/plagal hypothesis when sufficient evidence exists.
- Incomplete sonorities remain explicit (`A(no3)`), stale arrivals are not reused, and insufficient evidence is displayed as `판정 보류`. Strength values are uncalibrated evidence scores, not probabilities.
- `POST /api/analysis/phrase-review` appends accept/reject/ambiguous reviews to `data/phrase-feedback/phrase-review.jsonl`. The UI labels the ambiguous verdict `판단 보류 / Can't Judge`.
- Review records remain `trainingEligible=false` until a separate adjudication/export process approves them.

## Repetition hierarchy in v1.2

- `repeatedFigureRuns` groups consecutive 3–8 attack cells when normalized duration/IOI shape and contour repeat across independently observed gaps.
- `rhythmicGestureGroups` handles two related pickup gestures with a common short-short-long prefix when a much larger following rest supplies the outer closure.
- Internal gaps keep `rawStrength`, receive `primaryLevel=subphrase-cell` and `suppressedBy`, and remain available for review. They are not deleted.
- The run start/end receive explicit cues and form the primary display span. Every such group remains `requiresCadenceReview=true`; the current rule does not claim that repetition alone proves phrase structure.
- The reference case and measured before/after output are recorded in `docs/phrase-boundary-v1.2-repetition-hierarchy.md`.

This prototype uses note-array boundary indices as transitional targets. It must adopt Canonical IR stable note/attack IDs and rational time before the records are treated as durable annotation. Harmony and cadence evidence are intentionally reported as unavailable rather than inferred from a key signature or displayed as certainty.

The cross-project contract is maintained in `K:\Music Analysis\MUSICANOTE_Canonical_Music_IR\PHRASE_REVIEW_VIEWER_CONTRACT_v0.1.md`.
