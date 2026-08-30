# Translation semantic audit — 2026-08-31

## Scope

Fresh two-pass comparison of the current Japanese speech translations against the canonical English speech data.

- Canonical speeches checked: 1,164 / 1,164
- Pass 1: canonical speeches 1–582
  - Act I Scene 1: 190 speeches
  - Act I Scene 2: 336 speeches
  - Act II: speeches 1–56
- Pass 2: Act II speeches 57–638 (582 speeches)

## Correction threshold

Only meaning-changing translation errors were in scope:

- positive/negative polarity reversal
- wrong grammatical or semantic subject/object
- wrong person/referent/object
- materially wrong number, age, place, or sequence
- possibility/necessity/certainty reversal
- important omission/addition that changes the proposition

Stylistic differences, natural paraphrases, register, and minor wording differences were intentionally left unchanged.

## Result

No new translation entry met the correction threshold in either pass.

Therefore `mousetrap_line_translations.json` was intentionally left unchanged. No cosmetic rewrite was made.

Several suspicious-looking lines were rechecked against the English canonical data and retained because the current Japanese preserves the source proposition in context, including the Act I Scene 2 suspect-description passage and the Act II age/identity/reveal passages.

## Canonical inputs audited

- `mousetrap_script_data.json` Git blob: `03ce77ec781b82b3e925cdf7e39b5e9df741a880`
- `mousetrap_line_translations.json` Git blob: `0cec58aadea1341ac0b31d7426a8ee9538e66d00`

## Outcome

- New major semantic mistranslations found: **0**
- Translation entries changed: **0**
- Existing translation JSON preserved exactly
