import { Pool } from 'pg';

/**
 * 冪等性キー検証サービス
 * 同じ idempotency_key での重複操作を防ぐ
 */
export class IdempotencyValidator {
  constructor(private pool: Pool) {}

  /**
   * 冪等性キーが既に使用されているかチェック
   * @param idempotencyKey 冪等性キー
   * @returns true: 既に使用済み, false: 未使用
   */
  async isKeyUsed(idempotencyKey: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT id FROM operations WHERE idempotency_key = $1',
      [idempotencyKey]
    );

    return result.rows.length > 0;
  }

  /**
   * 冪等性キーで既存の操作を検索
   * @param idempotencyKey 冪等性キー
   * @returns 操作ID（存在しない場合は null）
   */
  async findOperationByKey(idempotencyKey: string): Promise<string | null> {
    const result = await this.pool.query(
      'SELECT id FROM operations WHERE idempotency_key = $1',
      [idempotencyKey]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].id;
  }

  /**
   * 冪等性キーの使用状態と操作の詳細を取得
   * @param idempotencyKey 冪等性キー
   * @returns 操作情報（存在しない場合は null）
   */
  async getOperationByKey(idempotencyKey: string): Promise<any | null> {
    const result = await this.pool.query(
      `SELECT id, type, status, issuance_id, from_wallet_id, to_wallet_id,
              amount, error_code, error_message, created_at, updated_at
       FROM operations
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * 冪等性キーを検証し、重複の場合は既存の操作IDを返す
   * @param idempotencyKey 冪等性キー
   * @throws Error 冪等性キーが既に使用されている場合
   */
  async validateKey(idempotencyKey: string): Promise<void> {
    const isUsed = await this.isKeyUsed(idempotencyKey);

    if (isUsed) {
      const existingOperation = await this.getOperationByKey(idempotencyKey);
      throw new Error(
        `Idempotency key already used: ${idempotencyKey} (operation: ${existingOperation.id}, status: ${existingOperation.status})`
      );
    }
  }
}
