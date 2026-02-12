-- 002_create_mpt_issuances.sql
-- MPT Issuances テーブル: MPT 定義を追跡

CREATE TABLE IF NOT EXISTS mpt_issuances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuance_id TEXT NOT NULL UNIQUE,
  issuer_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  flags INTEGER NOT NULL DEFAULT 96,
  can_transfer BOOLEAN NOT NULL DEFAULT TRUE,
  can_clawback BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mpt_issuances_issuer ON mpt_issuances(issuer_wallet_id);
CREATE INDEX idx_mpt_issuances_issuance_id ON mpt_issuances(issuance_id);

COMMENT ON TABLE mpt_issuances IS 'MPT 発行情報';
COMMENT ON COLUMN mpt_issuances.issuance_id IS 'XRPL から返される MPT 識別子';
COMMENT ON COLUMN mpt_issuances.issuer_wallet_id IS '発行者ウォレット ID';
COMMENT ON COLUMN mpt_issuances.flags IS 'MPT フラグ（デフォルト 96 = 64(clawback) + 32(transfer)）';
COMMENT ON COLUMN mpt_issuances.can_transfer IS 'MPT が転送可能かどうか';
COMMENT ON COLUMN mpt_issuances.can_clawback IS 'MPT が clawback 可能かどうか';
COMMENT ON COLUMN mpt_issuances.metadata IS 'MPT メタデータ（JSON）';
