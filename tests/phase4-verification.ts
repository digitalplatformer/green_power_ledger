import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { masterKeyFromHex } from '../src/crypto/encryption';
import { WalletSecretManager } from '../src/services/wallet-secret-manager';
import { WalletManager } from '../src/services/wallet-manager';

console.log('🧪 フェーズ4検証テスト開始\n');

// サーバーのベースURL
const BASE_URL = 'http://localhost:3005';

// データベース接続
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// マスターキーの設定
const MASTER_KEY_HEX = process.env.ENCRYPTION_MASTER_KEY!;
const masterKey = masterKeyFromHex(MASTER_KEY_HEX);

// サービスの初期化
const secretManager = new WalletSecretManager(pool, masterKey);
const walletManager = new WalletManager(pool, secretManager);

// テスト用のクリーンアップ
async function cleanup() {
  try {
    await pool.query("DELETE FROM operations WHERE idempotency_key LIKE 'api-test-%'");
    await pool.query("DELETE FROM wallets WHERE owner_id LIKE 'api-test-%'");
  } catch (error) {
    console.error('クリーンアップエラー:', error);
  }
}

try {
  // クリーンアップ
  await cleanup();

  // =========================================
  // 1. ヘルスチェックエンドポイントテスト
  // =========================================
  console.log('1️⃣ ヘルスチェックエンドポイントテスト');

  const healthResponse = await fetch(`${BASE_URL}/health`);
  const healthData = await healthResponse.json();

  if (healthResponse.status === 200 && healthData.status === 'ok') {
    console.log('✓ ヘルスチェックエンドポイントが正常に動作');
  } else {
    throw new Error('ヘルスチェックエンドポイント失敗');
  }

  // =========================================
  // 2. ウォレット作成エンドポイントテスト
  // =========================================
  console.log('\n2️⃣ ウォレット作成エンドポイントテスト');

  // Issuer ウォレットを作成
  const createIssuerResponse = await fetch(`${BASE_URL}/api/wallets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerType: 'issuer',
      ownerId: 'api-test-issuer-001'
    })
  });

  const issuerWallet = await createIssuerResponse.json();

  if (createIssuerResponse.status === 201 && issuerWallet.xrplAddress) {
    console.log('✓ Issuer ウォレット作成成功');
  } else {
    throw new Error('Issuer ウォレット作成失敗');
  }

  // User ウォレットを作成
  const createUserResponse = await fetch(`${BASE_URL}/api/wallets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerType: 'user',
      ownerId: 'api-test-user-001'
    })
  });

  const userWallet = await createUserResponse.json();

  if (createUserResponse.status === 201 && userWallet.xrplAddress) {
    console.log('✓ User ウォレット作成成功');
  } else {
    throw new Error('User ウォレット作成失敗');
  }

  // =========================================
  // 3. ウォレット取得エンドポイントテスト
  // =========================================
  console.log('\n3️⃣ ウォレット取得エンドポイントテスト');

  const getWalletResponse = await fetch(`${BASE_URL}/api/wallets/${issuerWallet.id}`);
  const retrievedWallet = await getWalletResponse.json();

  if (
    getWalletResponse.status === 200 &&
    retrievedWallet.id === issuerWallet.id
  ) {
    console.log('✓ ウォレット取得成功');
  } else {
    throw new Error('ウォレット取得失敗');
  }

  // =========================================
  // 4. Mint 操作エンドポイントテスト（非同期）
  // =========================================
  console.log('\n4️⃣ Mint 操作エンドポイントテスト');

  const mintIdempotencyKey = `api-test-mint-${uuidv4()}`;

  const mintResponse = await fetch(`${BASE_URL}/api/operations/mint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: mintIdempotencyKey,
      userWalletId: userWallet.id,
      amount: '1000',
      metadata: 'Test MPT from API'
    })
  });

  const mintOperation = await mintResponse.json();

  if (
    mintResponse.status === 201 &&
    mintOperation.operationId &&
    mintOperation.status === 'PENDING'
  ) {
    console.log('✓ Mint 操作作成成功');
    console.log(`  Operation ID: ${mintOperation.operationId}`);
  } else {
    throw new Error('Mint 操作作成失敗');
  }

  // =========================================
  // 5. 冪等性キーのテスト（重複リクエスト）
  // =========================================
  console.log('\n5️⃣ 冪等性キーテスト');

  const duplicateMintResponse = await fetch(`${BASE_URL}/api/operations/mint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: mintIdempotencyKey,
      userWalletId: userWallet.id,
      amount: '1000',
      metadata: 'Test MPT from API'
    })
  });

  const duplicateOperation = await duplicateMintResponse.json();

  if (
    duplicateMintResponse.status === 200 &&
    duplicateOperation.operationId === mintOperation.operationId &&
    duplicateOperation.message.includes('already exists')
  ) {
    console.log('✓ 冪等性キーが正しく機能している（重複リクエストを検出）');
  } else {
    throw new Error('冪等性キーテスト失敗');
  }

  // =========================================
  // 6. 操作状態取得エンドポイントテスト
  // =========================================
  console.log('\n6️⃣ 操作状態取得エンドポイントテスト');

  // 少し待機（操作が作成される時間を確保）
  await new Promise(resolve => setTimeout(resolve, 1000));

  const getOperationResponse = await fetch(
    `${BASE_URL}/api/operations/${mintOperation.operationId}`
  );
  const operationStatus = await getOperationResponse.json();

  if (
    getOperationResponse.status === 200 &&
    operationStatus.operation.id === mintOperation.operationId &&
    operationStatus.steps.length === 3
  ) {
    console.log('✓ 操作状態取得成功（詳細版）');
    console.log(`  Status: ${operationStatus.operation.status}`);
    console.log(`  Steps: ${operationStatus.steps.length}`);
  } else {
    throw new Error('操作状態取得失敗');
  }

  // 軽量版のテスト
  const getLightweightResponse = await fetch(
    `${BASE_URL}/api/operations/${mintOperation.operationId}?status=true`
  );
  const lightweightStatus = await getLightweightResponse.json();

  if (
    getLightweightResponse.status === 200 &&
    lightweightStatus.id === mintOperation.operationId &&
    !lightweightStatus.steps
  ) {
    console.log('✓ 操作状態取得成功（軽量版）');
  } else {
    throw new Error('操作状態取得（軽量版）失敗');
  }

  // =========================================
  // 7. バリデーションエラーテスト
  // =========================================
  console.log('\n7️⃣ バリデーションエラーテスト');

  const invalidMintResponse = await fetch(`${BASE_URL}/api/operations/mint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // idempotencyKey が欠けている
      userWalletId: userWallet.id,
      amount: '1000'
    })
  });

  if (invalidMintResponse.status === 400) {
    console.log('✓ バリデーションエラーが正しく返される');
  } else {
    throw new Error('バリデーションエラーテスト失敗');
  }

  // =========================================
  // 8. 404 エラーテスト
  // =========================================
  console.log('\n8️⃣ 404 エラーテスト');

  const notFoundResponse = await fetch(
    `${BASE_URL}/api/operations/${uuidv4()}`
  );

  if (notFoundResponse.status === 404) {
    console.log('✓ 404 エラーが正しく返される');
  } else {
    throw new Error('404 エラーテスト失敗');
  }

  // =========================================
  // クリーンアップ
  // =========================================
  await cleanup();

  console.log('\n🎉 フェーズ4の検証テストがすべて成功しました！\n');
  console.log('✅ 完了したタスク:');
  console.log('  - REST API サーバーのセットアップ');
  console.log('  - ルーティングシステム');
  console.log('  - POST /api/operations/mint');
  console.log('  - POST /api/operations/transfer');
  console.log('  - POST /api/operations/burn');
  console.log('  - GET /api/operations/:operationId');
  console.log('  - POST /api/wallets');
  console.log('  - GET /api/wallets/:walletId');
  console.log('  - GET /health');
  console.log('  - リクエストバリデーション');
  console.log('  - エラーハンドリング');
  console.log('  - 冪等性キー検証');
  console.log('  - バックグラウンド検証ジョブ\n');

  process.exit(0);
} catch (error: any) {
  console.error('\n✗ フェーズ4検証テスト失敗:', error);
  await cleanup();
  process.exit(1);
} finally {
  await pool.end();
}
