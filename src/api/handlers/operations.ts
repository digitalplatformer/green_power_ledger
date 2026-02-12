import { Pool } from 'pg';

/**
 * GET /api/operations/:operationId ハンドラー
 * 操作の詳細な状態を取得する
 */
export async function handleGetOperationStatus(
  operationId: string,
  pool: Pool
): Promise<Response> {
  try {
    // 1. 操作を取得
    const operationResult = await pool.query(
      `SELECT id, type, idempotency_key, issuance_id, from_wallet_id, to_wallet_id,
              amount, status, error_code, error_message, created_at, updated_at
       FROM operations
       WHERE id = $1`,
      [operationId]
    );

    if (operationResult.rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Operation not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const operation = operationResult.rows[0];

    // 2. ステップを取得
    const stepsResult = await pool.query(
      `SELECT id, step_no, kind, wallet_id, tx_type, tx_hash, status,
              submit_result, validated_result, last_checked_at, created_at, updated_at
       FROM operation_steps
       WHERE operation_id = $1
       ORDER BY step_no ASC`,
      [operationId]
    );

    const steps = stepsResult.rows;

    // 3. レスポンスを返す
    return new Response(
      JSON.stringify({
        operation: {
          id: operation.id,
          type: operation.type,
          idempotencyKey: operation.idempotency_key,
          issuanceId: operation.issuance_id,
          fromWalletId: operation.from_wallet_id,
          toWalletId: operation.to_wallet_id,
          amount: operation.amount,
          status: operation.status,
          errorCode: operation.error_code,
          errorMessage: operation.error_message,
          createdAt: operation.created_at,
          updatedAt: operation.updated_at
        },
        steps: steps.map(step => ({
          id: step.id,
          stepNo: step.step_no,
          kind: step.kind,
          walletId: step.wallet_id,
          txType: step.tx_type,
          txHash: step.tx_hash,
          status: step.status,
          submitResult: step.submit_result,
          validatedResult: step.validated_result,
          lastCheckedAt: step.last_checked_at,
          createdAt: step.created_at,
          updatedAt: step.updated_at
        }))
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Get operation status error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * GET /api/operations/:operationId?status=true ハンドラー
 * 操作の軽量な状態を取得する（ステップの詳細なし）
 */
export async function handleGetOperationStatusLightweight(
  operationId: string,
  pool: Pool
): Promise<Response> {
  try {
    const result = await pool.query(
      `SELECT id, type, status, issuance_id, created_at, updated_at
       FROM operations
       WHERE id = $1`,
      [operationId]
    );

    if (result.rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Operation not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const operation = result.rows[0];

    return new Response(
      JSON.stringify({
        id: operation.id,
        type: operation.type,
        status: operation.status,
        issuanceId: operation.issuance_id,
        createdAt: operation.created_at,
        updatedAt: operation.updated_at
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Get operation status (lightweight) error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
