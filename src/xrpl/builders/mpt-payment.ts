import type { SubmittableTransaction } from 'xrpl';

export interface MPTPaymentParams {
  account: string;        // Sender
  destination: string;    // Receiver
  mptIssuanceId: string;  // MPT Issuance ID
  amount: string;         // Amount to send (string)
}

/**
 * Build Payment transaction containing MPT
 * @param params Transaction parameters
 * @returns Payment transaction
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
