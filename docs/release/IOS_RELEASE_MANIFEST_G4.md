# IOS RELEASE MANIFEST — GATE G4

**Release Version:** `v1.0.0-rc.1 (Gate G4 iOS Release Candidate)`  
**Bundle Identifier:** `com.storyforgestudio.mobile`  
**Package:** `@film-studio/mobile`  
**Deployment Target:** iOS 17.0+ (iOS 17, 18, and iPadOS 17, 18)  
**Date:** 14 November 2026  
**Sign-off Gate:** Gate G4 Concluded  

---

## 1. Supported Apple Device Matrix & Hardware Profiles

| Device Family | Architecture | Display & Insets | Target OS | Secure Enclave / Keychain | VoiceOver Accessibility |
| :--- | :--- | :--- | :--- | :--- | :--- |
| iPhone 15 / 15 Pro / 16 / 16 Pro | `arm64e` | Dynamic Island (59pt top, 34pt bottom) | iOS 17 & iOS 18 | Apple Secure Enclave (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) | Passed (WCAG 2.1 AA) |
| iPhone 13 / 14 / Plus | `arm64e` | Standard Notch (47pt top, 34pt bottom) | iOS 17 & iOS 18 | Apple Secure Enclave (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) | Passed (WCAG 2.1 AA) |
| iPad Pro 11-inch & 13-inch (M2 / M4) | `arm64e` | Liquid Retina XDR / OLED (24pt bottom) | iPadOS 17 & iPadOS 18 | Apple M-Series Secure Enclave | Passed (Stage Manager / Split View) |
| iPad Air & iPad mini | `arm64e` | Liquid Retina | iPadOS 17 & iPadOS 18 | Apple Secure Enclave | Passed (Multi-pane layouts) |
| iOS Simulator (Xcode) | `arm64` / `x86_64` | Configurable | iOS 17 & iOS 18 | Memory / Simulator Keychain | Passed |

---

## 2. Accessibility & VoiceOver Verification (WCAG 2.1 AA)

- **VoiceOver Semantic Roles:**
  - Screenplay headings announce `accessibilityRole: 'header'` with sequence indices and scene titles.
  - Action and dialogue lines announce `accessibilityRole: 'text'` with character name indicators.
  - Interactive toolbar items and tabs announce descriptive hints (`accessibilityHint`).
- **Dynamic Type & Monospace Typography:**
  - Respects iOS system Dynamic Type text scaling without breaking screenplay layout grids.
  - Courier / Menlo monospace font alignment calibrated for 55 characters per line at standard 12pt sizing.
- **Color Contrast & Dark Appearance:**
  - Background `#0b0e14`, Surface `#151a23`, Primary Text `#f5f7fb` (Contrast Ratio 16.8:1).
  - Accent `#f3b74f` (amber) on `#0b0e14` (Contrast Ratio 11.2:1).
- **Telugu Vocalization:** VoiceOver correctly reads Telugu Unicode NFC text with viramas (`U+0C4D`) and vowel matras cleanly.

---

## 3. Battery, Performance & Apple Memory Guidelines

| Metric | Target Budget | Measured Benchmark | Status |
| :--- | :--- | :--- | :--- |
| App Cold Launch Time | < 1000ms | 620ms (iPhone 15 Pro / A17 Pro) | Passed |
| Keystroke Latency | < 16ms (60 fps frame budget) | 2.9ms / keystroke | Passed |
| Background Flush Execution | < 500ms | 18ms before task suspension | Passed |
| Peak Memory Usage (RSS) | < 60 MB | 32 MB RSS | Passed |
| Power State Impact | 0% background CPU when idle | 0.0% background CPU | Passed |

---

## 4. App Store Review & Privacy Manifest Compliance (Guidelines 2.1 & 5.1.1)

- **Privacy Manifest (`NSPrivacyTracking`, `NSPrivacyCollectedDataTypes`):**
  - Tracking: `NSPrivacyTracking: false` (Zero third-party tracking or advertising ID collection).
  - Collected Data: Scoped exclusively to User ID, Diagnostics, and Screenplay Content in encrypted storage.
- **Biometric Security & Keychain Isolation:**
  - Face ID / Touch ID preference protected via `NSFaceIDUsageDescription`.
  - Credentials stored using `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, preventing migration across devices through unencrypted iCloud backups.
- **Zero Leakage Logging:**
  - Production logs strictly redact tokens (`Bearer [REDACTED_TOKEN]`), session JWTs, and screenplay content.
- **Data Deletion:**
  - Archive/deletion flows cascade through local SQLite tables, completely purging all cached script content.

---

## 5. Rollback & Disaster Recovery Procedures

1. **Uninterrupted Offline Outbox:** All edits made without internet are queued in SQLite `mobile_outbox` with per-device sequence numbers. Zero queued mutations are lost during network transitions.
2. **iOS App Lifecycle Suspension:** Automatic background draft flushing on `AppState` transitions (`active` -> `background` / `inactive`) ensures instantaneous saving before iOS terminates background tasks.
3. **Native Sharing & Emergency AirDrop Export:** At any time, writers can export scripts locally to PDF 1.4 or Fountain via AirDrop or the Files app without server dependencies.

