# STORYFORGE STUDIO — Film Permission Model

**Status:** S2 technical baseline; product-owner role defaults pending approval  
**Date:** 13 November 2026

## 1. Model

- Each person has an individual identity.
- Access is a membership `(film_id, user_id)` with one or more data-defined roles.
- A user can have different roles in different films.
- Role bundles grant permissions; audited per-member allow/deny overrides support exceptions. Explicit deny wins.
- Revoked membership grants no online permission.
- API, worker, WebSocket, files, exports and AI enforce the same server-side policy.
- UI visibility is convenience only and never the security boundary.

## 2. Default role summary

Legend: `M` manage/edit, `R` read/use, `A` approve/lock, `-` not granted by default. Fine-grained permissions remain authoritative.

| Role | Members/settings | Creative | Approve/lock | Production/schedule | Budget | AI | Export/files | Audit |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Film Owner | M | M | A | M | M/A | M/configure | M | R |
| Film Admin | M | M | A | M | M/A | M/configure | M | R |
| Director | - | M | A | R | - | R/use | R/create | - |
| Producer | M | R/comment | A via workflow | M | M/A | R/use | M | R |
| Screenwriter | - | M | - | - | - | R/use | Draft export | - |
| Co-writer | - | M | - | - | - | R/use | - | - |
| Dialogue Writer | - | Dialogue edit | - | - | - | R/use | - | - |
| Script Editor | - | M/review | Optional | - | - | R/use | Draft export | - |
| Production Manager | - | R/comment | - | M | R/M | - | Production export | - |
| Reviewer | - | R/comment | - | - | - | - | - | - |

Film Admin cannot transfer ownership or permanently erase the film by default. Film Owner transfer/delete actions require recent reauthentication and additional confirmation.

## 3. Permission catalogue

The canonical catalogue is the set already recorded in `PRODUCT_INPUTS_REQUIRED.md` and exercised by the S2 reference policy. It includes film administration, creative read/edit/approve/lock, characters/scenes/continuity, comments, production, schedule, budget, AI, files, exports and audit permissions.

Block-level dialogue restriction is a domain authorization rule, not merely a hidden toolbar. If approved, `dialogue_writer` edits only allowed block types and related character-voice metadata; server operations reject broader edits.

## 4. Decision order

For every operation:

1. Authenticate identity/session/device.
2. Reject suspended/deleted account or revoked device/session.
3. Resolve target resource to its canonical film.
4. Load active membership and role/override policy at the current revision.
5. Apply explicit deny, resource/state rules and workflow constraints.
6. Require recent reauthentication/MFA for high-risk actions.
7. Execute transaction and record redacted audit outcome.

High-risk actions include ownership transfer, deletion request, member/admin changes, AI-provider configuration, confidential export, budget approval and break-glass grant.

## 5. Platform administration

Super Admin is outside film membership and has no automatic film-content permission. Operational actions (account suspension, session revoke, job retry, malicious-file quarantine) use separate platform permissions. Content access requires a scoped, expiring break-glass grant with reason, MFA and audit.

## 6. Required tests

- Every route/event/job/file/export crossed with every role and unauthenticated/revoked cases.
- Same user with different roles in two films.
- Allow/deny override precedence.
- Role change during active browser/WS/mobile session.
- Revocation while offline and during export/AI jobs.
- Block-level Dialogue Writer restrictions if approved.
- Film Owner transfer and last-owner invariant.
- Super Admin default denial, expired/wrong-film/wrong-permission break-glass, and owner-visible audit.

## 7. Owner approvals still required

- Whether Producer edits screenplay by default.
- Whether Director reads/edits budget by default.
- Who approves/locks creative versions.
- Who exports confidential files.
- Dialogue Writer block restriction.
- Meaning of “Editor”: Script Editor only or an additional picture/video Editor role.

