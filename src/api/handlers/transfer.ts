import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { IdempotencyValidator } from '../../services/idempotency-validator';
import { WalletSecretManager } from '../../services/wallet-secret-manager';
import { TransferOperation } from '../../operations/transfer-operation';
import { OperationType, OperationStatus, StepStatus } from '../../operations/base-operation';
import { masterKeyFromHex } from '../../crypto/encryption';

export interface TransferRequest {
  idempotencyKey: string;
  fromWalletId: string;
  toWalletId: string;
  issuanceId: string;
  amount: string;
}

/**
 * POST /api/operations/transfer ハンドラー
 * Transfer 操作を作成して実行する
 */
export async function handleTransfer(req: Request, pool: Pool): Promise<Response> {
  try {
    // 1. リクエストボディをパース
    const body: TransferRequest = await req.json();

    // 2. バリデーション
    if (!body.idempotencyKey || !body.fromWalletId || !body.toWalletId || !body.issuanceId || !body.amount) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields',
          required: ['idempotencyKey', 'fromWalletId', 'toWalletId', 'issuanceId', 'amount']
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. 冪等性キーのチェック
    const idempotencyValidator = new IdempotencyValidator(pool);
    const existingOperation = await idempotencyValidator.getOperationByKey(body.idempotencyKey);

    if (existingOperation) {
      return new Response(
        JSON.stringify({
          operationId: existingOperation.id,
          status: existingOperation.status,
          message: 'Operation already exists'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. 操作を作成
    const operationId = uuidv4();

    await pool.query(
      `INSERT INTO operations
       (id, type, idempotency_key, issuance_id, from_wallet_id, to_wallet_id, amount, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [
        operationId,
        OperationType.TRANSFER,
        body.idempotencyKey,
        body.issuanceId,
        body.fromWalletId,
        body.toWalletId,
        body.amount,
        OperationStatus.PENDING
      ]
    );

    // 5. ステップを作成
    const steps = [
      {
        id: uuidv4(),
        operationId,
        stepNo: 1,
        kind: 'receiver_authorize',
        walletId: body.toWalletId,
        txType: 'MPTokenAuthorize'
      },
      {
        id: uuidv4(),
        operationId,
        stepNo: 2,
        kind: 'sender_transfer',
        walletId: body.fromWalletId,
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

    // 6. 操作を実行（バックグラウンドで非同期実行）
    const masterKey = masterKeyFromHex(process.env.ENCRYPTION_MASTER_KEY!);
    const secretManager = new WalletSecretManager(pool, masterKey);
    const transferOperation = new TransferOperation(
      pool,
      {
        operationId,
        issuanceId: body.issuanceId,
        fromWalletId: body.fromWalletId,
        toWalletId: body.toWalletId,
        amount: body.amount
      },
      secretManager
    );

    // バックグラウンドで実行
    transferOperation.execute().catch((error) => {
      console.error(`Transfer operation ${operationId} failed:`, error);
    });

    // 7. レスポンスを返す
    return new Response(
      JSON.stringify({
        operationId,
        status: OperationStatus.PENDING,
        message: 'Transfer operation created and execution started',
        steps: steps.map(s => ({ stepNo: s.stepNo, kind: s.kind, status: StepStatus.PENDING }))
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Transfer handler error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
