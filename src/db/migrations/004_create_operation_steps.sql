-- 004_create_operation_steps.sql
-- Operation Steps テーブル: 操作内の個別トランザクションステップ

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
  wallet_id UUID NOT NULL REFERENCES wallets(id),
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

COMMENT ON TABLE operation_steps IS '操作内の個別トランザクションステップ';
COMMENT ON COLUMN operation_steps.operation_id IS '親操作 ID';
COMMENT ON COLUMN operation_steps.step_no IS 'ステップ番号（1, 2, 3）';
COMMENT ON COLUMN operation_steps.kind IS 'ステップの種類（例: ISSUER_MINT, USER_AUTHORIZE）';
COMMENT ON COLUMN operation_steps.wallet_id IS 'このステップを実行するウォレット ID';
COMMENT ON COLUMN operation_steps.tx_type IS 'XRPL トランザクションタイプ';
COMMENT ON COLUMN operation_steps.tx_hash IS 'XRPL トランザクションハッシュ';
COMMENT ON COLUMN operation_steps.submit_result IS '送信結果（JSON）';
COMMENT ON COLUMN operation_steps.validated_result IS '検証結果（JSON）';
COMMENT ON COLUMN operation_steps.status IS 'ステップステータス';
COMMENT ON COLUMN operation_steps.last_checked_at IS '最後に検証チェックを行った時刻';
