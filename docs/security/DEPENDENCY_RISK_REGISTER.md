# Dependency risk register

## DR-001 — Expo Fingerprint transitive minimatch advisory

**Recorded:** 13 November 2026  
**Severity:** Moderate  
**Advisory:** GHSA-g3hv-75wg-m249  
**Path:** `expo@58.0.25` → `@expo/fingerprint@0.21.10` → `minimatch@10.2.6`  
**Runtime exposure:** Build/fingerprint tooling; not an API request-processing dependency  
**Current result:** `pnpm audit --prod --audit-level high` passes with zero high/critical findings.

The patched `minimatch` major is outside the range declared by the latest compatible `@expo/fingerprint`; a blind major-version override could corrupt native build fingerprints. Track the upstream Expo patch and upgrade immediately after Expo publishes a compatible release. Do not pass untrusted user-controlled glob patterns to build tooling. Re-evaluate before any signed mobile release.
