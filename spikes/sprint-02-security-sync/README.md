# Sprint 02 security and sync reference model

Disposable executable evidence for S2 architecture decisions, not production service code.

Checks:

- Film-scoped role bundles and per-film differences.
- Explicit allow/deny override behavior and revocation.
- Super Admin default denial and scoped break-glass access.
- Deterministic AI consent manifest hashing and execution mismatch rejection.
- Sync idempotency, device-sequence reuse, safe non-overlapping field merge, same-field conflict, delete-versus-edit, revoked membership, cursor paging and compaction safety.

Run:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

The authoritative design documents are under the repository `docs/` folder. This model intentionally omits database/network/framework code until the production monorepo sprint.

