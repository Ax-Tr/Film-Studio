# STORYFORGE STUDIO — API Error Catalogue

**Status:** S5 implementation catalogue; later-module codes remain planned  
**Date:** 13 November 2026

All errors use the standard envelope in `API_CONVENTIONS.md`. The code is stable; human message is localizable. Retry behavior is explicit.

| HTTP | Code                              |               Retry | Meaning/client action                                                   |
| ---: | --------------------------------- | ------------------: | ----------------------------------------------------------------------- |
|  400 | `VALIDATION_FAILED`               |                  No | Show field-safe errors; retain user input                               |
|  400 | `UNSUPPORTED_SCHEMA_VERSION`      |                  No | Upgrade/migrate client before retry                                     |
|  400 | `INVALID_CURSOR`                  |                  No | Restart authorized listing/sync bootstrap                               |
|  400 | `INVALID_FILE_TYPE`               |                  No | Select supported file                                                   |
|  400 | `INVALID_OIDC_TRANSACTION`        |                  No | Restart sign-in; the state/binding/transaction is invalid or expired    |
|  400 | `INVALID_INVITATION_EXPIRY`       |                  No | Select a future invitation expiry                                       |
|  400 | `INVALID_FILM_INVITATION`         |                  No | Invitation is invalid, expired, or belongs to another verified identity |
|  400 | `MODEL_INDEX_INVALID`             |                  No | Requested scene position is outside the active document order           |
|  400 | `FILE_TOO_LARGE`                  |                  No | Reduce file or quota request                                            |
|  401 | `AUTHENTICATION_REQUIRED`         |         After login | Authenticate; do not discard local edits                                |
|  401 | `SESSION_EXPIRED`                 | After refresh/login | Refresh once; retain outbox                                             |
|  401 | `REFRESH_REPLAY_DETECTED`         |        No automatic | Revoke token family and require login/security notice                   |
|  401 | `DEVICE_REVOKED`                  |                  No | Lock network access; follow recovery policy                             |
|  401 | `INVALID_SESSION_TOKEN`           |         After login | Opaque application session is absent, invalid, revoked, or expired      |
|  401 | `REFRESH_TOKEN_REPLAY`            |        No automatic | Token family was revoked; require login and security notice             |
|  403 | `PERMISSION_DENIED`               |                  No | Disable action; retain unsent content safely                            |
|  403 | `MEMBERSHIP_REVOKED`              |                  No | Lock film and offer permitted recovery workflow                         |
|  403 | `MFA_REQUIRED`                    |           After MFA | Complete recent reauthentication/MFA                                    |
|  403 | `CONSENT_REQUIRED`                |        No automatic | Show exact provider scope/notice                                        |
|  403 | `BREAK_GLASS_REQUIRED`            |                  No | Platform operator must request scoped grant                             |
|  403 | `ACCOUNT_UNAVAILABLE`             |                  No | Account/device is suspended, deleted, or revoked                        |
|  403 | `CSRF_ORIGIN_MISMATCH`            |                  No | Browser origin is absent or differs from configured web origin          |
|  403 | `FILM_PERMISSION_DENIED`          |                  No | Active session/membership lacks the required film permission            |
|  403 | `ORGANIZATION_PERMISSION_DENIED`  |                  No | Active organization owner/admin permission is required                  |
|  404 | `RESOURCE_NOT_FOUND`              |                  No | Resource absent or tenant-safely hidden                                 |
|  404 | `MODEL_RESOURCE_NOT_FOUND`        |                  No | Canonical resource is absent or tenant-safely hidden                    |
|  409 | `IDEMPOTENCY_KEY_REUSED`          |                  No | Same key used for different request; client defect                      |
|  409 | `DEVICE_SEQUENCE_REUSE`           |                  No | Stop sync and repair device sequence state                              |
|  409 | `ENTITY_VERSION_CONFLICT`         |        No automatic | Open explicit conflict review                                           |
|  409 | `SAME_FIELD_CHANGED`              |        No automatic | Choose/merge base-local-remote                                          |
|  409 | `DELETE_VS_EDIT`                  |        No automatic | Preserve local branch and owner-mediated resolution                     |
|  409 | `SCENE_MOVE_CONFLICT`             |        No automatic | Review relative placement                                               |
|  409 | `LAST_OWNER_REQUIRED`             |                  No | Assign/transfer owner before removal                                    |
|  409 | `AI_MANIFEST_CHANGED`             |                  No | Re-preview exact content/provider/cost and consent again                |
|  409 | `FILM_INVITATION_ALREADY_PENDING` |                  No | Reuse/revoke the existing pending film/email invitation                 |
|  409 | `MODEL_VERSION_CONFLICT`          |        No automatic | Reload/rebase because the expected optimistic version is stale          |
|  409 | `MODEL_OPERATION_REUSED`          |                  No | Operation ID was previously bound to different semantic input           |
|  409 | `MODEL_ID_CONFLICT`               |                  No | Client-generated resource ID is already in use                          |
|  409 | `MODEL_SNAPSHOT_MISMATCH`         |                  No | Snapshot scene IDs/order differ from current canonical structure        |
|  410 | `SYNC_CURSOR_EXPIRED`             |       Snapshot flow | Download authenticated snapshot; retain local outbox                    |
|  410 | `DOWNLOAD_EXPIRED`                |   New authorization | Request a new signed URL                                                |
|  413 | `PAYLOAD_TOO_LARGE`               |                  No | Split bounded batch/reduce content                                      |
|  415 | `UNSUPPORTED_MEDIA_TYPE`          |                  No | Use supported content type                                              |
|  422 | `IMPORT_CLASSIFICATION_REQUIRED`  |                  No | User reviews unclassified imported content                              |
|  422 | `PROJECTION_NOT_READY`            |               Later | Wait/retry job; canonical content remains safe                          |
|  429 | `RATE_LIMITED`                    |                 Yes | Respect `Retry-After`                                                   |
|  429 | `QUOTA_EXCEEDED`                  |              Policy | Reduce usage or administrator adjusts quota                             |
|  429 | `AI_COST_LIMIT_EXCEEDED`          |        No automatic | Change approved cost/scope                                              |
|  500 | `INTERNAL_ERROR`                  |         Conditional | Retry idempotently; provide request ID to support                       |
|  503 | `DEPENDENCY_UNAVAILABLE`          |                 Yes | Backoff/jitter; local work remains queued                               |
|  503 | `JOB_QUEUE_UNAVAILABLE`           |                 Yes | Retry idempotent job request                                            |
|  507 | `STORAGE_LIMIT_REACHED`           |              Policy | Preserve local content; free/raise capacity                             |

Raw database/provider errors are mapped to stable codes and kept only in restricted redacted diagnostics.
