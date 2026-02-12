import { Pool } from 'pg';
import { Wallet } from 'xrpl';
import {
  BaseOperation,
  OperationType,
  OperationStep,
  StepStatus
} from './base-operation';
import { submitTransaction, SubmitResult } from '../xrpl/submit';
import { waitForValidation, ValidationStatus } from '../xrpl/validation';
import { buildMPTClawback } from '../xrpl/builders';
import { WalletSecretManager } from '../services/wallet-secret-manager';

export interface BurnOperationParams {
  operationId: string;
  issuanceId: string;
  holderWalletId: string;
  amount: string;
}

/**
 * Burn operation (1 step)
 * 1. Issuer clawbacks from holder (Clawback)
 */
export class BurnOperation extends BaseOperation {
  constructor(
    pool: Pool,
    private params: BurnOperationParams,
    private secretManager: WalletSecretManager
  ) {
    super(pool, params.operationId, OperationType.BURN);
  }

  async getSteps(): Promise<OperationStep[]> {
    const result = await this.pool.query(
      `SELECT * FROM operation_steps
       WHERE operation_id = $1
       ORDER BY step_no ASC`,
      [this.operationId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      operationId: row.operation_id,
      stepNo: row.step_no,
      kind: row.kind,
      walletId: row.wallet_id,
      txType: row.tx_type,
      txHash: row.tx_hash,
      submitResult: row.submit_result,
      validatedResult: row.validated_result,
      status: row.status
    }));
  }

  async executeStep(step: OperationStep): Promise<void> {
    switch (step.stepNo) {
      case 1:
        await this.executeIssuerClawback(step);
        break;
      default:
        throw new Error(`Unknown step number: ${step.stepNo}`);
    }
  }

  /**
   * Step 1: Issuer clawbacks from holder
   */
  private async executeIssuerClawback(step: OperationStep): Promise<void> {
    try {
      // 1. Get issuer's wallet
      const issuerSeed = process.env.ISSUER_SEED;

      if (!issuerSeed) {
        throw new Error('ISSUER_SEED is not configured in .env');
      }

      const issuerWallet = Wallet.fromSeed(issuerSeed);

      // 2. Get holder's address
      const holderAddress = await this.getWalletAddress(
        this.params.holderWalletId
      );

      // 3. Build Clawback transaction
      const tx = buildMPTClawback({
        account: issuerWallet.address,
        holder: holderAddress,
        mptIssuanceId: this.params.issuanceId,
        amount: this.params.amount
      });

      console.log(
        `  → Issuer clawing back MPT from Holder: ${this.params.amount}`
      );

      // 4. Submit transaction
      const submitResult: SubmitResult = await submitTransaction(
        tx,
        issuerWallet
      );

      // 5. Update step to SUBMITTED
      await this.updateStepStatus(step.id!, StepStatus.SUBMITTED, {
        txHash: submitResult.txHash,
        submitResult: submitResult.submitResult
      });

      console.log(`  → Transaction submitted: ${submitResult.txHash}`);

      // 6. Wait for validation
      const validationResult = await waitForValidation(submitResult.txHash);

      // 7. Update step based on validation result
      if (validationResult.status === ValidationStatus.SUCCESS) {
        await this.updateStepStatus(step.id!, StepStatus.VALIDATED_SUCCESS, {
          validatedResult: validationResult.details
        });
      } else if (validationResult.status === ValidationStatus.FAILED) {
        await this.updateStepStatus(step.id!, StepStatus.VALIDATED_FAILED, {
          validatedResult: validationResult.details
        });
        throw new Error(
          `Transaction validation failed: ${validationResult.transactionResult}`
        );
      } else {
        await this.updateStepStatus(step.id!, StepStatus.PENDING_VALIDATION);
        throw new Error('Transaction validation timeout');
      }
    } catch (error: any) {
      console.error(`  ✗ Step 1 error:`, error);
      await this.updateStepStatus(step.id!, StepStatus.VALIDATED_FAILED);
      throw error;
    }
  }

  /**
   * Get wallet address
   */
  private async getWalletAddress(walletId: string): Promise<string> {
    const result = await this.pool.query(
      'SELECT xrpl_address FROM wallets WHERE id = $1',
      [walletId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Wallet not found: ${walletId}`);
    }

    return result.rows[0].xrpl_address;
  }
}
