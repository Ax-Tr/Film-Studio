# Sprint 01 — Feasibility Spike Report

**Status:** In progress; desktop-executable evidence passes, physical-device gates remain open  
**Date:** 13 November 2026  
**Scope:** S1 editor, Telugu, mobile, Yjs, pagination, fonts, and encrypted SQLite feasibility only. This is not production application code.

## 1. Evidence produced

| Work item | Evidence | Result |
|---|---|---|
| Typed screenplay editor | Tiptap schema with distinct nodes for all 18 architecture-defined block types, stable `blockId`, typed `blockType`, Telugu JSON/DOM roundtrip | Pass |
| Per-scene collaborative text | Yjs concurrent offline edits, reversed and duplicate delivery, state-vector diff, and isolation between scene documents | Pass in Node test harness |
| Mobile editor protocol | Transport-neutral command/response/event bridge with correlation, timeout, parse validation, and disposal | Pass in unit tests; WebView host/device evidence pending |
| Telugu shaping | HarfBuzz shapes the golden corpus with the Noto Telugu Indic `tel2` GSUB script | Pass |
| Mixed Telugu/English | Script/font fallback segmentation between Noto Sans Telugu and Noto Sans; missing glyphs rejected | Pass |
| Deterministic pagination basis | Immutable shaped-line input and deterministic page manifest; character cue kept with following dialogue | Pass for model; full line-breaking/PDF pending |
| Chromium PDF baseline | Two-page A4 spike rendered and visually inspected at 2x; Telugu/mixed-script layout is legible with no clipping | Visual pass; Unicode extraction/copy roundtrip fails for some combining sequences |
| Local encryption guard | SQLCipher build detection and fail-closed 256-bit key validation | Pass in unit tests; native binary/device proof pending |
| Dependency reproducibility | Pinned `package.json` plus `pnpm-lock.yaml` | Pass |

Automated result at the time of this report: **18 tests across 6 files, all passing**, plus strict TypeScript typecheck. Re-run commands before relying on the count.

## 2. Findings and provisional decisions

### Web editor

**Provisional decision:** Continue with Tiptap/ProseMirror for the web editor. The spike proves the schema can represent separate screenplay block types and retain Telugu text and stable IDs. It does not yet prove full keyboard behavior, accessibility, long-document performance, or production collaboration binding.

### Mobile editor

The official Tiptap mobile guide currently describes an experimental WebView bridge and explicitly says adopters own the copied bridge. It identifies keyboard/caret and auto-height limitations that require device testing. The bridge does provide the strongest schema parity with the web editor and an offline-bundle path.

| Candidate | Advantages | Risks | S1 disposition |
|---|---|---|---|
| Native React Native block editor | Native accessibility/navigation and platform controls | Complex IME composition, selection, schema parity, Yjs binding, and rich block behavior must be built/maintained twice | Retain as fallback/long-term option; insufficient evidence to select now |
| Offline bundled Tiptap in React Native WebView | Same document schema/transforms as web; Tiptap reference protocol; offline HTML bundle possible | Official pattern is experimental; caret/keyboard, paste, accessibility, crash and bridge ordering need real-device proof | Preferred device-spike candidate, not yet accepted for production |

**Gate:** Do not accept ADR-005 until Android 15 and physical iOS tests pass the matrix in Section 5.

### Yjs

**Provisional decision:** The per-scene Yjs architecture is technically viable. Yjs updates are idempotent, commutative, and order-independent in the spike, and state-vector diffs work. Structured metadata, reorder, delete, permission revocation, server persistence, and compaction remain outside CRDT text and require the explicit operation/conflict protocol from the architecture.

### Telugu shaping and pagination

The spike confirmed that shaping and pagination are distinct problems. HarfBuzz produces positioned glyphs and Indic substitutions, but it does not perform paragraph line breaking or page layout. A Telugu-only font also does not safely cover English code switching; explicit fallback segmentation is required.

**Provisional decision:** Use a pinned HarfBuzz-based shaping core and pinned font set as input to a canonical layout manifest. Prefer the same shaping/font versions in server export and offline-capable clients. Do not accept ADR-006 until full line breaking, font fallback, PDF structure, copy/search, and cross-platform golden comparisons pass.

### PDF baseline result

The Windows Chromium baseline PDF is visually clean in the two rendered page images: the screenplay sample, Telugu conjuncts/numerals, and mixed `Hyderabad` fallback are legible and unclipped. However, extraction through an independent PDF parser duplicates some Telugu vowel/combining signs. Examples include the heading and words such as `గుణింతాలు`. This means search/copy/paste fidelity is not acceptable even though the page looks correct.

