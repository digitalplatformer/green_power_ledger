import type { SubmittableTransaction } from 'xrpl';

export interface MPTClawbackParams {
  account: string;        // Issuer account
  holder: string;         // Holder account to clawback from
  mptIssuanceId: string;  // MPT Issuance ID
  amount: string;         // Amount to clawback (string)
}

/**
 * Build Clawback transaction
 * Issuer retrieves MPT from holder (equivalent to burn)
 * @param params Transaction parameters
 * @returns Clawback transaction
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
