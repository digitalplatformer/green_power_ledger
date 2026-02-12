import { Pool } from 'pg';
import { waitForValidation, ValidationStatus } from '../xrpl/validation';
import { StepStatus } from '../operations/base-operation';

/**
 * Background validation poller
 * Periodically checks steps with PENDING_VALIDATION status and waits for validation completion
 */
export class ValidationPoller {
  private intervalId: Timer | null = null;
  private isRunning = false;

  constructor(
    private pool: Pool,
    private intervalMs: number = 30000 // Default: 30 seconds
  ) {}

  /**
   * Start the poller
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠ Validation poller is already running');
      return;
    }

    this.isRunning = true;
    console.log(`🔄 Starting validation poller (interval: ${this.intervalMs}ms)`);

    // Execute once immediately
    this.poll().catch(error => {
      console.error('Initial poll error:', error);
    });

    // Set up periodic execution
    this.intervalId = setInterval(() => {
      this.poll().catch(error => {
        console.error('Polling error:', error);
      });
    }, this.intervalMs);
  }

  /**
   * Stop the poller
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
   * Check PENDING_VALIDATION steps and attempt validation
   */
  private async poll(): Promise<void> {
    try {
      // Get steps with PENDING_VALIDATION status
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
        // Skip if no PENDING_VALIDATION steps
        return;
      }

      console.log(`🔍 Found ${steps.length} PENDING_VALIDATION step(s), checking...`);

      // Check each step sequentially
      for (const step of steps) {
        await this.checkStep(step);
      }

    } catch (error: any) {
      console.error('Poll error:', error);
    }
  }

  /**
   * Validate individual step
   */
  private async checkStep(step: any): Promise<void> {
    try {
      console.log(`  Checking step ${step.step_no} (tx: ${step.tx_hash})...`);

      // Wait for transaction validation (timeout: 0 = return result immediately)
      const validationResult = await waitForValidation(step.tx_hash, 0, 0);

      // Update step based on validation result
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

        // May also need to update operation status
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

        // Mark operation as failed
        await this.pool.query(
          `UPDATE operations
           SET status = 'FAILED',
               error_message = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [`Step ${step.step_no} validation failed`, step.operation_id]
        );

      } else {
        // If not yet validated, only update last_checked_at
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
   * Check if all steps of an operation are complete and update status if needed
   */
  private async updateOperationStatusIfNeeded(operationId: string): Promise<void> {
    try {
      // Get all steps
      const result = await this.pool.query(
        `SELECT status FROM operation_steps WHERE operation_id = $1`,
        [operationId]
      );

      const steps = result.rows;

      // If all steps are VALIDATED_SUCCESS
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
   * Whether the poller is running
   */
  get running(): boolean {
    return this.isRunning;
  }
}
