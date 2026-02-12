-- 001_create_wallets.sql
-- Wallets table: Stores XRPL accounts and encrypted secret keys

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

COMMENT ON TABLE wallets IS 'XRPL wallet information and encrypted secret keys';
COMMENT ON COLUMN wallets.owner_type IS 'Wallet owner type: user or issuer';
COMMENT ON COLUMN wallets.owner_id IS 'Wallet owner identifier';
COMMENT ON COLUMN wallets.xrpl_address IS 'XRPL address (public key)';
COMMENT ON COLUMN wallets.encrypted_secret IS 'Secret key encrypted with AES-256-GCM';
COMMENT ON COLUMN wallets.encryption_key_id IS 'For future KMS use (currently NULL)';
COMMENT ON COLUMN wallets.encryption_context IS 'Encryption metadata (IV, auth tag, etc.)';
