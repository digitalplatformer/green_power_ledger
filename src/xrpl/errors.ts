export enum XrplErrorCode {
  // リトライ可能なエラー
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  TEF_PAST_SEQ = 'tefPAST_SEQ',

  // 永続的なエラー
  TEC_UNFUNDED = 'tecUNFUNDED_PAYMENT',
  TEM_INVALID = 'temINVALID',
  TEF_FAILURE = 'tefFAILURE',
  TEC_PATH_DRY = 'tecPATH_DRY',
  TEC_NO_AUTH = 'tecNO_AUTH',
  TEC_NO_LINE = 'tecNO_LINE',

  // 汎用エラー
  UNKNOWN = 'UNKNOWN'
}

/**
 * XRPL 固有のエラークラス
 */
export class XrplError extends Error {
  constructor(
    public code: XrplErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'XrplError';

    // スタックトレースを保持
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, XrplError);
    }
  }

  /**
   * エラーがリトライ可能かどうかを判定
   */
  isRetriable(): boolean {
    return [
      XrplErrorCode.NETWORK_ERROR,
      XrplErrorCode.TIMEOUT,
      XrplErrorCode.TEF_PAST_SEQ
    ].includes(this.code);
  }

  /**
   * エラーの重要度を取得
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
   * エラーを JSON にシリアライズ
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
 * XRPL エラーレスポンスをパースしてカスタム例外に変換
 * @param error XRPL からのエラーオブジェクト
 * @returns XrplError インスタンス
 */
export function parseXrplError(error: any): XrplError {
  // ネットワークエラー
  if (error.message && error.message.includes('WebSocket')) {
    return new XrplError(
      XrplErrorCode.NETWORK_ERROR,
      'XRPL network connection error',
      error
    );
  }

  // txnNotFound（タイムアウト）
  if (error.data?.error === 'txnNotFound') {
    return new XrplError(
      XrplErrorCode.TIMEOUT,
      'Transaction not found in ledger (timeout)',
      error.data
    );
  }

  // XRPL トランザクションエラーコード
  if (error.data?.error) {
    const errorCode = error.data.error;

    // エラーコードをマッピング
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

  // トランザクション結果のエラー
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

  // その他の不明なエラー
  return new XrplError(
    XrplErrorCode.UNKNOWN,
    error.message || 'Unknown XRPL error',
    error
  );
}

/**
 * エラーメッセージをユーザーフレンドリーな形式に変換
 * @param error XrplError インスタンス
 * @returns ユーザーフレンドリーなエラーメッセージ
 */
export function getErrorMessage(error: XrplError): string {
  switch (error.code) {
    case XrplErrorCode.NETWORK_ERROR:
      return 'XRPLネットワークへの接続に失敗しました。ネットワーク接続を確認してください。';

    case XrplErrorCode.TIMEOUT:
      return 'トランザクションの検証がタイムアウトしました。後ほど再試行してください。';

    case XrplErrorCode.TEF_PAST_SEQ:
      return 'トランザクションシーケンスが古すぎます。再試行してください。';

    case XrplErrorCode.TEC_UNFUNDED:
      return 'アカウントの残高が不足しています。XRPを追加してください。';

    case XrplErrorCode.TEM_INVALID:
      return 'トランザクションが無効です。パラメータを確認してください。';

    case XrplErrorCode.TEF_FAILURE:
      return 'トランザクションの実行に失敗しました。';

    case XrplErrorCode.TEC_NO_AUTH:
      return 'MPTの承認が必要です。先に MPTokenAuthorize を実行してください。';

    case XrplErrorCode.TEC_NO_LINE:
      return 'トラストラインが存在しません。';

    default:
      return `XRPL エラーが発生しました: ${error.message}`;
  }
}
