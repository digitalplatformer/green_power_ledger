-- 003_create_operations.sql
-- Operations table: Logical operation units (mint/transfer/burn)

CREATE TYPE operation_status AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'SUCCESS',
  'FAILED'
);

CREATE TYPE operation_type AS ENUM (
  'mint',
  'transfer',
  'burn'
);

CREATE TABLE IF NOT EXISTS operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type operation_type NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  issuance_id TEXT NOT NULL,
  from_wallet_id UUID REFERENCES wallets(id),
  to_wallet_id UUID REFERENCES wallets(id),
  amount NUMERIC(78, 0) NOT NULL,
  status operation_status NOT NULL DEFAULT 'PENDING',
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operations_status ON operations(status);
CREATE INDEX idx_operations_idempotency ON operations(idempotency_key);
CREATE INDEX idx_operations_created ON operations(created_at DESC);
CREATE INDEX idx_operations_issuance ON operations(issuance_id);

COMMENT ON TABLE operations IS 'Logical operation tracking (mint/transfer/burn)';
COMMENT ON COLUMN operations.type IS 'Operation type: mint, transfer, burn';
COMMENT ON COLUMN operations.idempotency_key IS 'Idempotency key (unique constraint)';
COMMENT ON COLUMN operations.issuance_id IS 'MPT Issuance ID';
COMMENT ON COLUMN operations.from_wallet_id IS 'Source wallet (issuer for mint, holder for burn)';
COMMENT ON COLUMN operations.to_wallet_id IS 'Destination wallet (for mint/transfer)';
COMMENT ON COLUMN operations.amount IS 'MPT amount for operation (128-bit precision)';
COMMENT ON COLUMN operations.status IS 'Operation status';
COMMENT ON COLUMN operations.error_code IS 'Error code (on failure)';
COMMENT ON COLUMN operations.error_message IS 'Error message (on failure)';
