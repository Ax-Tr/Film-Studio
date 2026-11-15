# Sprint 25 Delivery & Verification Report: AI Provider Gateway and Secret Controls

**Gate:** G6 — AI Studio and Film Development  
**Sprint:** S25  
**Status:** Completed & Fully Verified  
**Date:** 15 November 2026  

---

## 1. Executive Summary

Sprint 25 establishes the **AI Provider Gateway and Secret Controls** foundation for the StoryForge Studio platform. It enables enterprise-grade multi-model AI provider management (OpenAI, Anthropic, Gemini, OpenAI-compatible, and local self-hosted LLM endpoints) with AES-256-GCM KMS envelope encryption, zero-leakage credential masking, SHA-256 context hashing (preventing raw screenplay storage in telemetry/ledger), strict rate limiting (RPM), and daily spend ceilings enforced in database transactions.

All deliverables were verified against real PostgreSQL instances via PGlite with active Row-Level Security (RLS) enforcement, ensuring strict multi-tenant isolation.

---

## 2. Deliverables & Technical Architecture

### 2.1 Database Schema Migration
- File: `infra/database/migrations/0009_ai_provider_gateway.sql`
- **`ai_provider_configurations`**:
  - `provider`: `'openai'`, `'anthropic'`, `'gemini'`, `'openai_compatible'`, `'local'`.
  - `model_name`: Text identifier (e.g. `'gpt-4o'`, `'gemini-1.5-pro'`).
  - `encrypted_api_key`, `key_encryption_iv` (12-byte), `key_encryption_tag` (16-byte) using AES-256-GCM.
  - `daily_spend_limit_cents`: Configurable daily budget ceiling (default 10000 cents = $100).
  - `rate_limit_rpm`: Rate limits per minute.
  - `timeout_ms`: Configurable timeout budget.
- **`ai_usage_ledger`**:
  - Tracks `prompt_tokens`, `completion_tokens`, `total_tokens`, and `cost_cents`.
  - `operation_kind`: `'analysis'`, `'proposal'`, `'character_arc'`, `'coverage'`, `'pitch'`, `'continuity_check'`.
  - `request_hash`: 64-character SHA-256 digest of request prompt context, eliminating raw text leakage in audit logs and telemetry.
- **Row-Level Security (RLS)**:
  - Strict organizational boundary policies preventing unauthorized access to external model configurations and usage ledgers.

### 2.2 KMS Envelope Encryption & Redaction
- File: `apps/api/src/modules/ai/kms-envelope-encryption.ts`
- AES-256-GCM encryption with randomized IVs and 128-bit authentication tags.
- `maskApiKey`: Produces safe truncated prefixes (`sk-p...3221`), ensuring plain keys are never logged, returned over REST APIs, or stored on client devices.
- `hashRequest`: Produces deterministic SHA-256 payload digests for idempotency and privacy.

### 2.3 Shared Contracts & Zod Schemas
- File: `packages/contracts/src/index.ts`
- Added schemas:
  - `aiProviderTypeSchema`, `aiOperationKindSchema`
  - `aiProviderConfigSummarySchema`, `createAiProviderConfigSchema`
  - `recordAiUsageSchema`, `aiSpendSummarySchema`

### 2.4 Persistence Repository
- File: `apps/api/src/database/postgres-ai-gateway.repository.ts`
- Implements `PostgresAiGatewayRepository`:
  - `createProviderConfig`: Encrypts raw credentials with AES-256-GCM before DB insertion.
  - `listProviderConfigs`: Returns redacted configurations with masked keys.
  - `getDecryptedApiKey`: Internal backend decryption only for authorized upstream provider calls.
  - `recordUsage`: Logs token counts and cost in `ai_usage_ledger`.
  - `checkSpendAndRateLimits`: Evaluates daily spend against ceiling and flags limit exceeded status.

---

## 3. Verification & Automated Test Evidence

- **Test Suite**: `scripts/test-ai-provider-gateway.ts`
- **NPM Script**: `pnpm db:test:aigateway`
- **Verification Checks**:
  1. **Envelope Encryption & Redaction**: Created OpenAI and Gemini provider configs; verified plaintext key is not stored unencrypted and masked in all summary responses.
  2. **Internal Decryption**: Authorized backend retrieval accurately recovers plaintext credentials for model calls.
  3. **Zero Screenplay Leakage**: Tested prompt hashing with Telugu dialogue (`రాజ్యం కోసం పోరాటం మొదలైంది`), confirming only 64-char SHA-256 hash is recorded in ledger.
  4. **Spend Ceilings**: Recorded usage up to daily spend limit, verifying that `isLimitExceeded` is correctly flagged when total exceeds daily budget.
  5. **Tenant Isolation**: Verified that an unauthorized user from another organization receives 0 provider configurations.

---

## 4. Gate G6 Progress

- [x] **S25 — AI Provider Gateway and Secret Controls**: Completed and verified.
- [ ] **S26 — AI Proposal Workflow**: Next sprint.
- [ ] **S27 — AI Film Development and Pitches**: Following sprint.
