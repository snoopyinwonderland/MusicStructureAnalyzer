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

Boundary Harmony continues to retain absolute surface-chord labels for evidence and debugging. The review UI now displays the selected-key-relative Roman progression from `harmonyProgression.romanDisplay`, falling back to the absolute display only for older payloads. Roman labels use the CSS family `Campania`, with `Times New Roman` and `serif` as explicit fallbacks when Campania is not installed on the client.

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

- Campania is referenced by family name; the repository contains no licensed Campania font asset. Clients without that font use the documented fallback.
- Cadence/form evidence is not yet fed back into the v1.3 boundary gate.
- A minimum Phrase duration is deliberately not hard-coded: short phrases can be musically valid, so this change removes a false cause rather than banning all short spans.
