# STORYFORGE STUDIO — Initial Service, Recovery and Performance Objectives

**Status:** CTO engineering proposal; calibrate with S0 owner inputs and measured baselines  
**Date:** 13 November 2026

These are release-engineering targets, not contractual promises. They become commitments only after target devices, scale, budget, support hours and load tests are approved.

## 1. Reliability and recovery

| Objective | Initial target |
|---|---:|
| API/sync monthly availability after GA | 99.9%, excluding approved maintenance only if communicated |
| Acknowledged canonical database RPO | ≤ 5 minutes; target near-zero with managed PITR |
| Regional service RTO | ≤ 4 hours initial target |
| Accidental scene/document deletion recovery | Owner-approved window pending; functionality required |
| Intentional crash/network test corpus | 0 lost locally committed edits |
| Duplicate operation replay | 0 duplicate canonical mutations/jobs/charges |
| Backup restore | Quarterly before GA cadence is finalized; restore evidence required before release |

Local unsynced content is outside cloud RPO because the server has not received it; clients must preserve/export it and communicate “Saved locally” rather than “Synced.”

## 2. Performance hypotheses

| Workflow | Initial measurement target |
|---|---:|
| Keystroke to visible editor response | p95 < 50 ms on approved target devices |
| Local durable save transaction | p95 < 250 ms |
| Normal API read | p95 < 400 ms in primary region |
| Normal API structured write | p95 < 700 ms |
| Sync push/pull of normal bounded batch | p95 < 2 seconds on approved network profile |
| Project/search response | p95 < 1 second for approved large-film fixture |
| 120-page screenplay export | 95% < 2 minutes, subject to renderer evidence |
| App warm resume to editable offline scene | p95 < 2 seconds on approved devices |

No target is accepted until hardware/network/data fixtures are recorded with the result.

## 3. Security/operations objectives

- Critical tenant/auth/secret/data-loss alerts page an accountable operator within the approved support model.
- Key security audit actions are available for investigation within 5 minutes of ingestion under normal conditions.
- High-risk sessions/actions require MFA/re-authentication.
- Secrets and film content have zero allowed telemetry occurrences in automated canary scans.
- Critical/high release findings block production under the threat-model policy.

## 4. Capacity inputs still needed

- Users, active films, members/concurrent editors per film.
- Maximum pages/scenes/blocks/files/storage per film.
- Offline duration and supported mobile-version window.
- Fixed operating budget and on-call/support hours.
- Contractual availability/RPO/RTO, if any.

