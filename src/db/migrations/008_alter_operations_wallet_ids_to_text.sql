-- 008_alter_operations_wallet_ids_to_text.sql
-- wallet_id カラムを UUID から TEXT に変更
-- 理由: issuer wallet は 'issuer' という特別な文字列IDを使用するため

-- operations テーブルの外部キー制約を削除
ALTER TABLE operations
  DROP CONSTRAINT IF EXISTS operations_from_wallet_id_fkey;

ALTER TABLE operations
  DROP CONSTRAINT IF EXISTS operations_to_wallet_id_fkey;

-- operations テーブルのカラムの型を TEXT に変更
ALTER TABLE operations
  ALTER COLUMN from_wallet_id TYPE TEXT USING from_wallet_id::TEXT;

ALTER TABLE operations
  ALTER COLUMN to_wallet_id TYPE TEXT USING to_wallet_id::TEXT;

-- operation_steps テーブルの外部キー制約を削除
ALTER TABLE operation_steps
  DROP CONSTRAINT IF EXISTS operation_steps_wallet_id_fkey;

-- operation_steps テーブルのカラムの型を TEXT に変更
ALTER TABLE operation_steps
  ALTER COLUMN wallet_id TYPE TEXT USING wallet_id::TEXT;

-- コメントを更新
COMMENT ON COLUMN operations.from_wallet_id IS '送信元ウォレットID（TEXT: issuer の場合は "issuer"、user の場合は UUID）';
COMMENT ON COLUMN operations.to_wallet_id IS '送信先ウォレットID（TEXT: UUID 文字列）';
COMMENT ON COLUMN operation_steps.wallet_id IS 'このステップを実行するウォレットID（TEXT: issuer の場合は "issuer"、user の場合は UUID）';
