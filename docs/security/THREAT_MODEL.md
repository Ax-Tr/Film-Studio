# STORYFORGE STUDIO — Threat Model

**Status:** S2 review baseline  
**Date:** 13 November 2026  
**Security target:** Current OWASP ASVS Level 2 baseline for web/API, risk-selected higher controls for administrator, identity, export, AI-secret and cross-tenant paths; current OWASP MASVS controls for mobile storage, cryptography, authentication, network, platform and privacy.

## 1. Protected assets

1. Screenplays, drafts, notes, characters, story structures and revision history.
2. Film production, schedule, budget, cast/crew and file data.
3. Identity, membership, device sessions and recovery factors.
4. Offline databases, unsent operations and recovery branches.
5. AI provider credentials, consent manifests, prompts, responses and usage.
6. Exported files, backups, object-store data and encryption keys.
7. Audit evidence, support-access records and security telemetry.
8. Service availability and the integrity/order of sync operations.

## 2. Trust boundaries

- Web browser ↔ Next.js BFF ↔ API.
- Android/iOS app ↔ OIDC provider/API/WebSocket.
- Client local store/outbox ↔ sync coordinator.
- API/worker ↔ PostgreSQL, Redis and object storage.
- API/worker ↔ external AI providers and email/push services.
- Platform operations/Super Admin ↔ control plane and film data plane.
- CI/CD ↔ source, dependencies, secrets, infrastructure and signed artifacts.
- Primary region ↔ encrypted backups/disaster-recovery location.

Every boundary authenticates, authorizes, validates size/schema and records a redacted outcome. A trusted network location never substitutes for authorization.

## 3. Actors

- Anonymous visitor.
- Authenticated film member with one or more film-scoped roles.
- Film Owner/Film Admin.
- Platform Super Admin and limited support/security operators.
- Revoked or suspended former member with an offline copy.
- Compromised browser/device/session.
- Malicious invited collaborator.
- External provider, webhook sender or supply-chain dependency.
- Internal operator acting incorrectly or maliciously.

## 4. Primary threats and controls

| Threat | Boundary/asset | Required controls | Acceptance evidence |
|---|---|---|---|
| Cross-film/organization disclosure | API, database, WS, files, exports, jobs | Server-derived tenant context; film membership on every operation; composite FKs; scoped repositories plus RLS defense; signed object access; room reauthorization | Negative read/write/list/search/export/download/WS/job tests for two tenants |
| IDOR/BOLA using guessed UUID | Every film resource | UUID is identifier only; permission check on parent film and target; not-found masking where appropriate | Automated authorization matrix against every route and worker |
| Stolen/replayed authorization code or refresh token | Identity/session | Authorization Code + PKCE S256, exact redirect URIs, state/nonce, short access TTL, hashed rotated refresh credentials, replay-family revocation, device revoke | PKCE downgrade, redirect, refresh replay, logout and revoke tests |
| Shared/admin credentials | Identity | Individual accounts; MFA for Super Admin/film administrators; no shared passwords; session/device inventory | MFA policy and concurrent-session/revoke tests |
| Super Admin content overreach | Operations/data plane | No implicit film-content permission; time-bound film/permission-scoped break-glass grant, reason, audit, owner-visible history; provider secrets never viewable | Negative default-access test and complete break-glass lifecycle test |
| Offline replay/double creation | Sync | Unique `opId`, `(deviceId, clientSequence)`, idempotency ledger, auth on every retry, transactional revision allocation | Duplicate/out-of-order/reconnect tests without duplicate entities/charges |
| Silent conflict/data loss | Sync/editor | Local durable transaction before save state; per-scene Yjs text; structured optimistic versions/field history; explicit conflicts; recover delete-versus-edit | Partition, crash, same-field, reorder and delete/edit corpus |
| Malicious CRDT/update payload | API/WS/PostgreSQL | Membership, scene/film match, size/rate limits, valid binary decoding, schema/projection validation, bounded compaction | Fuzz, oversized, corrupt and cross-scene update tests |
| Revoked member continues network access | All online paths | Membership checked on REST, WS join/rejoin, workers, signed files and sync push; session/device revoke when warranted | Revoke mid-session/mid-job tests |
| Local screenplay theft | Mobile/web | SQLCipher native mobile store, key in Keychain/Keystore, screen/app lock policy; web limitation disclosed; no content in logs | File-at-rest inspection, key-loss/reinstall tests, telemetry scan |
| Provider/API-key leakage | AI | Server-only KMS envelope encryption; write-only/masked secrets; scoped service role; no key in client/database logs; rotation/revoke | Secret scan, API response/log inspection, provider failure tests |
| AI sends unapproved or changed content | AI gateway | Exact version/content-hash consent manifest; execution-time hash verification; provider/model/cost binding; explicit user approval | Mutation of any manifest field blocks job before provider call |
| Prompt injection from film/knowledge files | AI/knowledge | Treat content as untrusted data; fixed system policy; tool allowlist; no autonomous document apply; cited proposal; human accept | Adversarial corpus and forbidden-tool/data-scope tests |
| Hostile import/attachment | File/parser/worker | Pre-signed quarantine upload; MIME sniff; extension mismatch rejection; byte/decompression/page limits; sandbox parser; malware hook; no active content | Zip bomb, polyglot, malformed document and path traversal corpus |
| Signed URL leakage | Files/exports | Short TTL, scoped object key, authorization before issuance, response headers, no public bucket, revoke/delete behavior | Cross-user use, expiry, cache and deleted-object tests |
| SQL/NoSQL/command injection | API/workers | Schema validation, parameterized SQL, safe process APIs, no user-controlled shell, content escaping | SAST plus injection corpus |
| XSS/CSRF/session fixation | Web/BFF | HttpOnly Secure SameSite cookie, CSRF token/origin checks, CSP, sanitization, no refresh token in JS storage, session rotation | Browser security tests and CSP report review |
| WS event spoofing/room enumeration | Realtime | Short-lived authenticated connection, server-derived film room, authorize join and periodically/reconnect, schema/size/rate limits, REST pull authoritative | Unauthorized join/event and reconnect-gap tests |
| Job/webhook replay | Worker/integrations | Signed webhook validation, timestamp window, idempotency key/event ledger, least-privilege queue payloads | Duplicate/old/invalid signature tests |
| Backup/ransomware/data corruption | Data plane | Encrypted immutable backup, PITR, separate permissions, restore drills, local recovery/export | Scheduled corruption and restore exercises |
| Supply-chain/build compromise | CI/CD/clients | Lockfile, allowlisted build scripts, SBOM, provenance/signing, secret/dependency/license scans, protected releases | Reproducible build and artifact-verification gate |
| Sensitive telemetry | Logs/analytics/crash | Allowlisted metadata, request/correlation IDs, content/secret redaction, short retention, access control | Automated canary-secret and Telugu screenplay log scans |
| Denial of service/cost exhaustion | Public/API/AI/export | Layered rate/size/queue/tenant quotas, WAF where applicable, timeouts/cancel, cost ceiling, backpressure | Load/abuse and queue saturation tests |

