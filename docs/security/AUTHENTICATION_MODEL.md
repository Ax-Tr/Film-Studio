# STORYFORGE STUDIO — Authentication and tenant security model

**Status:** S4 implementation baseline; staging/provider acceptance pending  
**Date:** 13 November 2026

## 1. Trust and identity

- The OIDC provider authenticates a person and returns signed identity claims.
- Film Studio resolves identities only by the exact `(issuer, subject)` pair.
- A newly observed pair creates a separate Film Studio user. Matching email does not auto-link accounts.
- Provider email is retained as a claim and can authorize invitation acceptance only when `email_verified=true` and it exactly matches the normalized invitation email.
- Provider tokens are exchanged server-side and are neither persisted nor returned to Film Studio clients.

## 2. Authorization flow

1. Generate cryptographically random state, nonce, PKCE verifier, and browser/app binding.
2. Persist only hashes plus an AES-GCM-encrypted verifier in a short-lived, single-use transaction.
3. Send an Authorization Code request with PKCE S256 and the configured exact redirect URI.
4. On callback, atomically consume the transaction and verify state, binding, expiry, redirect URI, nonce, issuer, and provider response.
5. Resolve/provision the individual identity and device.
6. Issue Film Studio opaque access and refresh credentials; persist only their hashes.
7. Record the successful security event without identity claims, credentials, email, IP, or user-agent plaintext.

## 3. Session behavior

| Control            | Implemented behavior                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Browser storage    | HttpOnly, SameSite=Lax, path `/`; `Secure` and `__Host-` prefix required outside local/test |
| Browser CSRF       | Configured exact origin required for cookie-authenticated unsafe methods                    |
| Native storage     | Opaque token contract only; Keychain/Keystore integration remains a signed-device gate      |
| At-rest credential | SHA-256 hash only                                                                           |
| Refresh            | Single-use rotation of access and refresh credentials                                       |
| Replay             | Consumed-token reuse revokes every session in the family                                    |
| Logout/revoke      | Immediate server-side session revocation                                                    |
| Device revoke      | Revokes all active sessions for that user/device                                            |
| Audit failure      | New/refreshed session is revoked rather than returned unaudited                             |

Configured defaults are local development values, not business policy. Staging/production values are deployment configuration and must be approved from measured risk and provider capabilities.

## 4. Tenant model

- A user can own/administer organizations and create films within an authorized organization.
- Every film member has an individual user and active `(film_id, user_id)` membership.
- Film roles and permissions are data, not UI constants. Multiple roles and per-member allow/deny overrides are supported; explicit deny wins, including against ownership.
- Film Owner receives wildcard authority only while the membership, account, device, and session are active.
- Every scoped repository sets transaction-local user/film context. PostgreSQL row-level policies provide defense in depth.
- Super Admin is a separate future control-plane capability and receives no implicit film-content access.

## 5. Invitations

1. An active member with `film.members.manage` requests an invitation for an email and zero or more film role IDs.
2. The API creates a 256-bit token and returns it once to the delivery boundary; only its SHA-256 hash is stored.
3. The database ensures role assignments belong to the same film and allows only one pending invitation per normalized film/email pair.
4. Acceptance requires an authenticated identity with the exact verified provider email.
5. Acceptance atomically activates membership, assigns invitation roles, and consumes the invitation.
6. Audit data includes IDs, action, outcome, request correlation and role count only—never email or token.

Transactional email integration is intentionally not fabricated. Provider/domain/sender ownership and delivery policy are required before an invitation can be delivered to a real user.

## 6. Audit and privacy

- Audit events use allowlisted scalar metadata; keys suggesting screenplay content, prompts, names, email, keys, secrets or tokens are rejected.
- Source IP and user-agent are one-way hashed before storage.
- Authentication, logout, refresh, organization creation, film creation, invitation issuance and invitation acceptance produce security audit events.
- API errors expose stable safe codes and request IDs, not database/provider messages.

## 7. Remaining acceptance work

- Approve login/recovery methods and select/configure the staging identity provider.
- Prove web and Android/iOS login, logout, refresh replay, device revoke, recovery and MFA against that provider.
- Define and enforce administrator MFA/recent-reauthentication policy.
- Run migrations and cross-tenant negative tests against pinned real PostgreSQL using a `NOBYPASSRLS` runtime role and production-like grants.
- Select and configure transactional email; prove single delivery, expiry, resend/revoke and abuse controls.
- Approve the default film role matrix and test every implemented route against it.
- Add rate limits and alerts for authentication and invitation abuse before public exposure.
