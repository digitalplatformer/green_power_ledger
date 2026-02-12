-- 005_create_wallet_locks.sql
-- Wallet Locks table: For distributed locking (future use)

CREATE TABLE IF NOT EXISTS wallet_locks (
  wallet_id UUID PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  locked_by TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_wallet_locks_expires ON wallet_locks(expires_at);

COMMENT ON TABLE wallet_locks IS 'Wallet locks (for distributed locking, currently unused)';
COMMENT ON COLUMN wallet_locks.wallet_id IS 'Wallet ID to lock';
COMMENT ON COLUMN wallet_locks.locked_by IS 'Process/session ID holding the lock';
COMMENT ON COLUMN wallet_locks.locked_at IS 'Lock acquisition timestamp';
COMMENT ON COLUMN wallet_locks.expires_at IS 'Lock expiration timestamp';
