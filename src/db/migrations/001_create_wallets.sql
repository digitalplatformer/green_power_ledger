-- 001_create_wallets.sql
-- Wallets テーブル: XRPL アカウントおよび暗号化された秘密鍵を保存

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'issuer')),
  owner_id TEXT NOT NULL,
  xrpl_address TEXT NOT NULL UNIQUE,
  encrypted_secret BYTEA NOT NULL,
  encryption_key_id TEXT,
  encryption_context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallets_owner ON wallets(owner_type, owner_id);
CREATE INDEX idx_wallets_address ON wallets(xrpl_address);

COMMENT ON TABLE wallets IS 'XRPL ウォレット情報と暗号化された秘密鍵';
COMMENT ON COLUMN wallets.owner_type IS 'ウォレット所有者タイプ: user または issuer';
COMMENT ON COLUMN wallets.owner_id IS 'ウォレット所有者の識別子';
COMMENT ON COLUMN wallets.xrpl_address IS 'XRPL アドレス（公開鍵）';
COMMENT ON COLUMN wallets.encrypted_secret IS 'AES-256-GCM で暗号化された秘密鍵';
COMMENT ON COLUMN wallets.encryption_key_id IS '将来の KMS 用（現在は NULL）';
COMMENT ON COLUMN wallets.encryption_context IS '暗号化メタデータ（IV, auth tag など）';
