# STORYFORGE STUDIO — Hosting Direction

**Status:** Provisional CTO selection; cost approval required before provisioning  
**Date:** 13 November 2026

## Decision

Use AWS managed infrastructure as the production target, with India as the initial data geography unless the product owner selects another launch market/requirement.

- Primary region candidate: Asia Pacific (Mumbai), `ap-south-1`, multi-AZ for stateful production services.
- Disaster-recovery candidate: Asia Pacific (Hyderabad), `ap-south-2`, after service availability and budget validation.
- Containerized API/worker and independently deployed Next.js web.
- Managed PostgreSQL with PITR, managed Redis-compatible service, private S3 object storage, KMS/Secrets Manager, CDN/WAF/TLS and centralized redacted observability.
- Infrastructure as code, separate development/staging/production accounts/environments, least-privilege roles and immutable artifacts.

No resource is provisioned until monthly development/production budget and account ownership are approved. The local developer stack remains vendor-neutral PostgreSQL/Redis/S3-compatible so the domain is not coupled to AWS SDKs.

## Rationale

The architecture requires managed relational durability, Redis queues, private object storage, key management, multi-AZ operation, backups and auditable access. AWS provides primary and potential DR regions in India and the required managed building blocks. The decision favors operational maturity/security over the lowest possible prototype cost.

## Constraints

- Product owner must own the cloud account, billing contact, domain and recovery contacts.
- Service/region availability and actual pricing are validated immediately before provisioning.
- Identity remains standards-based OIDC; final identity provider is evaluated separately.
- No cross-region film data replication until location, cost and privacy implications are approved.
- Production access uses SSO/MFA and no long-lived developer access keys.

## Reconsider when

- Approved budget cannot support the required managed baseline.
- Launch market/data-location needs differ.
- A vendor-neutral managed provider demonstrates equivalent security, PITR, private networking, KMS, audit and recovery at materially lower operational risk/cost.

