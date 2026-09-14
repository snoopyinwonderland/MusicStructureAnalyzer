# Motif / Phrase Structure Overlay v1.9

## Reviewed case

`S-STRUCT-003` captures the complete 1–66 measure source and 172 melody events for *Endless Love*. The review identified two distinct errors: local gap evidence produced one-to-three-attack Phrase fragments, and an exact recurring Motif core did not carry its variable preparation and following answer into a common Phrase frame.

## Implemented rules

### Minimum Motif size

The review overlay does not display a Motif with fewer than four attacks. This is a presentation and hypothesis-admission constraint, not a claim that every four-note sequence is a Motif.

### Short Phrase fragment continuity

For work-level analyses with at least twelve attacks, a supported boundary that would close a Phrase of fewer than four attacks is demoted to `subphrase-cell`. Its original strength remains in `rawStrength`, and the evidence record receives `short-phrase-fragment-continuation`. Short query excerpts are excluded because local retrieval comparisons still need their original boundary evidence.

Exactly four attacks remain reviewable. This preserves the ambiguous repeated-A passage in measures 30–32 rather than forcing either a standalone Phrase or attachment to the previous Phrase.

### Recurring prepared-Motif Phrase frame

An exact transposition-invariant Motif signature must occur at least three times. Around each occurrence, the analyzer requires:

- a one-to-four-attack preparation after the preceding active boundary;
- a four-to-ten-attack core subunit;
- a following four-to-ten-attack answer subunit.

When all conditions hold, the core-entry boundary and core/answer internal boundary are demoted while the enclosing boundaries remain Phrase candidates. The rule uses attack indexes, normalized interval/rhythm signature, and local boundary evidence. It does not use score title, work ID, measure number, or fixed pitch.

For the reviewed score, supported boundary indexes become:

`15, 32, 44, 50, 62, 71, 75, 90, 108, 120, 154, 167`

Consequently, measures 3–7, 8–13, 14–19, 22–26, 33–37, and 38–43 form the requested Phrase groups. The same recurring-frame rule, rather than score-specific exceptions, repairs both the first statement and later repetitions.

## Canonical limitation

The source MusicXML contains explicit `<beam>` membership, but the current search event cache does not preserve it. v1.9 therefore uses attack duration and recurrence only; it does not claim observed beaming as Canonical evidence. Beam group IDs, level, begin/continue/end, and tie-aware attack membership are deferred Canonical IR fields.

## Override policy

All changes are uncalibrated Analysis Layer hypotheses. A validated Cadence or human boundary correction must override minimum-span and recurring-frame priors. The original boundary cues and strengths remain traceable.

## Follow-up diagnosis: Motif completeness

The displayed first Motif currently ends on the sixteenth-note C#5 in measure 5 because the matcher selected the longest **exact** six-attack signature shared by event indexes 2–7 and 19–24. The following D5 arrival lasts two beats in the first statement and three beats in the recurrence, so exact normalized-duration matching rejects it. No cadence, harmonic closure, beam membership, or long-arrival extension rule participates in that endpoint. This explains the result but does not justify it musically: the preferred reading extends through the D5 arrival.

The repeated B/C# figure in measures 6–7 and the short E–D–C# descent at the next Phrase opening expose a second distinction. They have weak cross-work search distinctiveness but can still have a clear work-internal Motif role. The current signature filter conflates these two questions and therefore misses both kinds of structural evidence.

The apparent `Motif 2` / `Motif 2-prime` family is also over-compressed. All `four-short-plus-long-arrival` cells receive the same family key before pitch contour and phrase role are considered. Consequently the UI presents a small number of inconsistent families even though the work contains more Motif functions.

Phrase segmentation is more stable because it has independent gap, IOI, tie, minimum-span, and repeated-frame evidence. It is not complete: the Phrase 3/4 split is a gap-supported alternate without Cadence support, and the Phrase 6/7 split overweights a local gap while missing repeated-A tonic-prolongation continuity.

### Proposed next rules

- extend exact recurring cores to corresponding long arrivals before displaying Motif bounds;
- preserve repeated-note and short scalar cells as internal-role candidates even when they are poor search queries;
- cluster Motif families by rhythm, contour, interval, extent, and arrival role rather than rhythm-family key alone;
- calibrate gap-only Phrase boundaries against Cadence absence, same-pitch continuation, and tonic-return evidence.