**Decision:** Chromium print-to-PDF is rejected as the canonical screenplay export path. Keep it only as a visual comparison baseline. The production renderer must emit a correct Unicode mapping/ToUnicode structure and pass exact extraction roundtrips in addition to visual goldens.

Font evidence:

| Asset | Version/source | License | SHA-256 |
|---|---|---|---|
| Noto Sans Telugu Regular | 2.005, official Noto Telugu release | OFL-1.1 | `DCB86A5DA09365A2D73D725E429403DCA988E6D50C1B1D564579A25DBC18BD29` |
| Noto Sans variable fallback | official Google Fonts repository snapshot downloaded for spike | OFL-1.1 | `BFB7BB691513F12E734DC346C03A03F784912432D7E3FA8E56EFCF906FE86B3D` |

These are feasibility fonts, not final brand/page-style approval. Their OFL texts are stored beside the binaries.

### Encrypted SQLite

Expo's current official SQLite documentation supports SQLCipher on Android and iOS through `useSQLCipher`, requires a native prebuild/rebuild, and warns that SQLCipher is unavailable in Expo Go. It also notes an unknown pragma can be silently ignored, so the spike checks `PRAGMA cipher_version` and fails closed before applying a validated key.

**Provisional decision:** Use an Expo development/native build with SQLCipher, never Expo Go, for the encrypted-storage spike. Generate a random 256-bit database key; store only that small key in Keychain/Keystore through SecureStore; never hard-code it or place the screenplay database in SecureStore. Key rotation, backup, biometric/app-lock behavior, uninstall/reinstall, and device migration require separate policies and tests.

## 3. Sources used for the spike

- Tiptap mobile guide: https://tiptap.dev/docs/guides/mobile-apps
- Expo SQLite and SQLCipher: https://docs.expo.dev/versions/latest/sdk/sqlite/
- Yjs document updates: https://docs.yjs.dev/api/document-updates
- HarfBuzz shaping: https://harfbuzz.github.io/harfbuzz-hb-shape.html
- HarfBuzz OpenType shaping models: https://harfbuzz.github.io/opentype-shaping-models.html
- HarfBuzz JavaScript binding: https://github.com/harfbuzz/harfbuzzjs
- Noto Telugu source/license: https://github.com/notofonts/telugu
- Google Fonts Noto Sans metadata/license: https://github.com/google/fonts/tree/main/ofl/notosans

## 4. Environment constraints observed

- Node and the isolated TypeScript test harness are available.
- No Android SDK, Android Studio, emulator, or `adb` installation is available at the configured/local paths.
- This is Windows; native iOS builds and physical iOS testing require macOS/Xcode or an approved hosted build plus physical devices.
- No production repository or app shell exists yet by design; that belongs to S3 after G0.

These constraints are not converted into fake device evidence.

## 5. Required physical-device acceptance matrix

### Android 15+

- Telugu Gboard and at least one approved alternative keyboard: composition, deletion, cursor movement, selection, copy/paste, undo/redo, suggestions, voice input where supported.
- WebView caret visibility with keyboard open, scene/block navigation, long dialogue, rapid typing, background/foreground, rotation, process kill, low memory and full storage.
- Offline bundled editor startup, bridge readiness ordering, command timeout/retry, crash recovery, Yjs update persistence, accessibility/TalkBack.
- SQLCipher native inclusion verified by `PRAGMA cipher_version`; encrypted file unreadable without key; upgrade/rekey/uninstall behavior.

### iOS supported range

- Telugu system keyboard composition, deletion, cursor/selection, copy/paste, dictation where supported, external keyboard, VoiceOver.
- WKWebView keyboard insets/caret, background/termination, memory pressure, offline bundle, bridge readiness, crash recovery and Yjs persistence.
- SQLCipher native inclusion, Keychain behavior, device-lock/data-protection interaction, upgrade/rekey/uninstall/restore.

### Cross-platform layout

- Same approved corpus, font hashes, shaping version and layout inputs on web, Android, iOS and server worker.
- Pixel and structural PDF comparison; embedded fonts; Telugu ligatures/marks; no clipping; selectable/searchable/copyable Unicode; mixed-script fallback; page-break and keep-together rules.

## 6. Sprint exit status

S1 cannot honestly be marked complete yet. The code-level feasibility evidence is positive, but the architecture requires physical-device prototypes. Remaining exit items:

1. Obtain Android 15 device/emulator tooling and at least one representative physical device.
2. Obtain macOS/Xcode or hosted iOS build access plus a physical iPhone in the supported range.
3. Build the React Native WebView host and SQLCipher development builds.
4. Execute the device matrix and attach recordings/logs without screenplay content.
5. Replace the failed Chromium PDF text mapping with a renderer that passes exact Unicode extraction, then compare the resulting golden across platforms.
6. Accept or reject ADR-005 and ADR-006 based on that evidence.

