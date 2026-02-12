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
 * Base class for all operations
 * mint/transfer/burn operations inherit from BaseOperation
 */
export abstract class BaseOperation {
  constructor(
    protected pool: Pool,
    public operationId: string,
    public type: OperationType
  ) {}

  /**
   * Get operation steps
   * @returns Array of steps
   */
  abstract getSteps(): Promise<OperationStep[]>;

  /**
   * Execute individual step
   * @param step Step to execute
   */
  abstract executeStep(step: OperationStep): Promise<void>;

  /**
   * Execute entire operation
   * Skips already completed steps and resumes from incomplete steps
   */
  async execute(): Promise<void> {
    // 1. Update operation status to IN_PROGRESS
    await this.updateOperationStatus(OperationStatus.IN_PROGRESS);

    // 2. Get all steps
    const steps = await this.getSteps();

    // 3. Execute each step in order
    for (const step of steps) {
      if (step.status === StepStatus.VALIDATED_SUCCESS) {
        console.log(`✓ Step ${step.stepNo} is already completed. Skipping.`);
        continue; // Skip already completed steps
      }

      console.log(`→ Executing step ${step.stepNo}: ${step.kind}`);
      await this.executeStep(step);

      // Get latest state of step
      const updatedStep = await this.getStepById(step.id!);

      // Mark operation as failed if step failed
      if (
        updatedStep.status === StepStatus.VALIDATED_FAILED ||
        updatedStep.status === StepStatus.TIMEOUT
      ) {
        console.error(`✗ Step ${step.stepNo} failed`);
        await this.updateOperationStatus(
          OperationStatus.FAILED,
          `Step ${step.stepNo} failed: ${updatedStep.status}`
        );
        return;
      }

      console.log(`✓ Step ${step.stepNo} succeeded`);
    }

    // 4. If all steps succeeded
    console.log(`✓ All steps succeeded. Completing operation.`);
    await this.updateOperationStatus(OperationStatus.SUCCESS);
  }

  /**
   * Update operation status
   * @param status New status
   * @param errorMessage Error message (optional)
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
   * Update step status and results
   * @param stepId Step ID
   * @param status New status
   * @param updates Fields to update
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
   * Get step by step ID
   * @param stepId Step ID
   * @returns Step
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
