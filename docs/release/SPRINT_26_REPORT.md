# Sprint 26 Report: AI Proposal Workflow (Gate G6)

## Summary
- **Sprint Target**: AI Proposal Workflow with Human-in-the-Loop Consent & Review.
- **Status**: Completed & Verified.
- **Date**: 2026-11-15

## Key Deliverables
1. **Database Schema & Migrations**:
   - `infra/database/migrations/0010_ai_proposal_workflow.sql`:
     - `ai_content_manifests`: Exact snapshot of document version, selected scene/character IDs, SHA-256 context summary hash, and explicit user consent tracking (`consent_granted`, `consent_granted_at`, `status`).
     - `ai_proposals`: Generated alternatives mapped directly to manifest and target scenes/characters, side-by-side original vs. proposed text, rationales, token usage accounting, and human decision workflow (`pending`, `accepted`, `rejected`, `edited`).
     - Full Row-Level Security (RLS) enforcing tenant isolation via `app_security.has_active_film_membership(film_id)` and `app_security.has_film_permission(film_id, 'film.documents.edit')`.
2. **Contracts & DTOs**:
   - `packages/contracts/src/index.ts`:
     - Manifest lifecycle: `aiManifestOperationKindSchema`, `aiManifestStatusSchema`, `aiContentManifestSchema`, `createAiContentManifestSchema`.
     - Proposal review: `aiProposalContentTypeSchema`, `aiProposalDecisionSchema`, `aiProposalSchema`, `createAiProposalSchema`, `decideAiProposalSchema`, `aiManifestSummarySchema`.
3. **Repository Layer**:
   - `apps/api/src/database/postgres-ai-proposal.repository.ts`:
     - `PostgresAiProposalRepository`: `createManifest`, `grantConsent`, `listManifests`, `createProposal`, `listProposals`, `decideProposal`, `getManifestSummary`.
4. **Verification & Integration Test Suite**:
   - `scripts/test-ai-proposal-workflow.ts` registered as `pnpm db:test:aiproposal`.
   - Verified 11 core behaviors:
     - Manifest creation with snapshot version & SHA-256 context hash
     - Explicit consent granting state transition
     - Telugu NFC canonical Unicode text preservation across original & proposed variations
     - Auto-incrementing proposal index within manifest scope
     - Proposal ordering & indexing
     - Accept / Reject / Edit decision flows
     - Custom edited text preservation
     - Manifest aggregate summary with decision counts
     - Film-level manifest listings
     - Multi-tenant RLS isolation against unauthorized tenants/organizations
