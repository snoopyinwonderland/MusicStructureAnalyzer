# Phrase Boundary v1.3 — Run-end Gate and Review UI

## Decision

`local-boundary-evidence-v1.3` no longer promotes the end of a repeated-figure run to a primary Phrase boundary solely because the run ended. A run end remains structural evidence, but it becomes a primary boundary only when the same point already has independent closure evidence strong enough to meet the normal boundary threshold.

This is an Analysis Layer rule. It does not change MusicXML, indexed notes, Canonical Core, or deterministic evidence.

## Failure and general rule

The v1.2 run detector added `repeated-figure-run-end=0.68` unconditionally. That made a point cross the `0.65` boundary threshold even when the event stream supplied `observed-continuity=0.85`. A short tail after that artificial boundary then appeared as a standalone Phrase.

The v1.3 gate is:

1. Preserve `repeated-figure-run-end` as evidence.
2. Add `requiresIndependentClosureCue=true`.
3. Set `promotedToPhraseBoundary=true` only when the pre-existing boundary strength is at least `0.65` and continuity is below `0.75`.
4. Do not add run-end strength by itself.
5. Preserve cadence/form/human layers as later, competing reasons to restore a boundary.

There are no work IDs, Phrase numbers, measure numbers, absolute pitches, or titles in the implementation rule.

## Reviewed score result

The review case `work-25517ce2d093550b` had short displayed Phrases beginning at note indices 153, 192, and 217. All three points had the same evidence pattern: `observed-continuity=0.85` plus an unconditional v1.2 run-end boost. Under v1.3 all three remain non-boundary structural points and join an adjacent primary span. The score changes from 16 to 11 displayed primary spans; this count is an output of the general gate, not a target encoded in the rule.

## Harmony display

Boundary Harmony continues to retain absolute surface-chord labels for evidence and debugging. The compact expression `preparation → arrival | after-boundary` described a local boundary window, not the harmony from the start to the end of a Phrase. Because that notation was easy to misread, the review panel now separates it into `경계 직전 진행`, `종결 화음`, and `다음 Phrase 시작`. The native Phrase selector shows the measure/pitch range and Cadence only; mixed-font Roman values are shown in the structured detail panel.

The Analysis record exposes `preparationRoman`, `arrivalRoman`, and `afterBoundaryRoman` in addition to the backward-compatible `romanDisplay`. Existing Roman hypotheses, including `II7`, are not rewritten by the display change; uncertainty remains available through the provisional analysis status, observed pitch classes, fit, and cadence hypotheses.

Only elements with the `harmony-roman` class use the bundled Campania WOFF webfont. Korean labels, prose, arrows, key names, pitch names, controls, and all other UI text retain the application's normal fonts. The internal family name `Campania Harmony` prevents an unrelated locally installed font from silently satisfying the CSS family lookup.

The unmodified font is sourced from `https://github.com/MarcSabatella/Campania`. Its copyright and complete SIL Open Font License 1.1 text are retained at `src/assets/fonts/Campania.LICENSE.txt` beside `Campania.woff`.

Roman numerals remain provisional analysis hypotheses because the current selected key is inferred only from key-signature-relative major/minor candidates.

## Phrase color linkage

Each `P<n> 시작` marker now uses the same palette index as Phrase `n`'s range band. Selection adds a halo/brightness state without replacing the Phrase identity color.

## Validation

- Four focused test files: 46/46 passed.
- TypeScript and Vite production build passed.
- The reviewed score was recomputed directly with v1.3: indices 153, 192, and 217 are unsupported and retain `observed-continuity` plus `repeated-figure-run-end` evidence.
- Harmony regression verifies `V → I | vi` Roman output in a C-major fixture.
- UI regression verifies that Phrase 1/5 and Phrase 2 start markers resolve to the same palette slots as their bands.

## Deferred

- Cadence/form evidence is not yet fed back into the v1.3 boundary gate.
- A minimum Phrase duration is deliberately not hard-coded: short phrases can be musically valid, so this change removes a false cause rather than banning all short spans.

## Human-reviewed Phrase 2 harmony case

For `work-25517ce2d093550b`, the musician review identifies Phrase 2's terminal harmony as V and its closure as a Half Cadence. Boundary Harmony v0.1 read a 0.5-quarter sparse surface slice containing pitch classes A and B as `B7`, then emitted `II7` and no selected cadence. The `II7` output is retained as the analyzer's current provisional hypothesis. The differing musician interpretation is a reproducible review case, not a work-specific override or an immediate replacement label.

The general correction path is:

1. preserve the observed A+B slice and its source events;
2. lower or withhold chord identity when defining chord tones are absent;
3. distinguish non-chord/suspending/neighbor tones from governing harmony across a wider but bounded cadence window;
4. model harmonic prolongation and bass/metrical evidence before selecting the terminal function;
5. test the sequence-level cadence grammar for dominant arrival and non-tonic continuation;
6. compare the AI hypothesis with a separately stored human correction and only promote it to training data after review.

No Phrase number, work ID, absolute pitch, or expected V label may appear in the production inference rule.
