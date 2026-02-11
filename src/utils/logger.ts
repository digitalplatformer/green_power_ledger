export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogContext {
  operationId?: string;
  stepId?: string;
  txHash?: string;
  walletId?: string;
  duration?: number;
  [key: string]: any;
}

/**
 * 構造化ロガー
 * JSON 形式でログを出力し、operation_id/step_id/tx_hash などのコンテキストを含める
 */
class Logger {
  private minLevel: LogLevel;

  constructor() {
    const levelStr = process.env.LOG_LEVEL || 'info';
    this.minLevel = this.parseLogLevel(levelStr);
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'debug':
        return LogLevel.DEBUG;
      case 'info':
        return LogLevel.INFO;
      case 'warn':
        return LogLevel.WARN;
      case 'error':
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * デバッグログ
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * 情報ログ
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * 警告ログ
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * エラーログ
   */
  error(message: string, error?: Error, context?: LogContext): void {
    const errorContext: LogContext = {
      ...context,
      error: error
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          }
        : undefined
    };
    this.log(LogLevel.ERROR, message, errorContext);
  }

  /**
   * ログエントリを出力
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (level < this.minLevel) return;

    // セキュリティチェック: 秘密鍵が含まれていないか確認
    if (context && this.containsSensitiveData(context)) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: 'Attempted to log sensitive data - redacted',
          originalMessage: message
        })
      );
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      ...context
    };

    const output = JSON.stringify(logEntry);

    if (level >= LogLevel.ERROR) {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  /**
   * センシティブなデータが含まれていないかチェック
   */
  private containsSensitiveData(context: any): boolean {
    const sensitiveKeys = [
      'seed',
      'secret',
      'privateKey',
      'private_key',
      'password',
      'masterKey',
      'master_key'
    ];

    const checkObject = (obj: any): boolean => {
      if (typeof obj !== 'object' || obj === null) {
        return false;
      }

      for (const key of Object.keys(obj)) {
        // キー名のチェック
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
          return true;
        }

        // 値のチェック（再帰）
        if (typeof obj[key] === 'object') {
          if (checkObject(obj[key])) {
            return true;
          }
        }

        // 値が文字列の場合、sから始まる20文字以上の文字列はシードの可能性
        if (
          typeof obj[key] === 'string' &&
          obj[key].length > 20 &&
          obj[key].startsWith('s')
        ) {
          return true;
        }
      }

      return false;
    };

    return checkObject(context);
  }

  /**
   * メトリクスログ（パフォーマンス計測用）
   */
  metric(name: string, value: number, context?: LogContext): void {
    this.log(LogLevel.INFO, `Metric: ${name}`, {
      ...context,
      metric: name,
      value
    });
  }
}

export const logger = new Logger();
