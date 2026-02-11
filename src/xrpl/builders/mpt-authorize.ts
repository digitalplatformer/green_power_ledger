import type { SubmittableTransaction } from 'xrpl';

export interface MPTAuthorizeParams {
  account: string;        // 受信者アカウント
  mptIssuanceId: string;  // MPT Issuance ID
}

/**
 * MPTokenAuthorize トランザクションを構築
 * 受信者が MPT を受け取るために実行する
 * @param params トランザクションパラメータ
 * @returns MPTokenAuthorize トランザクション
 */
export function buildMPTokenAuthorize(
  params: MPTAuthorizeParams
): SubmittableTransaction {
  return {
    TransactionType: 'MPTokenAuthorize',
    Account: params.account,
    MPTokenIssuanceID: params.mptIssuanceId
  } as SubmittableTransaction;
}
