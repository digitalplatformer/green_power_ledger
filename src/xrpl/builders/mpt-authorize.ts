import type { SubmittableTransaction } from 'xrpl';

export interface MPTAuthorizeParams {
  account: string;        // Receiver account
  mptIssuanceId: string;  // MPT Issuance ID
}

/**
 * Build MPTokenAuthorize transaction
 * Executed by receiver to accept MPT
 * @param params Transaction parameters
 * @returns MPTokenAuthorize transaction
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
