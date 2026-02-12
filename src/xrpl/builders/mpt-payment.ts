import type { SubmittableTransaction } from 'xrpl';

export interface MPTPaymentParams {
  account: string;        // 送信者
  destination: string;    // 受信者
  mptIssuanceId: string;  // MPT Issuance ID
  amount: string;         // 送信量（文字列）
}

/**
 * MPT を含む Payment トランザクションを構築
 * @param params トランザクションパラメータ
 * @returns Payment トランザクション
 */
export function buildMPTPayment(
  params: MPTPaymentParams
): SubmittableTransaction {
  return {
    TransactionType: 'Payment',
    Account: params.account,
    Destination: params.destination,
    Amount: {
      mpt_issuance_id: params.mptIssuanceId,
      value: params.amount
    }
  } as SubmittableTransaction;
}
