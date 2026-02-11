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
  issuerWalletId: string;
  holderWalletId: string;
  amount: string;
}

/**
 * Burn 操作（1ステップ）
 * 1. Issuer が holder から clawback（Clawback）
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
   * ステップ1: Issuer が holder から clawback
   */
  private async executeIssuerClawback(step: OperationStep): Promise<void> {
    try {
      // 1. Issuer の秘密鍵を取得
      const issuerSecret = await this.secretManager.retrieveSecret(
        this.params.issuerWalletId
      );
      const issuerWallet = Wallet.fromSeed(issuerSecret);

      // 2. Holder のアドレスを取得
      const holderAddress = await this.getWalletAddress(
        this.params.holderWalletId
      );

      // 3. Clawback トランザクションを構築
      const tx = buildMPTClawback({
        account: issuerWallet.address,
        holder: holderAddress,
        mptIssuanceId: this.params.issuanceId,
        amount: this.params.amount
      });

      console.log(
        `  → Issuer が Holder から MPT を clawback します: ${this.params.amount}`
      );

      // 4. トランザクションを送信
      const submitResult: SubmitResult = await submitTransaction(
        tx,
        issuerWallet
      );

      // 5. ステップを SUBMITTED に更新
      await this.updateStepStatus(step.id!, StepStatus.SUBMITTED, {
        txHash: submitResult.txHash,
        submitResult: submitResult.submitResult
      });

      console.log(`  → トランザクション送信: ${submitResult.txHash}`);

      // 6. 検証を待機
      const validationResult = await waitForValidation(submitResult.txHash);

      // 7. 検証結果に基づいてステップを更新
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
      console.error(`  ✗ ステップ1エラー:`, error);
      await this.updateStepStatus(step.id!, StepStatus.VALIDATED_FAILED);
      throw error;
    }
  }

  /**
   * ウォレットのアドレスを取得
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
