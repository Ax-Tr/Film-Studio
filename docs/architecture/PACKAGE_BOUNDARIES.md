# Package boundaries

| Workspace | Owns | Must not own |
|---|---|---|
| `apps/web` | Browser UI, web adapters, BFF boundary | Canonical authorization or duplicated domain policy |
| `apps/mobile` | Android/iOS UI and native adapters | Server secrets or authoritative permissions |
| `apps/api` | HTTP/WS entry points, policy enforcement, transactions | Long-running export/AI work |
| `workers/jobs` | Idempotent asynchronous jobs | Trusting queued caller permissions without revalidation |
| `packages/contracts` | Runtime schemas and transport envelopes | Framework, storage or UI code |
| `packages/domain` | Stable entities and pure rules | React, NestJS or persistence drivers |
| `packages/screenplay-model` | Typed screenplay AST and migrations | UI rendering or database access |
| `packages/sync-core` | Operation/cursor/conflict state types | Network/storage implementations |
| Remaining shared packages | Narrow cross-platform protocols/tokens/fixtures | Platform UI components |

Client-side checks improve experience but never authorize data access. API and worker paths must resolve film-scoped permissions at execution time. Super Admin remains outside film membership and cannot silently read film content.