## 5. Identity and session requirements

- Follow OAuth 2.0 Security Best Current Practice: Authorization Code, PKCE S256, exact redirect matching, CSRF/state/nonce protection and refresh-token replay detection.
- Browser access uses a BFF/session cookie. Browser JavaScript never receives a long-lived refresh credential.
- Native refresh credentials are device-bound where supported, stored in platform secure storage, hashed at rest server-side, rotated on every use, and revoked as a family on replay.
- Access tokens are audience/scoped and short-lived. Password change, security recovery, suspension and administrator action can revoke sessions.
- MFA is mandatory for platform administrators and Film Owner/Admin accounts before production. Recovery never bypasses audit or tenant checks.

## 6. Super Admin operating model

Super Admin is a control-plane role, not a universal film role. Default access is limited to service metadata: account/film identifiers, membership counts, storage totals, job state, health, security events and audit metadata. Screenplay content, private files, AI payloads and provider secrets are unavailable by default.

Break-glass content access requires a support/security case, reason, target film, narrow permission set, expiry, MFA/re-authentication and immutable audit. Access auto-expires and appears in the Film Owner's access history unless a documented legal restriction applies. Break-glass never reveals stored AI provider secrets.

## 7. Security verification and release policy

- Threat model reviewed when a trust boundary, provider, file format, identity flow or administrator capability changes.
- No production release with an unresolved critical/high finding unless risk is explicitly accepted by the product owner and CTO with compensating control and expiry; tenant leakage, auth bypass, remote code execution, secret exposure and unrecoverable data loss are never routine exceptions.
- External penetration test before G9 and after material identity/tenant architecture changes.
- Dependency/SBOM/license/secret/SAST checks on every release candidate.
- Mobile validation maps to current OWASP MASVS categories; web/API validation maps to current OWASP ASVS controls.

## 8. Open decisions

- Final identity provider and recovery experience.
- Owner-approved content/deletion/backup retention and revoked-member local-copy policy.
- Support/legal contact and notification rules for break-glass access.
- Production infrastructure budget and DR activation level.
- Whether minors/education use introduces additional privacy requirements.

