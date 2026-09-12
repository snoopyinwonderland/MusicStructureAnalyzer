# Motif / Phrase Structure Overlay v1.6

## Outcome

This revision separates Motif occurrences from Phrase spans both visually and semantically, groups transformed recurrences into Motif families, and removes inconsistent Phrase splits inside parallel recurrences. Clicking a Motif label or bracket selects that occurrence and opens its own detail panel. Phrase and Motif numbers remain independent.

The implementation contains no score title, work ID, fixed measure number, or absolute-pitch exception. The A Whole New World review is stored as replayable case `S-STRUCT-001`, with measures 3–33 of MusicXML context, selected-stream events, full-score chord events, and the user's musical explanation.

## Motif family and prime notation

Motif comparison uses transposition-invariant melodic intervals, contour, normalized durations, and length coverage. Occurrences above the provisional family threshold share a family number. A materially changed ending creates a prime variant such as `Motif 1′`; an effectively identical recurrence reuses `Motif 1`. These scores are uncalibrated evidence, not final identity labels.

The UI shows Motif brackets in a separate lower lane. Each occurrence has a sequential internal occurrence number for selection, while the visible family label may recur. Phrase counters and Motif family counters never share one sequence.

## Phrase aggregation from parallel recurrence

The former v1.5 rule demoted only a nearby recurrence. This caused an inconsistency when the same two-cell layout returned later: the first pair was one Phrase, but its parallel recurrence was split.

v1.6 adds a general continuity rule. If two Motif relations have the same source-to-recurrence displacement and preserve the same internal spacing, the second cell start in both layouts is retained as a Motif/subphrase articulation and demoted below Phrase level. This rule may be overridden later by independent strong Cadence or closure evidence. Repetition alone neither proves Phrase closure nor forbids it.

## Tie carryover and re-articulated attack

An explicit tie continuation cannot begin a Phrase. When a proposed boundary lands on a sounding event tied across a barline, and the same pitch is newly attacked exactly at that sounding event's release, v1.6 moves the Phrase-start evidence to the new attack. The tied notation remains preserved; only the selected structural boundary changes.

## Boundary harmony input and Phrase 1 correction

The prior harmony adapter used monophonic search-index streams. Those streams intentionally omit MusicXML `<chord>` members, so an incomplete late sonority could replace the actual harmony governing a tied terminal note.

Boundary harmony v0.2 now receives a deterministic full-MusicXML event extraction that preserves every notated chord member, staff/voice stream, and tie segment. For a terminal melody note tied into the following measure, the complete vertical sonority at the tie-continuation onset is evaluated before later surface sonorities.

In `S-STRUCT-001`, the terminal A3 continues into measure 12. At that continuation onset the full vertical sonority is D3–F#3–A3. In D major this is `I`, so Phrase 1 now reports `IV → I | I`, arrival `I`, with selection provenance `tie-continuation-onset`. This is a reusable tie-and-verticality rule, not a score-specific override.

## Typography

Campania is applied only to Roman-numeral harmony values. Start pitch, end pitch, `unknown`, labels, prose, arrows, key names, and controls use the ordinary UI font. This prevents Campania's analysis glyph substitutions from altering normal text.

## Verification

- 57 targeted tests pass across phrase boundaries, boundary harmony, MusicXML chord/tie extraction, Motif families, and score overlay behavior.
- TypeScript checking and the production build pass.
- Live work `work-40153ba016a3ef1f` reports Phrase 1 arrival `I`, tie continuation onset 44, and observed pitch classes 2/6/9.
- `S-STRUCT-001` stores 102 selected-stream events plus complete MusicXML/harmony context for measures 3–33.

## Deferred

- Cadence evidence may override recurrence continuity only after the cadence analyzer is better calibrated.
- Phrase-family labels such as `Phrase 1′` remain deferred; Phrase display labels stay sequential to avoid implying a validated formal identity.
- Stable Motif-family and occurrence IDs will reference Canonical IR attack/sounding IDs when that adapter replaces the transitional MusicXML extractor.
