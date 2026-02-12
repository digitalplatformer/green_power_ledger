import { Pool } from 'pg';

/**
 * Idempotency key validation service
 * Prevents duplicate operations with the same idempotency_key
 */
export class IdempotencyValidator {
  constructor(private pool: Pool) {}

  /**
   * Check if idempotency key is already used
   * @param idempotencyKey Idempotency key
   * @returns true: already used, false: not used
   */
  async isKeyUsed(idempotencyKey: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT id FROM operations WHERE idempotency_key = $1',
      [idempotencyKey]
    );

    return result.rows.length > 0;
  }

  /**
   * Find existing operation by idempotency key
   * @param idempotencyKey Idempotency key
   * @returns Operation ID (null if not found)
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
   * Get idempotency key usage status and operation details
   * @param idempotencyKey Idempotency key
   * @returns Operation info (null if not found)
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
   * Validate idempotency key; returns existing operation ID if duplicate
   * @param idempotencyKey Idempotency key
   * @throws Error if idempotency key is already used
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
