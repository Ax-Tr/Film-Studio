# ADR-009 — No billing; retain neutral quota and feature policy

**Status:** Accepted  
**Date:** 13 November 2026

## Decision

Billing, payment providers, paid subscriptions, invoices and webhook processing are outside the product scope. Do not add billing-specific routes or schema to the foundation.

Retain server-enforced, vendor-neutral capabilities for:

- Film membership/roles.
- Storage/AI/export/import/concurrency safety quotas.
- Feature flags and administrative policy.
- Future enterprise identity compatibility where later approved.

## Rationale

The product owner explicitly stated billing is not needed. Premature billing schema increases security, privacy and operational scope without serving the product. Safety/abuse quotas and authorization are still necessary and must not depend on payment state.

## Consequences

- Remove/defer `subscriptions`, billing vendor fields and payment webhooks from proposed foundation contracts/migrations.
- A future commercial model requires a new product decision, threat/privacy review and additive migrations.

