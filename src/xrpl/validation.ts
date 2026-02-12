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
 * Wait for transaction validation to complete
 * @param txHash Transaction hash
 * @param timeoutMs Overall timeout (default 2 minutes)
 * @param pollIntervalMs Polling interval (default 5 seconds)
 * @returns Validation result
 */
export async function waitForValidation(
  txHash: string,
  timeoutMs: number = 15000,
  pollIntervalMs: number = 2000
): Promise<ValidationResult> {
  const client = xrplClient.getClient();
  const startTime = Date.now();

  console.log(`Waiting for transaction ${txHash} validation...`);

  while (Date.now() - startTime < timeoutMs) {
    try {
      // Get transaction
      const txResult = await client.request({
        command: 'tx',
        transaction: txHash
      });

      // Check if validated
      if (txResult.result.validated) {
        const meta = txResult.result.meta;

        // Check TransactionResult
        if (typeof meta === 'object' && 'TransactionResult' in meta) {
          const result = meta.TransactionResult as string;

          if (result === 'tesSUCCESS') {
            console.log(`✓ Transaction ${txHash} succeeded`);
            return {
              status: ValidationStatus.SUCCESS,
              ledgerIndex: txResult.result.ledger_index,
              transactionResult: result,
              details: txResult.result
            };
          } else {
            console.error(`✗ Transaction ${txHash} failed: ${result}`);
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
      // txNotFound is normal (not yet included in ledger)
      if (error?.data?.error !== 'txnNotFound') {
        console.error('Transaction retrieval error:', error);
      }
    }

    // Wait until next poll
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  // Timeout
  console.warn(`⚠ Transaction ${txHash} validation timed out`);
  return {
    status: ValidationStatus.TIMEOUT
  };
}
