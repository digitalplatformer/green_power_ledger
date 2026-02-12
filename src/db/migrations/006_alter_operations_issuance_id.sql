-- 006_alter_operations_issuance_id.sql
-- Make issuance_id nullable in operations table
-- For mint operations, issuance_id is unknown until first step completes

ALTER TABLE operations
  ALTER COLUMN issuance_id DROP NOT NULL;

COMMENT ON COLUMN operations.issuance_id IS 'MPT Issuance ID (set after first step completes for mint operations)';
