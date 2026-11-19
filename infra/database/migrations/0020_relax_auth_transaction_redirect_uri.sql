-- Migration 0020: Relax redirect_uri check constraint on auth_transactions to support HTTP on staging/ALB and HTTPS
ALTER TABLE auth_transactions DROP CONSTRAINT IF EXISTS auth_transactions_redirect_uri_check;
ALTER TABLE auth_transactions ADD CONSTRAINT auth_transactions_redirect_uri_check CHECK (redirect_uri ~ '^https?://');
