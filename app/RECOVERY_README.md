# P5 Recovered Canonical Source

This directory is the durable, public-safe P5 source baseline. It intentionally excludes all copyrighted/private play and translation payloads.

## Required private inputs
Place the five files listed in `P5_PRIVATE_INPUTS_MANIFEST.json` beside `index.html` only in a private build/test environment. Verify SHA-256 before using them for a production PASS gate.

## Real HTTP validation status
The recovered source has now passed the real-Chromium / real-HTTP structural regression suite: **17 PASS / 0 FAIL**, with uncaught page errors 0 and request failures 0. See `PRE_P6_REAL_HTTP_EXECUTION_REPORT.md`.

This validates URL navigation, HTTP resource loading, iframe routing, exact Cue handoff/landing, localStorage restore, History, Rehearsal -> Progress, progress weighting, fail-closed behavior, TTS, and SpeechRecognition capability using structurally exact public-safe fixture data.

## Strict production gate
A structural browser PASS is not by itself `PASS_PRE_P6`. The final strict gate still requires the four private production learning payloads to be materialized, SHA-256 verified, and used in the same real-browser run. The public repository intentionally does not replicate those copyrighted/private content payloads.
