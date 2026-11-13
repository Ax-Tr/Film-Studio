# Sprint 03 — Repository and delivery foundation

**Status:** Implementation ready for review; exit gate not yet accepted  
**Date:** 13 November 2026  
**Gate note:** Executed at the product owner's explicit direction while S0/S1/S2 remain open.

## 1. Delivered

| Area | Delivered evidence | Status |
|---|---|---|
| Repository | Git repository initialized on `main`; generated/local/sensitive artifacts ignored | Local repository exists; no remote or baseline commit yet |
| Workspace | 16-project pnpm workspace with sequential required checks and Turborepo task graph available for development | Complete |
| Toolchain | Node 24 LTS, pnpm 10.20.0, TypeScript 5.9.3, Next.js 16.4.6, NestJS 12.5.0, Expo 58.0.25/RN 0.88.0 pinned | Complete |
| Deployables | Next.js web shell, NestJS API health service, Expo mobile shell, asynchronous worker shell | Build/typecheck complete; native signed builds are later gates |
| Shared boundaries | Contracts, domain, screenplay model, sync core, API/auth clients, editor bridge, pagination manifest, localization, design tokens and synthetic fixtures | Complete; automated framework-boundary check |
| Local dependencies | Pinned PostgreSQL 18.6, Redis 8.8.4 and MinIO Compose definition with loopback ports, health checks and named volumes | Configuration complete; runtime boot blocked by local Docker/WSL failure |
| Configuration | Runtime-validated environment schema plus secret-free `.env.example` | Complete |
| Quality | Lint, strict typecheck, unit/contract tests, deterministic builds and runtime smoke-test paths | Pass |
| Security | Local high-confidence secret scan, Gitleaks workflow, dependency audit/review, CodeQL and dependency risk register | Zero high/critical audit findings; one recorded moderate build-tool finding |
| Supply chain | Frozen lockfile, CycloneDX SBOM workflow, build-artifact upload workflow | Definitions complete; remote workflow execution pending |
| Documentation | README, package-boundary guide, CI requirements, ADR/runbook templates and ADR-012 | Complete |

## 2. Verified local evidence

1. `pnpm install --frozen-lockfile --offline` passes with the pinned local store and reports the lockfile up to date.
2. `pnpm check` exits successfully. It verifies boundaries and secrets, lints the workspace, builds 14 buildable projects, typechecks all 15 child workspaces and runs six tests across contracts, API and worker.
3. The standalone Next.js artifact starts on loopback and returns HTTP 200 with the expected title/heading.
4. The compiled NestJS artifact starts on loopback and returns the validated `ServiceStatus` health envelope.
5. Expo resolves the mobile configuration as SDK 58 with Android/iOS/web platforms and the Android 15 support floor. Final Android/iOS application identifiers remain unset until account/domain ownership is confirmed.
6. `pnpm audit --prod --audit-level high` passes: zero high/critical findings. The one moderate transitive Expo build-tool advisory is tracked in `docs/security/DEPENDENCY_RISK_REGISTER.md`.
7. The repository-local scan found no high-confidence secret patterns. `architecture.html`, local `.env` files, key/certificate formats, caches and generated outputs are excluded from version control.

## 3. CTO decisions

1. Node 24 LTS is the supported runtime line for this baseline; odd/current and end-of-life Node lines are excluded.
2. Direct dependencies and local infrastructure image tags are exact pins; the lockfile is authoritative.
3. Required checks execute sequentially to match the single delivery stream and avoid nondeterministic Windows task-runner behavior.
4. Framework-neutral core packages are protected by an executable import-boundary rule.
5. Web/mobile UI remains platform-specific. Shared code is limited to contracts, pure rules, protocols, tokens and fixtures.
6. The root SQL/OpenAPI proposals are not wired into runtime startup. Production migrations and generated API authority begin in S5.
7. Local Compose is development-only. AWS account, budget and production infrastructure remain approval-gated.
8. No identity vendor, role default, retention policy, PDF renderer, mobile database encryption, AI vendor or production credential is hard-coded.

## 4. Open exit evidence

S3 must remain unaccepted until all of the following are evidenced:

1. Repair the machine's Docker/WSL installation. The current Docker command fails because its configured WSL `ext4.vhdx` file is missing, so the pinned PostgreSQL/Redis/MinIO stack could not be booted.
2. Create the controlled remote repository and run the GitHub required-check, CodeQL, secret, dependency, SBOM and artifact jobs from a clean runner.
3. Retain the generated CycloneDX SBOM and skeleton artifacts, then enable required branch protection.
4. Replace GitHub Action major tags with reviewed full commit SHAs before production release.
5. Upgrade Expo Fingerprint when an SDK-compatible fix for GHSA-g3hv-75wg-m249 is published; reassess before signed mobile builds.
6. Obtain product-owner acceptance of ADR-012 and this report.

## 5. Earlier-gate blockers retained

- S0 product/business inputs and acceptance are incomplete.
- S1 Android/iOS physical-device editor/encryption evidence and the production Telugu PDF renderer are incomplete.
- S2 security/sync documents are ready for review but not accepted.
- The credential/session exposure in `architecture.html` still requires owner-confirmed invalidation and removal/quarantine; ignoring the file prevents an accidental new commit but does not revoke a leaked credential.

S4 identity and tenant security has not started.
