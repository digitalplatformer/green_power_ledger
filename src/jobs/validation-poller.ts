import { Pool } from 'pg';
import { waitForValidation, ValidationStatus } from '../xrpl/validation';
import { StepStatus } from '../operations/base-operation';

/**
 * バックグラウンド検証ポーラー
 * PENDING_VALIDATION ステータスのステップを定期的にチェックして検証完了を待つ
 */
export class ValidationPoller {
  private intervalId: Timer | null = null;
  private isRunning = false;

  constructor(
    private pool: Pool,
    private intervalMs: number = 30000 // デフォルト: 30秒
  ) {}

  /**
   * ポーラーを開始
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠ Validation poller is already running');
      return;
    }

    this.isRunning = true;
    console.log(`🔄 Starting validation poller (interval: ${this.intervalMs}ms)`);

    // 即座に一度実行
    this.poll().catch(error => {
      console.error('Initial poll error:', error);
    });

    // 定期実行を設定
    this.intervalId = setInterval(() => {
      this.poll().catch(error => {
        console.error('Polling error:', error);
      });
    }, this.intervalMs);
  }

  /**
   * ポーラーを停止
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log('⏹ Validation poller stopped');
  }

  /**
   * PENDING_VALIDATION ステップをチェックして検証を試行
   */
  private async poll(): Promise<void> {
    try {
      // PENDING_VALIDATION ステータスのステップを取得
      const result = await this.pool.query(
        `SELECT id, operation_id, step_no, tx_hash, last_checked_at
         FROM operation_steps
         WHERE status = $1 AND tx_hash IS NOT NULL
         ORDER BY last_checked_at ASC NULLS FIRST
         LIMIT 10`,
        [StepStatus.PENDING_VALIDATION]
      );

      const steps = result.rows;

      if (steps.length === 0) {
        // PENDING_VALIDATION ステップがない場合はスキップ
        return;
      }

      console.log(`🔍 Found ${steps.length} PENDING_VALIDATION step(s), checking...`);

      // 各ステップを順次チェック
      for (const step of steps) {
        await this.checkStep(step);
      }

    } catch (error: any) {
      console.error('Poll error:', error);
    }
  }

  /**
   * 個別のステップを検証
   */
  private async checkStep(step: any): Promise<void> {
    try {
      console.log(`  Checking step ${step.step_no} (tx: ${step.tx_hash})...`);

      // トランザクションの検証を待機（タイムアウト: 0 = すぐに結果を返す）
      const validationResult = await waitForValidation(step.tx_hash, 0, 0);

      // 検証結果に基づいてステップを更新
      if (validationResult.status === ValidationStatus.SUCCESS) {
        await this.pool.query(
          `UPDATE operation_steps
           SET status = $1,
               validated_result = $2,
               last_checked_at = NOW(),
               updated_at = NOW()
           WHERE id = $3`,
          [
            StepStatus.VALIDATED_SUCCESS,
            JSON.stringify(validationResult.details),
            step.id
          ]
        );

        console.log(`  ✓ Step ${step.step_no} validated successfully`);

        // 操作のステータスも更新する可能性がある
        await this.updateOperationStatusIfNeeded(step.operation_id);

      } else if (validationResult.status === ValidationStatus.FAILED) {
        await this.pool.query(
          `UPDATE operation_steps
           SET status = $1,
               validated_result = $2,
               last_checked_at = NOW(),
               updated_at = NOW()
           WHERE id = $3`,
          [
            StepStatus.VALIDATED_FAILED,
            JSON.stringify(validationResult.details),
            step.id
          ]
        );

        console.log(`  ✗ Step ${step.step_no} validation failed`);

        // 操作を失敗としてマーク
        await this.pool.query(
          `UPDATE operations
           SET status = 'FAILED',
               error_message = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [`Step ${step.step_no} validation failed`, step.operation_id]
        );

      } else {
        // まだ検証されていない場合は last_checked_at のみ更新
        await this.pool.query(
          `UPDATE operation_steps
           SET last_checked_at = NOW()
           WHERE id = $1`,
          [step.id]
        );

        console.log(`  ⏳ Step ${step.step_no} still pending validation`);
      }

    } catch (error: any) {
      console.error(`  Error checking step ${step.step_no}:`, error);
    }
  }

  /**
   * 操作の全ステップが完了しているかチェックして、必要に応じてステータスを更新
   */
  private async updateOperationStatusIfNeeded(operationId: string): Promise<void> {
    try {
      // すべてのステップを取得
      const result = await this.pool.query(
        `SELECT status FROM operation_steps WHERE operation_id = $1`,
        [operationId]
      );

      const steps = result.rows;

      // すべてのステップが VALIDATED_SUCCESS の場合
      const allSuccess = steps.every(
        step => step.status === StepStatus.VALIDATED_SUCCESS
      );

      if (allSuccess) {
        await this.pool.query(
          `UPDATE operations
           SET status = 'SUCCESS',
               updated_at = NOW()
           WHERE id = $1`,
          [operationId]
        );

        console.log(`  ✓ Operation ${operationId} completed successfully`);
      }

    } catch (error: any) {
      console.error('Error updating operation status:', error);
    }
  }

  /**
   * ポーラーが実行中かどうか
   */
  get running(): boolean {
    return this.isRunning;
  }
}
