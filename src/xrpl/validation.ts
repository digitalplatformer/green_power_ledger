import { xrplClient } from './client';

export enum ValidationStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  TIMEOUT = 'timeout'
}

export interface ValidationResult {
  status: ValidationStatus;
  ledgerIndex?: number;
  transactionResult?: string;
  details?: any;
}

/**
 * トランザクションの検証完了を待機
 * @param txHash トランザクションハッシュ
 * @param timeoutMs 全体のタイムアウト（デフォルト2分）
 * @param pollIntervalMs ポーリング間隔（デフォルト5秒）
 * @returns 検証結果
 */
export async function waitForValidation(
  txHash: string,
  timeoutMs: number = 15000,
  pollIntervalMs: number = 2000
): Promise<ValidationResult> {
  const client = xrplClient.getClient();
  const startTime = Date.now();

  console.log(`トランザクション ${txHash} の検証を待機中...`);

  while (Date.now() - startTime < timeoutMs) {
    try {
      // トランザクションを取得
      const txResult = await client.request({
        command: 'tx',
        transaction: txHash
      });

      // validated チェック
      if (txResult.result.validated) {
        const meta = txResult.result.meta;

        // TransactionResult を確認
        if (typeof meta === 'object' && 'TransactionResult' in meta) {
          const result = meta.TransactionResult as string;

          if (result === 'tesSUCCESS') {
            console.log(`✓ トランザクション ${txHash} が成功しました`);
            return {
              status: ValidationStatus.SUCCESS,
              ledgerIndex: txResult.result.ledger_index,
              transactionResult: result,
              details: txResult.result
            };
          } else {
            console.error(`✗ トランザクション ${txHash} が失敗しました: ${result}`);
            return {
              status: ValidationStatus.FAILED,
              ledgerIndex: txResult.result.ledger_index,
              transactionResult: result,
              details: txResult.result
            };
          }
        }
      }
    } catch (error: any) {
      // txNotFound は正常（まだ Ledger に含まれていない）
      if (error?.data?.error !== 'txnNotFound') {
        console.error('トランザクション取得エラー:', error);
      }
    }

    // 次のポーリングまで待機
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  // タイムアウト
  console.warn(`⚠ トランザクション ${txHash} の検証がタイムアウトしました`);
  return {
    status: ValidationStatus.TIMEOUT
  };
}
