import { Wallet } from 'xrpl';
import type { SubmittableTransaction, SubmitResponse } from 'xrpl';
import { xrplClient } from './client';

export interface SubmitResult {
  txHash: string;
  ledgerIndex: number;
  submitResult: SubmitResponse;
}

/**
 * XRPL へトランザクションを送信
 * @param transaction トランザクションオブジェクト
 * @param wallet 署名用ウォレット
 * @returns 送信結果（tx_hash, ledger_index）
 */
export async function submitTransaction(
  transaction: SubmittableTransaction,
  wallet: Wallet
): Promise<SubmitResult> {
  const client = xrplClient.getClient();

  try {
    // autofill でトランザクションを準備（Fee, Sequence など）
    const prepared = await client.autofill(transaction);

    // 署名
    const signed = wallet.sign(prepared);

    // 送信
    const result = await client.submit(signed.tx_blob);

    // tx_hash を抽出
    const txHash = result.result.tx_json.hash || signed.hash;

    console.log(`✓ トランザクション送信成功: ${txHash}`);

    return {
      txHash,
      ledgerIndex: result.result.validated_ledger_index || 0,
      submitResult: result
    };
  } catch (error: any) {
    console.error('✗ トランザクション送信失敗:', error);

    // エラーの詳細をログ出力
    if (error.data) {
      console.error('エラーデータ:', JSON.stringify(error.data, null, 2));
    }

    throw error;
  }
}
