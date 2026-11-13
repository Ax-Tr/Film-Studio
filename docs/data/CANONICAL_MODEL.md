# STORYFORGE STUDIO — Canonical content model

**Status:** S5 implementation baseline; real PostgreSQL acceptance pending  
**Date:** 13 November 2026

## 1. Aggregate hierarchy

```text
Film (project/tenant boundary)
├── Documents
│   ├── Immutable document versions
│   ├── Acts
│   │   └── Sequences
│   └── Scenes (stable identity)
│       ├── Active document order
│       └── Typed block projection
└── Characters
```

`film_id` is present on every owned row. A document, act, sequence, scene or projection cannot reference an entity belonging to another film/document because the database uses composite foreign keys. A trigger additionally proves that a scene's optional sequence and act agree.

## 2. Screenplay AST version 1

```ts
type ScreenplayDocument = {
  schemaVersion: 1;
  documentId: UUID;
  scenes: Array<{
    id: UUID;
    blocks: Array<{
      id: UUID;
      type:
        | 'scene-heading'
        | 'action'
        | 'character'
        | 'dialogue'
        | 'parenthetical'
        | 'transition'
        | 'shot'
        | 'note';
      text: string;
      attributes: Record<string, string | number | boolean>;
    }>;
  }>;
};
```

Scene IDs are unique within a snapshot; block IDs are unique across the entire document. Array order is source order. Text is preserved byte-for-byte at the JavaScript string level—no case folding or Unicode normalization is performed.

## 3. Canonical and derived data

| Record                         | Classification              | Mutation rule                    |
| ------------------------------ | --------------------------- | -------------------------------- |
| Document metadata              | Canonical current state     | Optimistic version               |
| Act/sequence/scene structure   | Canonical current state     | Optimistic version and tombstone |
| Active scene order             | Canonical current state     | Transactional ordered move       |
| Document version snapshot/hash | Canonical immutable history | Insert only                      |
| Block projection               | Rebuildable derived state   | Replaced from accepted snapshot  |
| Character record               | Canonical current state     | Optimistic version and tombstone |
| Model mutation response        | Idempotency evidence        | Insert once per operation ID     |

S6 will add the canonical incremental operation/Yjs history. It must consume this identity and version model rather than create parallel document or scene identifiers.

## 4. Mutation protocol

Every offline-creatable request carries:

- client-generated resource UUID;
- client-generated `operationId` UUID;
- expected positive resource/document version where updating existing state;
- explicit target index for ordered creation/move/restore.

The server hashes the semantic request. Repeating the same operation ID and hash returns its original response. Reusing the operation ID with different input is a conflict. An expected-version mismatch is never silently overwritten.

## 5. Lifecycle and recovery

- Scene deletion sets `deleted_at`, increments scene/document versions and removes only its active order row.
- Restore clears the tombstone, re-inserts the requested active position and retains the stable scene UUID.
- Document archive is reversible metadata; document purge is not implemented.
- Immutable versions cannot be updated or deleted through runtime SQL, including by a film owner.

## 6. Implemented HTTP surface

- Create/list/get/update documents.
- Create/list/move/delete/restore scenes.
- Create immutable screenplay document versions and rebuild typed block projections.

All routes require an authenticated session and server-side `film.documents.read` or `film.documents.edit`. Defining a permission key does not grant it to any unresolved default role. Film ownership continues to allow administration unless explicitly denied.

## 7. Deferred by design

- S6: operation stream, device sequence, server revision, Yjs updates/snapshots, conflicts and stale-cursor recovery.
- S7: request size/rate limits, queues, object storage, observability and backup/restore.
- Later editor sprints: screenplay shortcuts, page/layout rules, templates, act presets and UI behavior.
- Product approval: default role grants, supported document-kind catalogue and screenplay formatting presets.
