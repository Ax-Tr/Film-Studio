# STORYFORGE STUDIO — Privacy and IP Impact Assessment

**Status:** S2 baseline; owner/legal inputs pending  
**Date:** 13 November 2026

## 1. Principles

- Film content and intellectual property remain private to authorized film members.
- Collect the minimum personal and operational data needed for identity, collaboration, security, support and product operation.
- Core writing works without AI. No film content is sent to an AI provider without exact-scope preview and explicit approval.
- No screenplay dialogue, provider key or full private document in analytics, logs or crash reports.
- Users can export their authorized data; owners can request film deletion subject to approved recovery/legal-hold policy.
- Administrator access is least-privilege, exceptional content access is audited and visible.

## 2. Data inventory

| Category | Examples | Purpose | Access |
|---|---|---|---|
| Identity | Email, display name, locale, auth subject, MFA/session/device metadata | Sign-in, recovery, security | User, scoped admins, identity service |
| Membership | Film, roles, invitations, approval authority | Authorization/collaboration | Film Owner/Admin and platform policy services |
| Creative IP | Screenplays, drafts, notes, characters, story data, comments | Product core | Authorized film members only |
| Production IP | Breakdown, schedules, budgets, files, reports | Film production | Role/permission scoped |
| Offline data | Materialized film state, outbox, base snapshots | Offline writing/recovery | Device user; encrypted on mobile |
| AI | Provider configuration metadata, encrypted secret, consent manifest, selected context, proposal, usage | Optional AI features | Authorized film members; secret write-only |
| Operations | Request IDs, job status, timings, error codes, audit events | Reliability/security/support | Restricted platform operators |
| Backups | Encrypted database/object snapshots | Recovery | Backup/restore roles only |

## 3. Data flow constraints

1. Client sends only authenticated film-scoped operations.
2. API derives tenant/film context from the target resource and membership; client-supplied organization/film labels are never proof of authorization.
3. Private objects remain non-public; downloads are short-lived and authorized before URL issuance.
4. Worker jobs carry identifiers, not unnecessary screenplay bodies. Workers reauthorize before reading current data or publishing output.
5. AI gateway builds the provider payload from the approved version/hash manifest immediately before transmission and aborts if it changed.
6. Telemetry uses allowlisted metadata and content redaction at source.

## 4. Retention status

Exact durations require owner approval. Until approved, production data must not be assigned invented purge periods. S0 must decide:

- Active and revoked session/device retention.
- Invitation and security-log retention.
- Deleted scene/document/film recovery window.
- Offline recovery window after membership revocation.
- AI request/response and consent-record retention.
- Export/file expiry.
- Backup/PITR retention and deletion propagation.
- Audit retention and legal hold.

Deletion workflows must cover canonical rows, object files, search indexes, embeddings, derived projections, caches and provider-side deletion obligations. Backups expire through documented retention rather than unsafe in-place editing.

## 5. AI and third parties

- Provider, model, operation, selected scenes/versions, content hashes, estimated/maximum cost, notice version and retention disclosure appear before approval.
- Approval is one request scope, not perpetual consent.
- Provider terms and data use are reviewed before allowlisting.
- Provider credentials are server-side encrypted and never returned to a client.
- AI outputs are proposals with provenance; acceptance creates a normal authenticated document operation.

## 6. Administrator and support access

Routine Super Admin monitoring excludes film content. Break-glass requirements are defined in the threat model and permission policy. Every exceptional access produces an immutable audit event and owner-visible history, subject only to documented legal restrictions.

## 7. User rights and product controls

- View and revoke devices/sessions.
- View film memberships and effective roles.
- Export authorized film/account data in usable formats.
- Request account deletion and, for owners, film deletion.
- View AI history/usage/consent and delete where policy permits.
- View support/break-glass access history.
- Disable optional AI provider configuration.

## 8. Pre-production privacy gates

- Product owner identifies legal entity, launch markets, privacy contact and minor/education use.
- Privacy Policy and Terms reviewed by qualified counsel for applicable jurisdictions.
- Retention schedule approved and implemented with tests.
- AI provider data-processing terms and user notices approved.
- Mobile store privacy/data-safety declarations match actual traffic and SDK behavior.
- Data export/delete and backup-expiry drills pass.

