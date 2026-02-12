-- 006_alter_operations_issuance_id.sql
-- operations テーブルの issuance_id を nullable に変更
-- mint 操作では最初のステップが完了するまで issuance_id が不明なため

ALTER TABLE operations
  ALTER COLUMN issuance_id DROP NOT NULL;

COMMENT ON COLUMN operations.issuance_id IS 'MPT Issuance ID（mint 操作では最初のステップ完了後に設定される）';
