# Sprint 01 feasibility spike

This is disposable evidence for architecture decisions, not production application code.

Implemented executable checks:

- Distinct Tiptap nodes for the 18 required screenplay block types.
- Telugu JSON/DOM roundtrip with stable block IDs.
- Per-scene Yjs convergence, duplicate-update idempotency, state-vector diff, and scene isolation.
- A transport-independent mobile editor bridge with correlated responses, events, and timeouts.
- A deterministic pagination-manifest prototype with a cue/dialogue keep-together rule.
- Actual Telugu OpenType shaping with HarfBuzz, Noto Sans Telugu 2.005, and a Noto Sans Latin fallback, including substitution, mixed-script, missing-glyph, and determinism checks.
- A fail-closed SQLCipher availability/key guard and Expo config fragment.

See `SPRINT_01_SPIKE_REPORT.md` for evidence, provisional decisions, and open physical-device gates.

Still requires external evidence before the sprint can pass:

- Android 15 physical-device Telugu IME tests.
- Physical iOS device Telugu IME tests on the supported version range.
- React Native WebView keyboard/caret, selection, paste, accessibility, and crash-recovery tests.
- SQLCipher prebuilds and `PRAGMA cipher_version` validation on Android and iOS.
- Golden PDF rendering and cross-platform pixel/structure comparison using the shaped glyph manifest.
- Final font embedding/distribution legal review.

Run:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```
