# ADR-005 — Mobile screenplay editor binding

**Status:** Proposed; blocked on physical-device evidence  
**Date:** 13 November 2026

## Context

The mobile editor must preserve the same typed screenplay schema and per-scene collaborative semantics as the web editor while working offline and supporting Telugu IME composition, native lifecycle, accessibility, selection, clipboard, and recovery behavior.

The spike compared:

1. A native React Native block editor maintained separately from ProseMirror.
2. A self-contained offline Tiptap editor bundle hosted in React Native WebView with a native command/event bridge.

The official Tiptap mobile pattern is explicitly experimental and documents WebView caret/keyboard limitations. The local spike proves only the transport contract and shared schema behavior, not native input quality.

## Proposed decision

Use an offline-bundled Tiptap WebView as the preferred S1 device-test candidate because it minimizes schema/transform divergence from the web editor. Native React Native screens continue to own navigation, scene lists, metadata, capture, sync status, conflicts, files, and review controls.

Do not adopt this as the production decision until Android 15 and supported iOS physical-device tests pass. If IME, accessibility, selection, crash recovery, or performance fail the approved thresholds, return to a native block editor while retaining the same domain schema and bridge-independent operation format.

## Required acceptance evidence

- Telugu composition/deletion/cursor/selection/copy/paste with real keyboards.
- External keyboard behavior where applicable.
- Caret visibility with software keyboard and safe-area changes.
- VoiceOver/TalkBack navigation and editing.
- Offline bundle startup, process kill, restoration, low memory, and full storage.
- Yjs update persistence and bridge readiness/timeout behavior.
- Large-scene typing latency on agreed low/mid/high devices.

## Consequences

- The editor bundle and bridge are owned and security-reviewed by Storyforge; no CDN runtime dependency.
- WebView content is isolated, uses a strict message allowlist, and cannot receive credentials or arbitrary navigation.
- The architecture retains a replacement boundary so mobile rendering can change without changing canonical data.
