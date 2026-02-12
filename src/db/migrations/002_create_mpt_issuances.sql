-- 002_create_mpt_issuances.sql
-- MPT Issuances table: Tracks MPT definitions

CREATE TABLE IF NOT EXISTS mpt_issuances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuance_id TEXT NOT NULL UNIQUE,
  flags INTEGER NOT NULL DEFAULT 96,
  can_transfer BOOLEAN NOT NULL DEFAULT TRUE,
  can_clawback BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mpt_issuances_issuance_id ON mpt_issuances(issuance_id);

COMMENT ON TABLE mpt_issuances IS 'MPT issuance information';
COMMENT ON COLUMN mpt_issuances.issuance_id IS 'MPT identifier returned from XRPL';
COMMENT ON COLUMN mpt_issuances.flags IS 'MPT flags (default 96 = 64(clawback) + 32(transfer))';
COMMENT ON COLUMN mpt_issuances.can_transfer IS 'Whether MPT is transferable';
COMMENT ON COLUMN mpt_issuances.can_clawback IS 'Whether MPT can be clawed back';
COMMENT ON COLUMN mpt_issuances.metadata IS 'MPT metadata (JSON)';
