# ADR-012 — Pinned Node/pnpm monorepo and delivery baseline

**Status:** Accepted implementation baseline; review at each supported-release upgrade  
**Date:** 13 November 2026

## Context

The platform needs independently buildable web, Android/iOS, API and worker artifacts while sharing only framework-neutral contracts and domain rules. Floating package versions would make feasibility evidence and release artifacts irreproducible.

## Decision

1. Use Node.js 24 LTS and pnpm 10.20.0 for the Sprint 3 workspace.
2. Use pnpm workspaces and Turborepo for dependency-aware checks/builds.
3. Pin exact direct dependency versions and commit `pnpm-lock.yaml`.
4. Keep `contracts`, `domain`, `screenplay-model` and `sync-core` free of React, React Native, NestJS and database-driver imports; enforce this in a repository check.
5. Pin Expo SDK 58 with its supported React Native line; native signing and physical-device acceptance remain S14+ work.
6. Pin local PostgreSQL/Redis/object-store images to exact tags. Production images require digest pinning and security review before release use.
7. Treat generated SBOMs and build output as CI artifacts, not hand-edited source.

## Consequences

- Dependency upgrades are explicit pull requests with compatibility checks.
- Web and mobile may use different React patch versions when their frameworks require it.
- A developer needs the pinned Node/pnpm line for supported local reproduction.
- The local Compose stack is not production infrastructure.

## Verification

`pnpm install --frozen-lockfile`, `pnpm check`, Compose configuration validation, dependency/secret scans, SBOM generation and CI artifact upload must pass before S3 acceptance.
