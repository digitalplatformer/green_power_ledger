-- 008_alter_operations_wallet_ids_to_text.sql
-- Change wallet_id columns from UUID to TEXT
-- Reason: Issuer steps now have NULL wallet_id (issuer is from env var)

-- Drop foreign key constraints from operations table
ALTER TABLE operations
  DROP CONSTRAINT IF EXISTS operations_from_wallet_id_fkey;

ALTER TABLE operations
  DROP CONSTRAINT IF EXISTS operations_to_wallet_id_fkey;

-- Change column types to TEXT in operations table
ALTER TABLE operations
  ALTER COLUMN from_wallet_id TYPE TEXT USING from_wallet_id::TEXT;

ALTER TABLE operations
  ALTER COLUMN to_wallet_id TYPE TEXT USING to_wallet_id::TEXT;

-- Drop foreign key constraint from operation_steps table
ALTER TABLE operation_steps
  DROP CONSTRAINT IF EXISTS operation_steps_wallet_id_fkey;

-- Change column type to TEXT in operation_steps table
ALTER TABLE operation_steps
  ALTER COLUMN wallet_id TYPE TEXT USING wallet_id::TEXT;

-- Update comments
COMMENT ON COLUMN operations.from_wallet_id IS 'Source wallet ID (TEXT: NULL for issuer, UUID string for user)';
COMMENT ON COLUMN operations.to_wallet_id IS 'Destination wallet ID (TEXT: UUID string)';
COMMENT ON COLUMN operation_steps.wallet_id IS 'Wallet ID executing this step (TEXT: NULL for issuer, UUID string for user)';
