-- 004_create_operation_steps.sql
-- Operation Steps table: Individual transaction steps within an operation

CREATE TYPE step_status AS ENUM (
  'PENDING',
  'SUBMITTED',
  'PENDING_VALIDATION',
  'VALIDATED_SUCCESS',
  'VALIDATED_FAILED',
  'TIMEOUT'
);

CREATE TABLE IF NOT EXISTS operation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  step_no INTEGER NOT NULL CHECK (step_no >= 1 AND step_no <= 3),
  kind TEXT NOT NULL,
  wallet_id UUID REFERENCES wallets(id),
  tx_type TEXT NOT NULL,
  tx_hash TEXT,
  submit_result JSONB,
  validated_result JSONB,
  status step_status NOT NULL DEFAULT 'PENDING',
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operation_steps_operation ON operation_steps(operation_id, step_no);
CREATE INDEX idx_operation_steps_status ON operation_steps(status);
CREATE INDEX idx_operation_steps_pending_validation
  ON operation_steps(status)
  WHERE status = 'PENDING_VALIDATION';

COMMENT ON TABLE operation_steps IS 'Individual transaction steps within an operation';
COMMENT ON COLUMN operation_steps.operation_id IS 'Parent operation ID';
COMMENT ON COLUMN operation_steps.step_no IS 'Step number (1, 2, 3)';
COMMENT ON COLUMN operation_steps.kind IS 'Step type (e.g., ISSUER_MINT, USER_AUTHORIZE)';
COMMENT ON COLUMN operation_steps.wallet_id IS 'Wallet ID executing this step (NULL for issuer steps)';
COMMENT ON COLUMN operation_steps.tx_type IS 'XRPL transaction type';
COMMENT ON COLUMN operation_steps.tx_hash IS 'XRPL transaction hash';
COMMENT ON COLUMN operation_steps.submit_result IS 'Submit result (JSON)';
COMMENT ON COLUMN operation_steps.validated_result IS 'Validation result (JSON)';
COMMENT ON COLUMN operation_steps.status IS 'Step status';
COMMENT ON COLUMN operation_steps.last_checked_at IS 'Last validation check timestamp';
