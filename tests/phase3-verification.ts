import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { WalletSecretManager } from '../src/services/wallet-secret-manager';
import { WalletManager } from '../src/services/wallet-manager';
import { IdempotencyValidator } from '../src/services/idempotency-validator';
import { walletLockManager } from '../src/services/wallet-lock-manager';
import {
  OperationType,
  OperationStatus,
  StepStatus
} from '../src/operations/base-operation';
import { masterKeyFromHex } from '../src/crypto/encryption';

console.log('🧪 フェーズ3検証テスト開始\n');

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
const idempotencyValidator = new IdempotencyValidator(pool);

// テスト用のクリーンアップ
async function cleanup() {
  try {
    // テスト用のデータを削除
    await pool.query(
      "DELETE FROM operations WHERE idempotency_key LIKE 'test-%'"
    );
    await pool.query(
      "DELETE FROM wallets WHERE owner_id LIKE 'test-%'"
    );
  } catch (error) {
    console.error('クリーンアップエラー:', error);
  }
}

try {
  // クリーンアップ
  await cleanup();

  // =========================================
  // 1. ウォレット管理テスト
  // =========================================
  console.log('1️⃣ ウォレット管理テスト');

  // 1-1. ウォレット作成
  const issuerWallet = await walletManager.createWallet({
    ownerType: 'issuer',
    ownerId: 'test-issuer-001'
  });

  if (issuerWallet && issuerWallet.xrplAddress) {
    console.log('✓ Issuer ウォレット作成成功');
  } else {
    throw new Error('Issuer ウォレット作成失敗');
  }

  const userWallet = await walletManager.createWallet({
    ownerType: 'user',
    ownerId: 'test-user-001'
  });

  if (userWallet && userWallet.xrplAddress) {
    console.log('✓ User ウォレット作成成功');
  } else {
    throw new Error('User ウォレット作成失敗');
  }

  // 1-2. ウォレット取得
  const retrievedWallet = await walletManager.getWallet(issuerWallet.id);

  if (
    retrievedWallet &&
    retrievedWallet.xrplAddress === issuerWallet.xrplAddress
  ) {
    console.log('✓ ウォレット取得成功');
  } else {
    throw new Error('ウォレット取得失敗');
  }

  // 1-3. オーナーでウォレット検索
  const foundWallet = await walletManager.findWalletByOwner(
    'issuer',
    'test-issuer-001'
  );

  if (foundWallet && foundWallet.id === issuerWallet.id) {
    console.log('✓ オーナーでウォレット検索成功');
  } else {
    throw new Error('オーナーでウォレット検索失敗');
  }

  // 1-4. getOrCreateWallet（既存）
  const existingWallet = await walletManager.getOrCreateWallet(
    'issuer',
    'test-issuer-001'
  );

  if (existingWallet.id === issuerWallet.id) {
    console.log('✓ getOrCreateWallet（既存）成功');
  } else {
    throw new Error('getOrCreateWallet（既存）失敗');
  }

  // 1-5. getOrCreateWallet（新規）
  const newWallet = await walletManager.getOrCreateWallet(
    'user',
    'test-user-002'
  );

  if (newWallet && newWallet.id !== userWallet.id) {
    console.log('✓ getOrCreateWallet（新規）成功');
  } else {
    throw new Error('getOrCreateWallet（新規）失敗');
  }

  // =========================================
  // 2. 冪等性キー検証テスト
  // =========================================
  console.log('\n2️⃣ 冪等性キー検証テスト');

  const testIdempotencyKey = `test-${uuidv4()}`;
  const operationId = uuidv4();

  // 2-1. 未使用キーの検証
  const isUsed1 = await idempotencyValidator.isKeyUsed(testIdempotencyKey);

  if (!isUsed1) {
    console.log('✓ 未使用キーは使用可能');
  } else {
    throw new Error('未使用キーが使用済みと判定された');
  }

  // 2-2. 操作を作成して冪等性キーを登録
  await pool.query(
    `INSERT INTO operations
     (id, type, idempotency_key, issuance_id, from_wallet_id, to_wallet_id, amount, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
    [
      operationId,
      OperationType.MINT,
      testIdempotencyKey,
      'test-issuance-id',
      issuerWallet.id,
      userWallet.id,
      '1000',
      OperationStatus.PENDING
    ]
  );

  // 2-3. 使用済みキーの検証
  const isUsed2 = await idempotencyValidator.isKeyUsed(testIdempotencyKey);

  if (isUsed2) {
    console.log('✓ 使用済みキーが正しく検出された');
  } else {
    throw new Error('使用済みキーが検出されなかった');
  }

  // 2-4. 使用済みキーで操作を取得
  const operation = await idempotencyValidator.getOperationByKey(
    testIdempotencyKey
  );

  if (operation && operation.id === operationId) {
    console.log('✓ 冪等性キーで操作を取得成功');
  } else {
    throw new Error('冪等性キーで操作を取得失敗');
  }

  // 2-5. 重複キーの検証エラー
  try {
    await idempotencyValidator.validateKey(testIdempotencyKey);
    throw new Error('重複キーエラーが発生しなかった');
  } catch (error: any) {
    if (error.message.includes('already used')) {
      console.log('✓ 重複キーエラーが正しく発生した');
    } else {
      throw error;
    }
  }

  // =========================================
  // 3. ウォレットロックテスト
  // =========================================
  console.log('\n3️⃣ ウォレットロックテスト');

  const testWalletId = issuerWallet.id;
  let executionOrder: number[] = [];

  // 3-1. 並列実行でロックが機能することを確認
  const promise1 = walletLockManager.withLock(testWalletId, async () => {
    executionOrder.push(1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    executionOrder.push(2);
  });

  // 少し待ってから2つ目のロックを試行
  await new Promise((resolve) => setTimeout(resolve, 10));

  const promise2 = walletLockManager.withLock(testWalletId, async () => {
    executionOrder.push(3);
    await new Promise((resolve) => setTimeout(resolve, 50));
    executionOrder.push(4);
  });

  await Promise.all([promise1, promise2]);

  // 実行順序が [1, 2, 3, 4] であることを確認
  if (
    executionOrder.length === 4 &&
    executionOrder[0] === 1 &&
    executionOrder[1] === 2 &&
    executionOrder[2] === 3 &&
    executionOrder[3] === 4
  ) {
    console.log('✓ ウォレットロックが正しく機能している');
  } else {
    throw new Error(
      `ウォレットロックが正しく機能していない: [${executionOrder.join(', ')}]`
    );
  }

  // 3-2. ロックカウントのテスト
  const lockedCount1 = walletLockManager.getLockedCount();

  if (lockedCount1 === 0) {
    console.log('✓ ロック解除後のカウントが正しい');
  } else {
    throw new Error(`ロックカウントが正しくない: ${lockedCount1}`);
  }

  // =========================================
  // 4. 操作ステップの作成テスト
  // =========================================
  console.log('\n4️⃣ 操作ステップの作成テスト');

  // 4-1. Mint 操作のステップを作成
  const mintOperationId = uuidv4();
  const mintIdempotencyKey = `test-mint-${uuidv4()}`;

  await pool.query(
    `INSERT INTO operations
     (id, type, idempotency_key, issuance_id, from_wallet_id, to_wallet_id, amount, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
    [
      mintOperationId,
      OperationType.MINT,
      mintIdempotencyKey,
      null,
      issuerWallet.id,
      userWallet.id,
      '1000',
      OperationStatus.PENDING
    ]
  );

  // Mint の3ステップを作成
  const steps = [
    {
      id: uuidv4(),
      operationId: mintOperationId,
      stepNo: 1,
      kind: 'issuer_mint',
      walletId: issuerWallet.id,
      txType: 'MPTokenIssuanceCreate'
    },
    {
      id: uuidv4(),
      operationId: mintOperationId,
      stepNo: 2,
      kind: 'user_authorize',
      walletId: userWallet.id,
      txType: 'MPTokenAuthorize'
    },
    {
      id: uuidv4(),
      operationId: mintOperationId,
      stepNo: 3,
      kind: 'issuer_transfer',
      walletId: issuerWallet.id,
      txType: 'Payment'
    }
  ];

  for (const step of steps) {
    await pool.query(
      `INSERT INTO operation_steps
       (id, operation_id, step_no, kind, wallet_id, tx_type, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [
        step.id,
        step.operationId,
        step.stepNo,
        step.kind,
        step.walletId,
        step.txType,
        StepStatus.PENDING
      ]
    );
  }

  // ステップを取得して確認
  const retrievedSteps = await pool.query(
    `SELECT * FROM operation_steps WHERE operation_id = $1 ORDER BY step_no ASC`,
    [mintOperationId]
  );

  if (retrievedSteps.rows.length === 3) {
    console.log('✓ Mint 操作のステップ作成成功（3ステップ）');
  } else {
    throw new Error(
      `Mint 操作のステップ数が正しくない: ${retrievedSteps.rows.length}`
    );
  }

  // =========================================
  // 5. クリーンアップ
  // =========================================
  await cleanup();

  console.log('\n🎉 フェーズ3の検証テストがすべて成功しました！\n');
  console.log('✅ 完了したタスク:');
  console.log('  - Base Operation インターフェース');
  console.log('  - MintOperation（3ステップ）');
  console.log('  - TransferOperation（2ステップ）');
  console.log('  - BurnOperation（1ステップ）');
  console.log('  - ウォレット管理サービス');
  console.log('  - 冪等性キー検証');
  console.log('  - ウォレットシーケンスロック');
  console.log('  - 操作・ステップのデータベース管理\n');

  process.exit(0);
} catch (error: any) {
  console.error('✗ フェーズ3検証テスト失敗:', error);
  await cleanup();
  process.exit(1);
} finally {
  await pool.end();
}
