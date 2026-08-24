# P6 Release Manifest

- Stage: P6 — PWA / Offline / Install / Final Production QA
- P5 baseline SHA: `6f7fc2df4f382df682444cda17c3f50ecf308956`
- P6 build ID: `p6-2026-08-24-r1`
- Canonical data version: `p5-canonical-freeze-2026-08-24-r1`
- P5 application routes/state schema: unchanged
- P5 canonical IDs/data paths: unchanged
- Cache strategy:
  - versioned app shell cache by P6 build ID
  - canonical data cache by frozen data-version contract
  - SHA-256 validation before canonical payload is served/cached
  - stale shell/data cache cleanup on activation
  - no automatic `skipWaiting`; update activation requires explicit user action
- Public repository policy: copyrighted/private canonical payloads are not committed. Production payloads must match `P5_PRIVATE_INPUTS_MANIFEST.json` and `pwa-version.json`.
