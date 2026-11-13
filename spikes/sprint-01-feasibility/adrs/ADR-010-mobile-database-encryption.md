# ADR-010 — Mobile database encryption feasibility

**Status:** Proposed; blocked on native Android/iOS builds  
**Date:** 13 November 2026

## Context

Mobile clients store screenplay content and unsent operations offline. Expo SecureStore is appropriate for small credentials/keys, not for the screenplay database. Expo SQLite currently supports SQLCipher only in a native prebuild/development build and not Expo Go. An unsupported pragma may otherwise be silently ignored.

## Proposed decision

- Build `expo-sqlite` with `useSQLCipher: true` for Android and iOS.
- Generate a random 256-bit database key on device; store the small key in Keychain/Keystore through the platform secure-storage adapter.
- Check `PRAGMA cipher_version` and fail closed before opening screenplay storage for use.
- Never hard-code, log, sync, or include the database key in backups without approved wrapping/encryption.
- Never treat Expo Go as encryption evidence.

## Required acceptance evidence

- `PRAGMA cipher_version` succeeds in signed/native builds on both platforms.
- The database file is unreadable without the key.
- Correct behavior across upgrade, migration, rekey, device lock, biometric/app lock, backup/restore, uninstall/reinstall, and revoked membership.
- No plaintext journal, temporary, diagnostic, or crash artifact leaks screenplay content.

## Consequences

Native/prebuild capability is required. Key loss and account recovery policies must be defined before production because encryption that can be bypassed for convenience is not accepted.
