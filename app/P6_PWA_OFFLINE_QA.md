# P6 PWA / Offline QA

Status: IMPLEMENTED_PENDING_REMOTE_QA

## Scope
P6 adds PWA delivery without changing the P5 application routes, canonical IDs, progress keys, or embedded practice documents.

## Automated gates
- manifest JSON / icon existence
- service worker syntax and required lifecycle hooks
- canonical data contract integrity
- P5 canonical invariants
- P5 browser regression suite
- service worker registration/version handshake
- offline reload and route smoke
- localStorage persistence offline
- stale cache cleanup
- corrupted canonical cache fail-closed
- missing app-shell fallback

## Production-data gate
The public repository intentionally omits the five copyrighted/private canonical JSON payloads. A strict production PASS requires those exact files to be materialized in the deployment root and to match the SHA-256 values in `pwa-version.json`.
