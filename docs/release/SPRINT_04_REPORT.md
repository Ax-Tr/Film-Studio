# Sprint 04 — Identity and tenant security

**Status:** Implementation ready for review; exit gate not yet accepted  
**Date:** 13 November 2026  
**Gate note:** Executed at the product owner's explicit direction while S0/S1/S2/S3 acceptance remains open.

## 1. Delivered

| Area                | Delivered evidence                                                                                                                            | Status                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| OIDC                | Provider-neutral discovery, Authorization Code + PKCE S256, state/nonce, exact callbacks, encrypted one-time verifier and transaction binding | Code/tests complete; real provider pending                                       |
| Web sessions        | HttpOnly SameSite cookies, secure `__Host-` production names, exact-origin CSRF protection, refresh/logout                                    | Code complete; browser staging matrix pending                                    |
| Native sessions     | Android/iOS OIDC start/complete contracts, device-bound opaque sessions, rotate/logout                                                        | Server code complete; Keychain/Keystore/device UI pending                        |
| Replay/revoke       | Hashed credentials, access+refresh rotation, used-token ledger, family revocation, session/device revoke                                      | Unit evidence complete                                                           |
| Identity            | `(issuer, subject)` resolution, no email auto-link, verified-email invitation matching, account/device status enforcement                     | Code/test complete                                                               |
| Tenancy             | Users, organizations, films, memberships, roles, permissions, overrides, invitations and audit schema                                         | Migration test complete                                                          |
| Film administration | Create organization/film, list accessible films, issue/accept film invitations, assign film roles                                             | API/service/database implementation complete; delivery UI/email pending          |
| Authorization       | Server-side permission evaluator with account/session/membership gates and explicit-deny precedence                                           | Unit and migration evidence complete                                             |
| Isolation           | Transaction-local user/film scope plus PostgreSQL RLS policies                                                                                | PGlite negative evidence complete; real PostgreSQL runtime-role evidence pending |
| Audit/privacy       | Authentication and tenant mutation events; IP/agent hashing; sensitive metadata-key rejection; safe API errors                                | Unit/code evidence complete; operations retention/alerting pending               |

## 2. Verified local evidence

1. Contracts validate required staging/production OIDC configuration and reject insecure production cookies.
2. API unit suites pass 21 tests across session issue/expiry/rotation/replay/revoke, OIDC transaction and callback handling, authorization, audit privacy, tenant invitation hashing, and health.
3. Domain permission tests pass five cases, including inactive membership, suspended account, revoked session, ownership, and explicit-deny precedence.
4. Contract tests pass four environment/error/session cases; worker tests pass two health/job cases.
5. The PostgreSQL-compatible migration test applies from empty state and proves organization/film owner creation, cross-organization and cross-film isolation, owner explicit deny, rejection of the wrong verified identity, exact verified-email invitation acceptance, and role assignment.
6. The invitation service returns a 256-bit token once, persists only its SHA-256 hash, and proves that neither email nor token enters the audit event.
7. Lint and strict workspace type checking pass after the API, database, and audit wiring changes.
8. The complete sequential `pnpm check` gate passes, including production builds and 32 tests. The compiled API starts on loopback and returns a valid health envelope.
9. `pnpm install --frozen-lockfile --offline` passes after populating the pinned store. The production dependency audit reports zero high/critical findings and the previously recorded single moderate development/build-tool finding.

## 3. Security decisions

1. OIDC provider selection remains configuration, not a hard-coded vendor decision.
2. Provider tokens never become Film Studio API credentials.
3. Matching email does not link identities; invitation acceptance requires the provider's verified exact email.
4. Refresh replay revokes the entire session family.
5. Cookie-authenticated unsafe requests require the configured web origin.
6. Film authorization is server-side and data-driven; UI role labels never grant access.
7. Explicit deny takes precedence over role allow and ownership.
8. Super Admin remains outside the film data plane and is not implemented as a universal content role.
9. Invitation email/token content and provider claims are prohibited from audit metadata.

## 4. Open exit evidence

S4 remains unaccepted until all of the following are evidenced:

1. Product owner approves login/recovery methods; CTO selects and configures the provider against those requirements.
2. Real staging web, Android and iOS login succeeds with exact production-shaped redirect URIs.
3. MFA/recent-reauthentication is enforced for Film Owner/Admin and platform administrators.
4. Refresh replay, logout, account suspension and device revoke are verified end-to-end against the real provider and database.
5. The migration and isolation suite passes on pinned real PostgreSQL with a least-privilege `NOBYPASSRLS` runtime role; Docker/WSL currently prevents this local evidence.
6. Transactional email sender/domain/provider is approved and invitation delivery, resend, expiry, revoke and rate limits pass staging tests.
7. Product owner approves the default film role matrix; every S4 route is exercised for allowed and denied roles.
8. Security operations approve audit retention/access/alerts and authentication/invitation abuse controls.
9. Publish and drift-check the S4 HTTP surface from the selected authoritative contract source; the existing root OpenAPI proposal is not silently treated as runtime authority.
10. The product owner accepts ADR-013, the authentication model, and this report.

## 5. Earlier blockers retained

- S0 product/business inputs and S1 physical-device/PDF evidence remain incomplete.
- S2 security/sync baseline and S3 repository/delivery baseline remain unaccepted.
- Remote CI, branch protection and retained SBOM evidence remain pending.
- The credential/session exposure in `architecture.html` still requires owner-confirmed invalidation and quarantine/removal.

S5 must not be represented as an accepted continuation of S4 until these blockers are resolved, even if implementation is explicitly continued by exception.
