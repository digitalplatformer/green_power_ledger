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
import { buildMPTokenAuthorize, buildMPTPayment } from '../xrpl/builders';
import { WalletSecretManager } from '../services/wallet-secret-manager';

export interface TransferOperationParams {
  operationId: string;
  issuanceId: string;
  fromWalletId: string;
  toWalletId: string;
  amount: string;
}

/**
 * Transfer operation (2 steps)
 * 1. Receiver authorizes (MPTokenAuthorize)
 * 2. Sender transfers (Payment)
 */
export class TransferOperation extends BaseOperation {
  constructor(
    pool: Pool,
    private params: TransferOperationParams,
    private secretManager: WalletSecretManager
  ) {
    super(pool, params.operationId, OperationType.TRANSFER);
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
        await this.executeReceiverAuthorize(step);
        break;
      case 2:
        await this.executeSenderTransfer(step);
        break;
      default:
        throw new Error(`Unknown step number: ${step.stepNo}`);
    }
  }

  /**
   * Step 1: Receiver authorizes
   */
  private async executeReceiverAuthorize(step: OperationStep): Promise<void> {
    try {
      // 1. Get receiver's secret key
      const receiverSecret = await this.secretManager.retrieveSecret(
        this.params.toWalletId
      );
      const receiverWallet = Wallet.fromSeed(receiverSecret);

      // 2. Build MPTokenAuthorize transaction
      const tx = buildMPTokenAuthorize({
        account: receiverWallet.address,
        mptIssuanceId: this.params.issuanceId
      });

      console.log(
        `  → Receiver authorizing MPT: ${receiverWallet.address}`
      );

      // 3. Submit transaction
      const submitResult: SubmitResult = await submitTransaction(
        tx,
        receiverWallet
      );

      // 4. Update step to SUBMITTED
      await this.updateStepStatus(step.id!, StepStatus.SUBMITTED, {
        txHash: submitResult.txHash,
        submitResult: submitResult.submitResult
      });

      console.log(`  → Transaction submitted: ${submitResult.txHash}`);

      // 5. Wait for validation
      const validationResult = await waitForValidation(submitResult.txHash);

      // 6. Update step based on validation result
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
   * Step 2: Sender transfers
   */
  private async executeSenderTransfer(step: OperationStep): Promise<void> {
    try {
      // 1. Get sender's secret key
      const senderSecret = await this.secretManager.retrieveSecret(
        this.params.fromWalletId
      );
      const senderWallet = Wallet.fromSeed(senderSecret);

      // 2. Get receiver's address
      const receiverAddress = await this.getWalletAddress(
        this.params.toWalletId
      );

      // 3. Build Payment transaction
      const tx = buildMPTPayment({
        account: senderWallet.address,
        destination: receiverAddress,
        mptIssuanceId: this.params.issuanceId,
        amount: this.params.amount
      });

      console.log(
        `  → Sender transferring MPT to Receiver: ${this.params.amount}`
      );

      // 4. Submit transaction
      const submitResult: SubmitResult = await submitTransaction(
        tx,
        senderWallet
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
      console.error(`  ✗ Step 2 error:`, error);
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
