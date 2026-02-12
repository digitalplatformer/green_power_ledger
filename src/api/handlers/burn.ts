import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { IdempotencyValidator } from '../../services/idempotency-validator';
import { WalletSecretManager } from '../../services/wallet-secret-manager';
import { BurnOperation } from '../../operations/burn-operation';
import { OperationType, OperationStatus, StepStatus } from '../../operations/base-operation';
import { masterKeyFromHex } from '../../crypto/encryption';

export interface BurnRequest {
  idempotencyKey: string;
  issuerWalletId: string;
  holderWalletId: string;
  issuanceId: string;
  amount: string;
}

/**
 * POST /api/operations/burn handler
 * Creates and executes a burn operation
 */
export async function handleBurn(req: Request, pool: Pool): Promise<Response> {
  try {
    // 1. Parse request body
    const body: BurnRequest = await req.json();

    // 2. Validation
    if (!body.idempotencyKey || !body.issuerWalletId || !body.holderWalletId || !body.issuanceId || !body.amount) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields',
          required: ['idempotencyKey', 'issuerWalletId', 'holderWalletId', 'issuanceId', 'amount']
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Check idempotency key
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

    // 4. Create operation
    const operationId = uuidv4();

    await pool.query(
      `INSERT INTO operations
       (id, type, idempotency_key, issuance_id, from_wallet_id, to_wallet_id, amount, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [
        operationId,
        OperationType.BURN,
        body.idempotencyKey,
        body.issuanceId,
        body.issuerWalletId,
        body.holderWalletId,
        body.amount,
        OperationStatus.PENDING
      ]
    );

    // 5. Create step
    const step = {
      id: uuidv4(),
      operationId,
      stepNo: 1,
      kind: 'issuer_clawback',
      walletId: body.issuerWalletId,
      txType: 'Clawback'
    };

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

    // 6. Execute operation (async background execution)
    const masterKey = masterKeyFromHex(process.env.ENCRYPTION_MASTER_KEY!);
    const secretManager = new WalletSecretManager(pool, masterKey);
    const burnOperation = new BurnOperation(
      pool,
      {
        operationId,
        issuanceId: body.issuanceId,
        issuerWalletId: body.issuerWalletId,
        holderWalletId: body.holderWalletId,
        amount: body.amount
      },
      secretManager
    );

    // Execute in background
    burnOperation.execute().catch((error) => {
      console.error(`Burn operation ${operationId} failed:`, error);
    });

    // 7. Return response
    return new Response(
      JSON.stringify({
        operationId,
        status: OperationStatus.PENDING,
        message: 'Burn operation created and execution started',
        steps: [{ stepNo: step.stepNo, kind: step.kind, status: StepStatus.PENDING }]
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Burn handler error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
