-- 003_create_operations.sql
-- Operations テーブル: 論理的な操作単位（mint/transfer/burn）

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

COMMENT ON TABLE operations IS '論理的な操作追跡（mint/transfer/burn）';
COMMENT ON COLUMN operations.type IS '操作タイプ: mint, transfer, burn';
COMMENT ON COLUMN operations.idempotency_key IS '冪等性キー（一意制約）';
COMMENT ON COLUMN operations.issuance_id IS 'MPT Issuance ID';
COMMENT ON COLUMN operations.from_wallet_id IS '送信元ウォレット（mint の場合は issuer、burn の場合は holder）';
COMMENT ON COLUMN operations.to_wallet_id IS '送信先ウォレット（mint/transfer の場合）';
COMMENT ON COLUMN operations.amount IS '操作対象の MPT 量（128ビット精度）';
COMMENT ON COLUMN operations.status IS '操作ステータス';
COMMENT ON COLUMN operations.error_code IS 'エラーコード（失敗時）';
COMMENT ON COLUMN operations.error_message IS 'エラーメッセージ（失敗時）';
