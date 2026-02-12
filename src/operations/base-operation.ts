import { Pool } from 'pg';

export enum OperationType {
  MINT = 'mint',
  TRANSFER = 'transfer',
  BURN = 'burn'
}

export enum OperationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED'
}

export enum StepStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  PENDING_VALIDATION = 'PENDING_VALIDATION',
  VALIDATED_SUCCESS = 'VALIDATED_SUCCESS',
  VALIDATED_FAILED = 'VALIDATED_FAILED',
  TIMEOUT = 'TIMEOUT'
}

export interface OperationStep {
  id?: string;
  operationId: string;
  stepNo: number;
  kind: string;
  walletId: string;
  txType: string;
  txHash?: string;
  submitResult?: any;
  validatedResult?: any;
  status: StepStatus;
  lastCheckedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * すべての操作の基底クラス
 * mint/transfer/burn 操作は BaseOperation を継承して実装する
 */
export abstract class BaseOperation {
  constructor(
    protected pool: Pool,
    public operationId: string,
    public type: OperationType
  ) {}

  /**
   * 操作のステップを取得
   * @returns ステップ配列
   */
  abstract getSteps(): Promise<OperationStep[]>;

  /**
   * 個別のステップを実行
   * @param step 実行するステップ
   */
  abstract executeStep(step: OperationStep): Promise<void>;

  /**
   * 操作全体を実行
   * すでに完了しているステップはスキップし、未完了のステップから再開する
   */
  async execute(): Promise<void> {
    // 1. 操作ステータスを IN_PROGRESS に更新
    await this.updateOperationStatus(OperationStatus.IN_PROGRESS);

    // 2. すべてのステップを取得
    const steps = await this.getSteps();

    // 3. 各ステップを順番に実行
    for (const step of steps) {
      if (step.status === StepStatus.VALIDATED_SUCCESS) {
        console.log(`✓ ステップ ${step.stepNo} はすでに完了しています。スキップします。`);
        continue; // すでに完了しているステップはスキップ
      }

      console.log(`→ ステップ ${step.stepNo} を実行中: ${step.kind}`);
      await this.executeStep(step);

      // ステップの最新状態を取得
      const updatedStep = await this.getStepById(step.id!);

      // ステップが失敗した場合は操作を失敗としてマーク
      if (
        updatedStep.status === StepStatus.VALIDATED_FAILED ||
        updatedStep.status === StepStatus.TIMEOUT
      ) {
        console.error(`✗ ステップ ${step.stepNo} が失敗しました`);
        await this.updateOperationStatus(
          OperationStatus.FAILED,
          `Step ${step.stepNo} failed: ${updatedStep.status}`
        );
        return;
      }

      console.log(`✓ ステップ ${step.stepNo} が成功しました`);
    }

    // 4. すべてのステップが成功した場合
    console.log(`✓ すべてのステップが成功しました。操作を完了します。`);
    await this.updateOperationStatus(OperationStatus.SUCCESS);
  }

  /**
   * 操作のステータスを更新
   * @param status 新しいステータス
   * @param errorMessage エラーメッセージ（任意）
   */
  protected async updateOperationStatus(
    status: OperationStatus,
    errorMessage?: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE operations
       SET status = $1,
           error_message = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [status, errorMessage || null, this.operationId]
    );
  }

  /**
   * ステップのステータスと結果を更新
   * @param stepId ステップID
   * @param status 新しいステータス
   * @param updates 更新するフィールド
   */
  protected async updateStepStatus(
    stepId: string,
    status: StepStatus,
    updates?: {
      txHash?: string;
      submitResult?: any;
      validatedResult?: any;
    }
  ): Promise<void> {
    const fields: string[] = ['status = $1', 'updated_at = NOW()'];
    const values: any[] = [status];
    let paramIndex = 2;

    if (updates?.txHash) {
      fields.push(`tx_hash = $${paramIndex++}`);
      values.push(updates.txHash);
    }

    if (updates?.submitResult) {
      fields.push(`submit_result = $${paramIndex++}`);
      values.push(JSON.stringify(updates.submitResult));
    }

    if (updates?.validatedResult) {
      fields.push(`validated_result = $${paramIndex++}`);
      values.push(JSON.stringify(updates.validatedResult));
    }

    fields.push(`last_checked_at = NOW()`);
    values.push(stepId);

    await this.pool.query(
      `UPDATE operation_steps
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex}`,
      values
    );
  }

  /**
   * ステップIDからステップを取得
   * @param stepId ステップID
   * @returns ステップ
   */
  private async getStepById(stepId: string): Promise<OperationStep> {
    const result = await this.pool.query(
      'SELECT * FROM operation_steps WHERE id = $1',
      [stepId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Step not found: ${stepId}`);
    }

    return result.rows[0];
  }
}
