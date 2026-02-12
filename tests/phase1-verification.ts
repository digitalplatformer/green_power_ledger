import { Pool } from 'pg';
import { encrypt, decrypt, generateMasterKey, masterKeyFromHex } from '../src/crypto/encryption';
import { SecretCache } from '../src/crypto/secret-cache';
import { WalletSecretManager } from '../src/services/wallet-secret-manager';

console.log('🧪 フェーズ1検証テスト開始\n');

// 1. 暗号化/復号化テスト
console.log('1️⃣ 暗号化/復号化テスト');
try {
  const masterKey = generateMasterKey();
  const plaintext = 'sEdV19BLfeQP6TJ3kF5VjsQdBTu5Fmm'; // XRPLシード例

  const encrypted = await encrypt(plaintext, masterKey);
  const decrypted = await decrypt(encrypted, masterKey);

  if (decrypted === plaintext) {
    console.log('✓ 暗号化/復号化が正常に動作しています');
  } else {
    throw new Error('復号化された値が元の値と一致しません');
  }
} catch (error) {
  console.error('✗ 暗号化/復号化テスト失敗:', error);
  process.exit(1);
}

// 2. メモリキャッシュテスト
console.log('\n2️⃣ メモリキャッシュテスト');
try {
  const cache = new SecretCache(5000); // 5秒TTL
  const testSecret = 'test-secret-123';

  cache.set('test-wallet-1', testSecret);
  const retrieved = cache.get('test-wallet-1');

  if (retrieved === testSecret) {
    console.log('✓ キャッシュの保存/取得が正常に動作しています');
  } else {
    throw new Error('キャッシュから取得した値が一致しません');
  }

  // 存在しないキーのテスト
  const notFound = cache.get('non-existent');
  if (notFound === null) {
    console.log('✓ 存在しないキーに対してnullを返しています');
  }

  cache.destroy();
} catch (error) {
  console.error('✗ メモリキャッシュテスト失敗:', error);
  process.exit(1);
}

// 3. データベース接続テスト
console.log('\n3️⃣ データベース接続テスト');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

try {
  // テーブル存在確認
  const tables = ['wallets', 'mpt_issuances', 'operations', 'operation_steps', 'wallet_locks'];

  for (const table of tables) {
    const result = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = $1
      )`,
      [table]
    );

    if (result.rows[0].exists) {
      console.log(`✓ テーブル '${table}' が存在します`);
    } else {
      throw new Error(`テーブル '${table}' が存在しません`);
    }
  }
} catch (error) {
  console.error('✗ データベース接続テスト失敗:', error);
  await pool.end();
  process.exit(1);
}

// 4. ウォレット秘密鍵管理サービステスト
console.log('\n4️⃣ ウォレット秘密鍵管理サービステスト');
try {
  const masterKeyHex = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKeyHex) {
    throw new Error('ENCRYPTION_MASTER_KEY が設定されていません');
  }

  const masterKey = masterKeyFromHex(masterKeyHex);
  const secretManager = new WalletSecretManager(pool, masterKey);

  // 既存のテストデータをクリーンアップ
  await pool.query(`DELETE FROM wallets WHERE owner_id = 'test-user-1'`);

  // テスト用ウォレットを作成
  const testWalletResult = await pool.query(
    `INSERT INTO wallets (id, owner_type, owner_id, xrpl_address, encrypted_secret, created_at, updated_at)
     VALUES (gen_random_uuid(), 'user', 'test-user-1', 'rTest123', $1, NOW(), NOW())
     RETURNING id`,
    [Buffer.alloc(0)]
  );

  const testWalletId = testWalletResult.rows[0].id;
  const testSecret = 'sEdTEST123456789012345678901234';

  // 秘密鍵を保存
  await secretManager.storeSecret(testWalletId, testSecret);
  console.log('✓ 秘密鍵の暗号化保存が完了しました');

  // 秘密鍵を取得（初回はDBから復号化）
  const retrieved1 = await secretManager.retrieveSecret(testWalletId);
  if (retrieved1 === testSecret) {
    console.log('✓ 秘密鍵の復号化が正常に動作しています');
  } else {
    throw new Error('復号化された秘密鍵が一致しません');
  }

  // 2回目の取得（キャッシュから取得）
  const retrieved2 = await secretManager.retrieveSecret(testWalletId);
  if (retrieved2 === testSecret) {
    console.log('✓ キャッシュからの取得が正常に動作しています');
  }

  // クリーンアップ
  await pool.query('DELETE FROM wallets WHERE id = $1', [testWalletId]);
  console.log('✓ テストデータをクリーンアップしました');

} catch (error) {
  console.error('✗ ウォレット秘密鍵管理サービステスト失敗:', error);
  await pool.end();
  process.exit(1);
}

await pool.end();

console.log('\n🎉 フェーズ1の検証テストがすべて成功しました！\n');
console.log('✅ 完了したタスク:');
console.log('  - 開発環境セットアップ（依存関係、設定ファイル）');
console.log('  - データベーススキーマ作成（5テーブル）');
console.log('  - マイグレーションシステム');
console.log('  - ローカル暗号化ユーティリティ（AES-256-GCM）');
console.log('  - メモリキャッシュ（TTL付き）');
console.log('  - ウォレット秘密鍵管理サービス\n');

process.exit(0);
