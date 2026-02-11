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
  issuerWalletId: string;
  userWalletId: string;
  amount: string;
  assetScale?: number;
  maximumAmount?: string;
  transferFee?: number;
  metadata?: string;
}

/**
 * Mint 操作（3ステップ）
 * 1. Issuer が MPT を mint（MPTokenIssuanceCreate）
 * 2. User が authorize（MPTokenAuthorize）
 * 3. Issuer が user に transfer（Payment）
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
   * ステップ1: Issuer が MPT を mint
   */
  private async executeIssuerMint(step: OperationStep): Promise<void> {
    try {
      // 1. Issuer の秘密鍵を取得
      const issuerSecret = await this.secretManager.retrieveSecret(
        this.params.issuerWalletId
      );
      const issuerWallet = Wallet.fromSeed(issuerSecret);

      // 2. MPTokenIssuanceCreate トランザクションを構築
      const tx = buildMPTokenIssuanceCreate({
        account: issuerWallet.address,
        assetScale: this.params.assetScale,
        maximumAmount: this.params.maximumAmount,
        transferFee: this.params.transferFee,
        metadata: this.params.metadata
      });

      console.log(`  → Issuer が MPT を mint します: ${issuerWallet.address}`);

      // 3. トランザクションを送信
      const submitResult: SubmitResult = await submitTransaction(
        tx,
        issuerWallet
      );

      // 4. ステップを SUBMITTED に更新
      await this.updateStepStatus(step.id!, StepStatus.SUBMITTED, {
        txHash: submitResult.txHash,
        submitResult: submitResult.submitResult
      });

      console.log(`  → トランザクション送信: ${submitResult.txHash}`);

      // 5. 検証を待機
      const validationResult = await waitForValidation(submitResult.txHash);

      // 6. 検証結果に基づいてステップを更新
      if (validationResult.status === ValidationStatus.SUCCESS) {
        await this.updateStepStatus(step.id!, StepStatus.VALIDATED_SUCCESS, {
          validatedResult: validationResult.details
        });

        // MPT Issuance ID を抽出して operations テーブルに保存
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
      console.error(`  ✗ ステップ1エラー:`, error);
      await this.updateStepStatus(step.id!, StepStatus.VALIDATED_FAILED);
      throw error;
    }
  }

  /**
   * ステップ2: User が authorize
   */
  private async executeUserAuthorize(step: OperationStep): Promise<void> {
    try {
      // 1. User の秘密鍵を取得
      const userSecret = await this.secretManager.retrieveSecret(
        this.params.userWalletId
      );
      const userWallet = Wallet.fromSeed(userSecret);

      // 2. MPT Issuance ID を取得
      const mptIssuanceId = await this.getMPTIssuanceId();

      // 3. MPTokenAuthorize トランザクションを構築
      const tx = buildMPTokenAuthorize({
        account: userWallet.address,
        mptIssuanceId
      });

      console.log(`  → User が MPT を authorize します: ${userWallet.address}`);

      // 4. トランザクションを送信
      const submitResult: SubmitResult = await submitTransaction(
        tx,
        userWallet
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
      console.error(`  ✗ ステップ2エラー:`, error);
      await this.updateStepStatus(step.id!, StepStatus.VALIDATED_FAILED);
      throw error;
    }
  }

  /**
   * ステップ3: Issuer が user に transfer
   */
  private async executeIssuerTransfer(step: OperationStep): Promise<void> {
    try {
      // 1. Issuer の秘密鍵を取得
      const issuerSecret = await this.secretManager.retrieveSecret(
        this.params.issuerWalletId
      );
      const issuerWallet = Wallet.fromSeed(issuerSecret);

      // 2. User のアドレスを取得
      const userAddress = await this.getUserAddress();

      // 3. MPT Issuance ID を取得
      const mptIssuanceId = await this.getMPTIssuanceId();

      // 4. Payment トランザクションを構築
      const tx = buildMPTPayment({
        account: issuerWallet.address,
        destination: userAddress,
        mptIssuanceId,
        amount: this.params.amount
      });

      console.log(
        `  → Issuer が User に MPT を transfer します: ${this.params.amount}`
      );

      // 5. トランザクションを送信
      const submitResult: SubmitResult = await submitTransaction(
        tx,
        issuerWallet
      );

      // 6. ステップを SUBMITTED に更新
      await this.updateStepStatus(step.id!, StepStatus.SUBMITTED, {
        txHash: submitResult.txHash,
        submitResult: submitResult.submitResult
      });

      console.log(`  → トランザクション送信: ${submitResult.txHash}`);

      // 7. 検証を待機
      const validationResult = await waitForValidation(submitResult.txHash);

      // 8. 検証結果に基づいてステップを更新
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
      console.error(`  ✗ ステップ3エラー:`, error);
      await this.updateStepStatus(step.id!, StepStatus.VALIDATED_FAILED);
      throw error;
    }
  }

  /**
   * MPT Issuance ID を取得
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
   * User のアドレスを取得
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
   * 検証結果から MPT Issuance ID を抽出
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


