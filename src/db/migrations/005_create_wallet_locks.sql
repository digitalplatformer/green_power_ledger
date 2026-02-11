-- 005_create_wallet_locks.sql
-- Wallet Locks テーブル: 分散ロック用（将来対応）

CREATE TABLE IF NOT EXISTS wallet_locks (
  wallet_id UUID PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  locked_by TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_wallet_locks_expires ON wallet_locks(expires_at);

COMMENT ON TABLE wallet_locks IS 'ウォレットロック（分散ロック用、現在未使用）';
COMMENT ON COLUMN wallet_locks.wallet_id IS 'ロック対象のウォレット ID';
COMMENT ON COLUMN wallet_locks.locked_by IS 'ロックを保持しているプロセス/セッション ID';
COMMENT ON COLUMN wallet_locks.locked_at IS 'ロック取得時刻';
COMMENT ON COLUMN wallet_locks.expires_at IS 'ロック有効期限';
