import { Wallet } from 'xrpl';
import type { SubmittableTransaction, SubmitResponse } from 'xrpl';
import { xrplClient } from './client';

export interface SubmitResult {
  txHash: string;
  ledgerIndex: number;
  submitResult: SubmitResponse;
}

/**
 * Submit transaction to XRPL
 * @param transaction Transaction object
 * @param wallet Wallet for signing
 * @returns Submit result (tx_hash, ledger_index)
 */
export async function submitTransaction(
  transaction: SubmittableTransaction,
  wallet: Wallet
): Promise<SubmitResult> {
  const client = xrplClient.getClient();

  try {
    // Prepare transaction with autofill (Fee, Sequence, etc.)
    const prepared = await client.autofill(transaction);

    // Sign
    const signed = wallet.sign(prepared);

    // Submit
    const result = await client.submit(signed.tx_blob);

    // Extract tx_hash
    const txHash = result.result.tx_json.hash || signed.hash;

    console.log(`✓ Transaction submitted successfully: ${txHash}`);

    return {
      txHash,
      ledgerIndex: result.result.validated_ledger_index || 0,
      submitResult: result
    };
  } catch (error: any) {
    console.error('✗ Transaction submission failed:', error);

    // Log error details
    if (error.data) {
      console.error('Error data:', JSON.stringify(error.data, null, 2));
    }

    throw error;
  }
}
