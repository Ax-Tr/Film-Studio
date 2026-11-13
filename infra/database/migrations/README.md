# Database migrations

The ordered runtime migrations are:

1. `0001_identity_tenant.sql` — identity, sessions, organizations, films, memberships, roles, invitations, authorization and audit.
2. `0002_canonical_content.sql` — documents, immutable versions, acts, sequences, scenes, scene order, typed block projections, characters and idempotent model mutations.

The existing root `001_core.sql` remains a design proposal and is never run automatically. The API migrator applies only numbered files in this directory, records SHA-256 checksums and holds one advisory lock.

Every accepted migration requires forward verification, a documented recovery approach and an integration test against the pinned PostgreSQL major version. PGlite exercises PostgreSQL semantics locally, but it does not replace the required PostgreSQL 18 runtime-role evidence.
