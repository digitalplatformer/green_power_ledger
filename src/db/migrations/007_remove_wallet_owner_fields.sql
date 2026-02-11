-- Migration 007: Remove wallet owner fields
--
-- Removes owner_type and owner_id columns from wallets table.
-- Issuer wallet is now managed via .env (ISSUER_SEED) and not stored in DB.
-- User wallets are identified by UUID id only.

-- Drop composite index on owner fields
DROP INDEX IF EXISTS idx_wallets_owner;

-- Drop owner_type column
ALTER TABLE wallets DROP COLUMN IF EXISTS owner_type;

-- Drop owner_id column
ALTER TABLE wallets DROP COLUMN IF EXISTS owner_id;

-- Add table comment documenting the change
COMMENT ON TABLE wallets IS 'User wallets only. Issuer wallet managed via .env (not stored in DB). Each wallet identified by UUID id field.';
