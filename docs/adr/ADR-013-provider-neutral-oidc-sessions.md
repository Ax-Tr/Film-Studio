# ADR-013 — Provider-neutral OIDC and application sessions

**Status:** Accepted technical baseline; identity provider selection remains open  
**Date:** 13 November 2026

## Context

Film Studio requires browser and Android/iOS authentication, individual identities, film-scoped access, device/session revocation, and strong replay protection. The product owner has not selected the final login methods, recovery experience, identity vendor, domain, or mobile application identifiers. Selecting or embedding a vendor now would turn unresolved product and operational inputs into code.

## Decision

1. Integrate identity providers through standards-based OpenID Connect discovery and Authorization Code flow with PKCE S256.
2. Require exact configured redirect URIs, state, nonce, an encrypted one-time PKCE verifier, and a separate browser/app transaction binding.
3. Treat `(issuer, subject)` as the external identity key. A matching email never silently links two identities.
4. Issue Film Studio opaque application sessions after OIDC validation. Persist only SHA-256 token hashes; never persist or expose provider access/refresh tokens.
5. Use short-lived HttpOnly SameSite cookies for the browser and opaque tokens for native clients. Cookie-authenticated state changes require the configured web origin.
6. Rotate access and refresh credentials together. Reuse of a consumed refresh token revokes its full session family.
7. Bind every session to one user and device. Account, device, session, and film-membership status remain server-authoritative.
8. Keep OIDC issuer, client, secret, redirect URIs, cookie policy, and session lifetimes in validated deployment configuration. Staging and production fail startup when required values are absent.
9. Keep provider choice provisional until login/recovery policy, operational ownership, region, service limits, MFA support, and staging evidence are approved.

## Consequences

- A standards-conforming OIDC provider can be evaluated without changing Film Studio tenancy or authorization rules.
- The provider proves identity; Film Studio owns devices, sessions, film memberships, permissions, and security audit.
- Email ownership is used only to accept an invitation when the provider marks that exact email verified.
- Browser JavaScript cannot read the session credentials.
- Native secure-storage integration and provider-hosted MFA/recovery still require device and staging acceptance.
- Authentication/audit writes are fail-closed: if a login or refresh success cannot be audited, the issued application session is revoked.

## Security references

- [OAuth 2.0 Security Best Current Practice (RFC 9700)](https://datatracker.ietf.org/doc/html/rfc9700)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)

## Rejected alternatives

- Application-managed passwords before recovery, breach-response, and email-ownership policy are approved.
- Email-only account linking, because it can merge unrelated or compromised provider identities.
- Provider tokens as Film Studio authorization credentials, because tenant/session policy must remain application-controlled.
- Refresh credentials in browser JavaScript storage.
- Hard-coded provider URLs, client IDs, callback identifiers, role bundles, or session durations.
