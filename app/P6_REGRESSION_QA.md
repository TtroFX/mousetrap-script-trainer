# P6 Regression QA

Status: IMPLEMENTED_PENDING_REMOTE_QA

P5 production files retained unchanged:
- `p5_app.js`
- `p5.css`
- `P2_learning.html`
- `008_cue_practice_P3.html`
- `009_rehearsal_P4.html`

P6 only connects PWA metadata/runtime to the existing shell. Existing `mts.*` localStorage keys are not deleted or migrated by P6 code. Cache cleanup only targets Cache Storage entries with prefix `mts-pwa-`.
