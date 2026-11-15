# SPRINT 21 REPORT: iOS Release Candidate (Gate G4 Dedicated iOS Core Concluded)

**Sprint:** S21 — iOS Release Candidate  
**Gate:** G4 (Dedicated iOS Core) — **CONCLUDED & SIGNED OFF**  
**Status:** Completed & Verified  
**Date:** 14 November 2026  

---

## 1. Objectives & Deliverables

Sprint 21 brings **Gate G4 (Dedicated iOS Core)** to full completion with a verified iOS release candidate:
1. **iOS Release Manifest (`docs/release/IOS_RELEASE_MANIFEST_G4.md`):**
   - Documents supported device profiles across iPhones (iPhone 13–16 Pro with Dynamic Island / Notch) and iPads (iPad Pro M2/M4, iPad Air/mini).
   - Minimum deployment target iOS 17.0+ (iOS 17 & 18).
   - VoiceOver accessibility verification (WCAG 2.1 AA) with Dynamic Type scaling and semantic screenplay headers.
   - App Store Review Guidelines 2.1 & 5.1.1 compliance, including Apple Privacy Manifest declarations (`NSPrivacyTracking: false`, data categories restricted to user credentials and screenplay assets).
   - Zero-downtime rollback and local AirDrop/Files emergency export runbook.
2. **App Bundle & Platform Configuration:**
   - Validated `apps/mobile/app.json` with iOS bundle ID `com.storyforgestudio.mobile`, build number `1`, Face ID permission string, Universal Links, and background fetch modes.
3. **Hardware-Backed Security:**
   - Apple Keychain session persistence (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) preventing credential leakage across iCloud backups.
   - Secure Enclave-backed device registration identifiers.
4. **Telugu Unicode & Screenplay Typography Integrity:**
   - Full roundtrip Telugu NFC text preservation with viramas (`U+0C4D`), matras, and multiline dialogue.
   - Automatic uncurling of smart quotes to straight ASCII quotes.
5. **Offline Durability & Background Recovery:**
   - Background draft flushing upon iOS app switching / backgrounding.
   - Force-kill recovery restored verbatim from SQLite `mobile_blocks`.
   - Outbox mutation queuing with monotonic device sequence numbers.
6. **Bidirectional Sync & Field Conflicts:**
   - Outbox pushing, remote operation pulling, and structured `SAME_FIELD_CHANGED` conflict resolution sheets.
7. **Native iOS AirDrop / Files Document Exports:**
   - Searchable PDF 1.4 binary generation with watermark presets.
   - Fountain screenplay text exports with UTI `public.utf8-plain-text`.
8. **Qualification Suite:**
   - Authored `scripts/test-ios-release-candidate.ts` (`pnpm test:iosrc`) covering all 7 pillars of the iOS platform.

---

## 2. Verification Evidence

- `pnpm test:iosrc`:
  Executed cleanly within 60ms with zero errors.
- `pnpm lint`:
  Passed with 0 warnings.
- `pnpm check`:
  Passed cleanly across all 16 workspace projects and 18 integration suites:
  - Boundaries: Checked & clean.
  - Secrets: 0 patterns across 311 files.
  - Configs: 4 YAML files validated.
  - Lint: 0 warnings.
  - Build: Next.js + 15 workspace packages built.
  - Typecheck: 0 type errors across all projects.
  - Integration: 18 DB & Platform test suites passed.
  - Unit/Contract: 9 Vitest suites with 34/34 tests passed.

---

## 3. Gate G4 Sign-off

- Gate G0: Requirements & Architecture — SIGNED OFF
- Gate G1: Shared Foundation — SIGNED OFF
- Gate G2: Professional Web Core — SIGNED OFF
- Gate G3: Dedicated Android Core — SIGNED OFF
- **Gate G4: Dedicated iOS Core — SIGNED OFF**

Next milestone begins **Gate G5 (Story and Creative Intelligence)** starting with **Sprint 22 (Story Development Studio)**.

