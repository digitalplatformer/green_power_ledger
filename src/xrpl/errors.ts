export enum XrplErrorCode {
  // Retriable errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  TEF_PAST_SEQ = 'tefPAST_SEQ',

  // Permanent errors
  TEC_UNFUNDED = 'tecUNFUNDED_PAYMENT',
  TEM_INVALID = 'temINVALID',
  TEF_FAILURE = 'tefFAILURE',
  TEC_PATH_DRY = 'tecPATH_DRY',
  TEC_NO_AUTH = 'tecNO_AUTH',
  TEC_NO_LINE = 'tecNO_LINE',

  // Generic error
  UNKNOWN = 'UNKNOWN'
}

/**
 * XRPL-specific error class
 */
export class XrplError extends Error {
  constructor(
    public code: XrplErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'XrplError';

    // Preserve stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, XrplError);
    }
  }

  /**
   * Determine if error is retriable
   */
  isRetriable(): boolean {
    return [
      XrplErrorCode.NETWORK_ERROR,
      XrplErrorCode.TIMEOUT,
      XrplErrorCode.TEF_PAST_SEQ
    ].includes(this.code);
  }

  /**
   * Get error severity
   */
  getSeverity(): 'low' | 'medium' | 'high' | 'critical' {
    switch (this.code) {
      case XrplErrorCode.NETWORK_ERROR:
      case XrplErrorCode.TIMEOUT:
        return 'medium';

      case XrplErrorCode.TEF_PAST_SEQ:
        return 'low';

      case XrplErrorCode.TEC_UNFUNDED:
      case XrplErrorCode.TEM_INVALID:
        return 'high';

      case XrplErrorCode.TEF_FAILURE:
      case XrplErrorCode.TEC_PATH_DRY:
        return 'critical';

      default:
        return 'medium';
    }
  }

  /**
   * Serialize error to JSON
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      isRetriable: this.isRetriable(),
      severity: this.getSeverity(),
      details: this.details
    };
  }
}

/**
 * Parse XRPL error response and convert to custom exception
 * @param error Error object from XRPL
 * @returns XrplError instance
 */
export function parseXrplError(error: any): XrplError {
  // Network error
  if (error.message && error.message.includes('WebSocket')) {
    return new XrplError(
      XrplErrorCode.NETWORK_ERROR,
      'XRPL network connection error',
      error
    );
  }

  // txnNotFound (timeout)
  if (error.data?.error === 'txnNotFound') {
    return new XrplError(
      XrplErrorCode.TIMEOUT,
      'Transaction not found in ledger (timeout)',
      error.data
    );
  }

  // XRPL transaction error code
  if (error.data?.error) {
    const errorCode = error.data.error;

    // Map error code
    const codeMapping: Record<string, XrplErrorCode> = {
      'tefPAST_SEQ': XrplErrorCode.TEF_PAST_SEQ,
      'tecUNFUNDED_PAYMENT': XrplErrorCode.TEC_UNFUNDED,
      'temINVALID': XrplErrorCode.TEM_INVALID,
      'tefFAILURE': XrplErrorCode.TEF_FAILURE,
      'tecPATH_DRY': XrplErrorCode.TEC_PATH_DRY,
      'tecNO_AUTH': XrplErrorCode.TEC_NO_AUTH,
      'tecNO_LINE': XrplErrorCode.TEC_NO_LINE
    };

    const mappedCode = codeMapping[errorCode] || XrplErrorCode.UNKNOWN;

    return new XrplError(
      mappedCode,
      error.data.error_message || `XRPL error: ${errorCode}`,
      error.data
    );
  }

  // Transaction result error
  if (error.result && typeof error.result === 'string') {
    const result = error.result;

    if (result.startsWith('tec')) {
      return new XrplError(
        XrplErrorCode.TEC_UNFUNDED,
        `Transaction failed: ${result}`,
        error
      );
    }

    if (result.startsWith('tem')) {
      return new XrplError(
        XrplErrorCode.TEM_INVALID,
        `Invalid transaction: ${result}`,
        error
      );
    }

    if (result.startsWith('tef')) {
      return new XrplError(
        XrplErrorCode.TEF_FAILURE,
        `Transaction error: ${result}`,
        error
      );
    }
  }

  // Other unknown errors
  return new XrplError(
    XrplErrorCode.UNKNOWN,
    error.message || 'Unknown XRPL error',
    error
  );
}

/**
 * Convert error message to user-friendly format
 * @param error XrplError instance
 * @returns User-friendly error message
 */
export function getErrorMessage(error: XrplError): string {
  switch (error.code) {
    case XrplErrorCode.NETWORK_ERROR:
      return 'Failed to connect to XRPL network. Please check your network connection.';

    case XrplErrorCode.TIMEOUT:
      return 'Transaction validation timed out. Please try again later.';

    case XrplErrorCode.TEF_PAST_SEQ:
      return 'Transaction sequence is too old. Please retry.';

    case XrplErrorCode.TEC_UNFUNDED:
      return 'Insufficient account balance. Please add XRP.';

    case XrplErrorCode.TEM_INVALID:
      return 'Invalid transaction. Please check the parameters.';

    case XrplErrorCode.TEF_FAILURE:
      return 'Transaction execution failed.';

    case XrplErrorCode.TEC_NO_AUTH:
      return 'MPT authorization required. Please execute MPTokenAuthorize first.';

    case XrplErrorCode.TEC_NO_LINE:
      return 'Trust line does not exist.';

    default:
      return `XRPL error occurred: ${error.message}`;
  }
}
