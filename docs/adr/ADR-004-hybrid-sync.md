# ADR-004 — Per-scene CRDT text plus structured operations

**Status:** Accepted for implementation baseline  
**Date:** 13 November 2026

## Decision

- Use one Yjs document per scene for collaborative screenplay text.
- Use typed, idempotent operations with optimistic versions and field history for metadata, ordering, deletion, roles, budgets, approvals and other structured state.
- REST push/pull/ack is authoritative; WebSocket events accelerate updates but do not replace recovery pull.
- Same-field, incompatible reorder and delete-versus-edit cases create explicit conflicts.
- Restore creates a new immutable version.

## Rationale

Yjs provides convergent, order-independent/idempotent text updates, while structured film data needs business validation, authorization and user-visible conflict semantics. A single global CRDT would increase authorization, compaction and large-film failure scope.

The S1 Yjs harness and S2 sync reference model provide executable feasibility evidence. Mobile editor binding remains separately gated by ADR-005.

## Consequences

- Server stores updates/snapshots and rebuildable block projections.
- Clients maintain durable outbox, cursor, base state and conflict recovery.
- Text convergence does not remove revision review or semantic-conflict UX.
- Compaction cannot strand active supported devices.

