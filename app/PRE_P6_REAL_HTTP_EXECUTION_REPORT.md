# Pre-P6 Real HTTP Execution Report

## Current verdict

**FAIL_REWORK — one strict production-input coupling gate remains.**

The recovered P5 source has now passed a real Chromium / real HTTP production-path structural regression at `http://127.0.0.1:4173/index.html`.

Result: **17 PASS / 0 FAIL**

- uncaught page errors: 0
- request failures: 0
- normal-flow required-resource 404: 0
- an HTTP 404 was generated intentionally inside the missing-JSON fail-closed test only

Passed coverage:

1. HTTP 200 + runtime canonical/learning gate
2. Home -> Script -> Line Detail
3. 004 -> 005 -> 004 equivalent Word Detail roundtrip
4. 004 -> 008 exact Speech ID handoff / exact Cue landing
5. 1164 speeches / 1161 Cue inventory
6. 007 -> 008
7. 007 -> 009
8. Rehearsal interaction -> Progress persistence
9. 100/50/25 progress -> Act I 68% / Overall 44%
10. Browser Back / Forward
11. Reload / Restore using real localStorage
12. stale / invalid state sanitization
13. fail-closed: Act II reduced to 637
14. fail-closed: required JSON missing
15. fail-closed: invalid JSON
16. fail-closed: invalid Speech ID reference
17. real browser TTS + SpeechRecognition capability/construction

The prior Cue test was corrected: `mts.practice.pending` is deliberately consumed and removed by Cue Practice after successful handoff, so the gate now checks exact target speaker + exact immediately preceding cue + pending consumed.

## Browser-policy cleanup

A localhost-only browser-policy exception was used for the exact test origin while retaining the global URL blocklist. After testing, the Chromium managed policy was restored from backup. Current SHA-256 equals the pre-test backup SHA-256.

## Strict remaining gate

The four learning JSONs used in this browser run are public-safe structural CI fixtures. They do not match the registered private production SHA-256 values.

The actual production learning payloads remain private/File-Library inputs and are intentionally excluded from this public repository. Therefore the strict final gate remains:

> Materialize the four hash-verified production learning JSON byte payloads into a private HTTP test bundle and rerun this same real-browser suite.

Until that coupling run is independently evidenced, do not issue `PASS_PRE_P6` and do not treat this report as permission to merge P6 work.

No P6 Manifest, Service Worker, offline cache, installability, or update-lifecycle implementation was added in this work.
