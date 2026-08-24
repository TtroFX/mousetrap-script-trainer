# P5 Recovered Canonical Source

This directory is the durable, public-safe P5 source baseline. It intentionally excludes all copyrighted/private play and translation payloads.

## Required private inputs
Place the five files listed in `P5_PRIVATE_INPUTS_MANIFEST.json` beside `index.html` only in a private build/test environment. Verify SHA-256 before using them for a production PASS gate.

## Public CI
`Pre-P6 HTTP E2E` uses structurally exact synthetic data (1164 / 190 / 336 / 638, vocabulary 1186, grammar 692, dictionary 578) to verify real HTTP navigation, resource loading, routing, state, progress weighting, and fail-closed behavior without publishing copyrighted content.

The workflow definition is also present on the default branch so pull-request runs execute on GitHub-hosted Chromium rather than the locally policy-blocked browser.

A public-CI PASS is not by itself `PASS_PRE_P6`; the final strict gate still requires the five private production payloads to be materialized and hash-verified in a private unrestricted browser environment.
