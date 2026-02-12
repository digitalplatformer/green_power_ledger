import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { IdempotencyValidator } from '../../services/idempotency-validator';
import { WalletSecretManager } from '../../services/wallet-secret-manager';
import { MintOperation } from '../../operations/mint-operation';
import { OperationType, OperationStatus, StepStatus } from '../../operations/base-operation';
import { masterKeyFromHex } from '../../crypto/encryption';

export interface MintRequest {
  idempotencyKey: string;
  userWalletId: string;
  amount: string;
  metadata?: string;
}

/**
 * POST /api/operations/mint handler
 * Creates and executes a mint operation
 */
export async function handleMint(req: Request, pool: Pool): Promise<Response> {
  try {
    // 1. Parse request body
    const body: MintRequest = await req.json();

    // 2. Validation - check required fields
    if (!body.idempotencyKey || !body.userWalletId || !body.amount) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields',
          required: ['idempotencyKey', 'userWalletId', 'amount']
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Reject deprecated fields
    const deprecatedFields = ['issuerWalletId', 'assetScale', 'maximumAmount', 'transferFee'];
    const providedDeprecated = deprecatedFields.filter(field => (body as any)[field] !== undefined);
    if (providedDeprecated.length > 0) {
      return new Response(
        JSON.stringify({
          error: 'Deprecated fields provided',
          message: 'These fields are no longer supported',
          deprecatedFields: providedDeprecated,
          details: {
            issuerWalletId: 'Issuer is automatically determined from ISSUER_SEED',
            assetScale: 'Fixed to 0',
            maximumAmount: 'Automatically set equal to amount',
            transferFee: 'Fixed to 0'
          }
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Check idempotency key
    const idempotencyValidator = new IdempotencyValidator(pool);
    const existingOperation = await idempotencyValidator.getOperationByKey(body.idempotencyKey);

    if (existingOperation) {
      // Return already existing operation
      return new Response(
        JSON.stringify({
          operationId: existingOperation.id,
          status: existingOperation.status,
          message: 'Operation already exists',
          issuanceId: existingOperation.issuance_id
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
        OperationType.MINT,
        body.idempotencyKey,
        null, // issuance_id is set after first step completes
        null, // Issuer is determined from environment variable
        body.userWalletId,
        body.amount,
        OperationStatus.PENDING
      ]
    );

    // 5. Create steps
    const steps = [
      {
        id: uuidv4(),
        operationId,
        stepNo: 1,
        kind: 'issuer_mint',
        walletId: null, // Issuer is determined from environment variable
        txType: 'MPTokenIssuanceCreate'
      },
      {
        id: uuidv4(),
        operationId,
        stepNo: 2,
        kind: 'user_authorize',
        walletId: body.userWalletId,
        txType: 'MPTokenAuthorize'
      },
      {
        id: uuidv4(),
        operationId,
        stepNo: 3,
        kind: 'issuer_transfer',
        walletId: null, // Issuer is determined from environment variable
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

    // 6. Execute operation (async background execution)
    const masterKey = masterKeyFromHex(process.env.ENCRYPTION_MASTER_KEY!);
    const secretManager = new WalletSecretManager(pool, masterKey);
    const mintOperation = new MintOperation(
      pool,
      {
        operationId,
        issuanceId: '', // Dummy, actually retrieved in first step
        userWalletId: body.userWalletId,
        amount: body.amount,
        assetScale: 0,
        maximumAmount: body.amount,
        transferFee: 0,
        metadata: body.metadata
      },
      secretManager
    );

    // Execute in background
    mintOperation.execute().catch((error) => {
      console.error(`Mint operation ${operationId} failed:`, error);
    });

    // 7. Return response
    return new Response(
      JSON.stringify({
        operationId,
        status: OperationStatus.PENDING,
        message: 'Mint operation created and execution started',
        steps: steps.map(s => ({ stepNo: s.stepNo, kind: s.kind, status: StepStatus.PENDING }))
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Mint handler error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
