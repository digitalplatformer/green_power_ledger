import type { SubmittableTransaction } from 'xrpl';

export interface MPTClawbackParams {
  account: string;        // issuer アカウント
  holder: string;         // 回収対象の holder アカウント
  mptIssuanceId: string;  // MPT Issuance ID
  amount: string;         // 回収量（文字列）
}

/**
 * Clawback トランザクションを構築
 * issuer が holder から MPT を回収する（burn 相当）
 * @param params トランザクションパラメータ
 * @returns Clawback トランザクション
 */
export function buildMPTClawback(
  params: MPTClawbackParams
): SubmittableTransaction {
  return {
    TransactionType: 'Clawback',
    Account: params.account,
    Holder: params.holder,
    Amount: {
      mpt_issuance_id: params.mptIssuanceId,
      value: params.amount
    }
  } as SubmittableTransaction;
}
