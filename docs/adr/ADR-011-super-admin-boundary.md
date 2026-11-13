# ADR-011 — Super Admin control-plane boundary

**Status:** Accepted as security baseline; owner notification wording pending  
**Date:** 13 November 2026

## Decision

Super Admin is a platform control-plane role and receives no implicit film-content permission. Routine visibility is limited to operational metadata. Exceptional film-content access uses a narrow, reason-bound, MFA-protected, expiring break-glass grant with immutable audit and owner-visible history.

Provider secrets are never viewable through break-glass. Super Admin cannot silently edit canonical screenplay content.

## Rationale

Platform monitoring and incident response are required, but a universal content role creates unacceptable insider and credential-compromise risk for valuable film IP.

## Consequences

- Separate platform permission tables/policies from film membership.
- All REST/WS/files/jobs honor the break-glass scope/expiry.
- Support tooling displays case/reason/expiry and emits audit/security events.
- Product owner must approve notification and legal-exception policy before production.

