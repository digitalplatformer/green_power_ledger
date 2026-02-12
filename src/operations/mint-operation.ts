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
import {
  buildMPTokenIssuanceCreate,
  buildMPTokenAuthorize,
  buildMPTPayment
} from '../xrpl/builders';
import { WalletSecretManager } from '../services/wallet-secret-manager';

export interface MintOperationParams {
  operationId: string;
  issuanceId: string;
  userWalletId: string;
  amount: string;
  assetScale?: number;
  maximumAmount?: string;
  transferFee?: number;
  metadata?: string;
}

/**
 * Mint operation (3 steps)
 * 1. Issuer mints MPT (MPTokenIssuanceCreate)
 * 2. User authorizes (MPTokenAuthorize)
 * 3. Issuer transfers to user (Payment)
 */
export class MintOperation extends BaseOperation {
  constructor(
    pool: Pool,
    private params: MintOperationParams,
    private secretManager: WalletSecretManager
  ) {
    super(pool, params.operationId, OperationType.MINT);
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
        await this.executeIssuerMint(step);
        break;
      case 2:
        await this.executeUserAuthorize(step);
        break;
      case 3:
        await this.executeIssuerTransfer(step);
        break;
      default:
        throw new Error(`Unknown step number: ${step.stepNo}`);
    }
  }

  /**
   * Step 1: Issuer mints MPT
   */
  private async executeIssuerMint(step: OperationStep): Promise<void> {
    try {
      // 1. Get issuer's wallet from environment variable
      const issuerSeed = process.env.ISSUER_SEED;
      if (!issuerSeed) {
        throw new Error('ISSUER_SEED is not configured in .env');
      }
      const issuerWallet = Wallet.fromSeed(issuerSeed);

      // 2. Build MPTokenIssuanceCreate transaction
      const tx = buildMPTokenIssuanceCreate({
        account: issuerWallet.address,
        assetScale: this.params.assetScale,
        maximumAmount: this.params.maximumAmount,
        transferFee: this.params.transferFee,
        metadata: this.params.metadata
      });

      console.log(`  → Issuer minting MPT: ${issuerWallet.address}`);

      // 3. Submit transaction
      const submitResult: SubmitResult = await submitTransaction(
        tx,
        issuerWallet
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

        // Extract MPT Issuance ID and save to operations table
        const mptIssuanceId = this.extractMPTIssuanceId(
          validationResult.details
        );
        if (mptIssuanceId) {
          await this.pool.query(
            `UPDATE operations SET issuance_id = $1 WHERE id = $2`,
            [mptIssuanceId, this.operationId]
          );
          console.log(`  → MPT Issuance ID: ${mptIssuanceId}`);
        }
      } else if (validationResult.status === ValidationStatus.FAILED) {
        await this.updateStepStatus(step.id!, StepStatus.VALIDATED_FAILED, {
          validatedResult: validationResult.details
        });
        throw new Error(
          `Transaction validation failed: ${validationResult.transactionResult}`
        );
      } else {
        // TIMEOUT
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
   * Step 2: User authorizes
   */
  private async executeUserAuthorize(step: OperationStep): Promise<void> {
    try {
      // 1. Get user's secret key
      const userSecret = await this.secretManager.retrieveSecret(
        this.params.userWalletId
      );
      const userWallet = Wallet.fromSeed(userSecret);

      // 2. Get MPT Issuance ID
      const mptIssuanceId = await this.getMPTIssuanceId();

      // 3. Build MPTokenAuthorize transaction
      const tx = buildMPTokenAuthorize({
        account: userWallet.address,
        mptIssuanceId
      });

      console.log(`  → User authorizing MPT: ${userWallet.address}`);

      // 4. Submit transaction
      const submitResult: SubmitResult = await submitTransaction(
        tx,
        userWallet
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
   * Step 3: Issuer transfers to user
   */
  private async executeIssuerTransfer(step: OperationStep): Promise<void> {
    try {
      // 1. Get issuer's wallet from environment variable
      const issuerSeed = process.env.ISSUER_SEED;
      if (!issuerSeed) {
        throw new Error('ISSUER_SEED is not configured in .env');
      }
      const issuerWallet = Wallet.fromSeed(issuerSeed);

      // 2. Get user's address
      const userAddress = await this.getUserAddress();

      // 3. Get MPT Issuance ID
      const mptIssuanceId = await this.getMPTIssuanceId();

      // 4. Build Payment transaction
      const tx = buildMPTPayment({
        account: issuerWallet.address,
        destination: userAddress,
        mptIssuanceId,
        amount: this.params.amount
      });

      console.log(
        `  → Issuer transferring MPT to User: ${this.params.amount}`
      );

      // 5. Submit transaction
      const submitResult: SubmitResult = await submitTransaction(
        tx,
        issuerWallet
      );

      // 6. Update step to SUBMITTED
      await this.updateStepStatus(step.id!, StepStatus.SUBMITTED, {
        txHash: submitResult.txHash,
        submitResult: submitResult.submitResult
      });

      console.log(`  → Transaction submitted: ${submitResult.txHash}`);

      // 7. Wait for validation
      const validationResult = await waitForValidation(submitResult.txHash);

      // 8. Update step based on validation result
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
      console.error(`  ✗ Step 3 error:`, error);
      await this.updateStepStatus(step.id!, StepStatus.VALIDATED_FAILED);
      throw error;
    }
  }

  /**
   * Get MPT Issuance ID
   */
  private async getMPTIssuanceId(): Promise<string> {
    const result = await this.pool.query(
      'SELECT issuance_id FROM operations WHERE id = $1',
      [this.operationId]
    );

    if (result.rows.length === 0 || !result.rows[0].issuance_id) {
      throw new Error('MPT Issuance ID not found');
    }

    return result.rows[0].issuance_id;
  }

  /**
   * Get user's address
   */
  private async getUserAddress(): Promise<string> {
    const result = await this.pool.query(
      'SELECT xrpl_address FROM wallets WHERE id = $1',
      [this.params.userWalletId]
    );

    if (result.rows.length === 0) {
      throw new Error(`User wallet not found: ${this.params.userWalletId}`);
    }

    return result.rows[0].xrpl_address;
  }

  /**
   * Extract MPT Issuance ID from validation result
   */
  private extractMPTIssuanceId(details: any): string | null {
    try {
      if (details?.meta?.mpt_issuance_id) {
        return details.meta.mpt_issuance_id;
      }
      return null;
    } catch (error) {
      console.error('Failed to extract MPT Issuance ID:', error);
      return null;
    }
  }
}


