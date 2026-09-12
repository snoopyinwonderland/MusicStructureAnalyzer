# Motif / Phrase Structure Overlay v1.5

## Outcome

The score toolbar now calls the feature `구조 분석`, not `Phrase 분석`. Phrase spans remain solid colored bands with start/end caps in the upper lane. Close repeated-Motif occurrences are displayed independently in a lower lane as thin purple bracket-shaped dashed lines labelled `Motif <n>`.

Phrase and Motif use independent counters. `Phrase 1` and `Motif 1` may therefore coexist, and no shared sequence or family/occurrence notation such as `M1.2` is used. Motif candidates are sorted by score position and numbered `Motif 1`, `Motif 2`, ... for review readability.

## General aggregation rule

An exact bounded Motif recurrence is considered a local repetition group when its attack distance is no more than twice the Motif length. Its start remains a Motif boundary and an internal subphrase articulation, but contributes no Phrase-boundary strength. The corresponding formerly short Phrase boundary is demoted unless independent Phrase-level closure evidence later restores it. Distant recurrence is retained as a relation but is not automatically grouped or merged because it may begin a new Phrase or section.

The matched signature establishes that two nearby starts are related, but it can be shorter than the complete repeated cell. The displayed occurrence therefore uses the recurrence cycle: the first start runs to the next related start (exclusive), and the second uses the same global-quarter duration. Each endpoint snaps to the last attack before that exclusive time. It does not infer Motif closure from a cadence or reuse a Phrase endpoint. These are provisional Motif candidates; Canonical IR attack IDs and saved user-reviewed cases are required before treating their boundaries as stable musical annotations.

This rule uses relative attack counts and the detected Motif signature. It contains no work ID, title, measure number, absolute pitch, or expected Phrase number.

## Tie and sustained-note policy

An explicit tie continuation remains a hard non-attack and cannot start a Phrase. The current indexed score stream can sometimes expose only the merged sounding duration rather than the source tie chain; shifting a boundary from such a merged sustain to the following beamed attack is deferred until Canonical IR tie-chain and attack IDs are connected. This avoids guessing from one score's duration pattern.

## Typography

Pitch spellings such as `F#4` and `Ab4`, and Roman-numeral harmony values, use the bundled Campania font in analysis details. The literal value `unknown` (case-insensitive, surrounding whitespace ignored) always uses the ordinary UI font, because Campania's music-analysis substitutions alter the letter `o`. Labels, prose, arrows, key names, and controls also retain the ordinary UI font.

## Reopening performance

Navigating an existing score tab to another work now clears the previous Work state and its large Verovio SVG tree immediately, resets browse-mode scroll to the top, and aborts an obsolete in-flight work request. This targets retained DOM/render state rather than HTTP cache. A new tab was faster because it did not inherit the previous score's rendered pages and deep scroll position.

## Validation

- Close Motif recurrence becomes a non-primary `subphrase-cell` boundary.
- Motif relations carry stable-in-run signature keys and source note indices for the overlay.
- Motif display numbers are sequential by score position and independent of Phrase numbers.
- Phrase and Motif occupy visibly separate vertical lanes and use different line weight/style.
- Distant recurrence is not shown as a local Motif group.
- Campania selection tests cover `F#4`, `Ab4`, `V7`, and case-insensitive `unknown`.
- Existing Phrase selection, boundary harmony, tie, alignment, and score-rendering tests remain regression coverage.
