# Film Studio Platform

This repository is the implementation workspace for the Film Studio web, Android, iOS, API and worker applications. Sprint 5 adds the canonical film/document/screenplay identity, versioning, ordering and lifecycle foundation; it does not claim that sync, editor UI, staging identity, native clients or production infrastructure are complete.

## Prerequisites

- Node.js 24 LTS
- pnpm 10.20.0 (Corepack may activate the pinned version)
- Docker Desktop or another Compose-compatible runtime for local PostgreSQL, Redis and object storage
- Android Studio for Android device work
- macOS/Xcode or an approved hosted build service for iOS validation

## Bootstrap and verify

```shell
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

For local services, copy `.env.example` to `.env`, set unique development credentials, then run `pnpm infra:up`. Do not reuse local credentials outside the developer machine.

## Workspace boundaries

- `apps/web`: Next.js web application
- `apps/mobile`: Expo/React Native application workspace
- `apps/api`: NestJS modular API
- `workers/jobs`: asynchronous worker deployable
- `packages/*`: framework-neutral contracts, domain rules and platform bridges
- `infra/docker`: local-only dependencies
- `docs`: decisions, security, operations, QA and release evidence

The contracts, domain, screenplay and sync packages must remain free of React, NestJS and database-driver imports. Security decisions are enforced on the API/worker, not trusted to clients.

## Current gate state

S5 was executed only because the product owner explicitly requested the next sprint. Its local implementation is ready for review, but real PostgreSQL 18 evidence, generated OpenAPI/client drift checks, route-level integration evidence and product approvals remain open. S0–S4 blockers also remain. See `SPRINT_PLAN.md` and `docs/release/SPRINT_05_REPORT.md`.
