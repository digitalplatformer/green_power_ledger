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
 * Structured logger
 * Outputs logs in JSON format including context like operation_id/step_id/tx_hash
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
   * Debug log
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Info log
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Warning log
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Error log
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
   * Output log entry
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (level < this.minLevel) return;

    // Security check: verify no secret keys are included
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
   * Check if sensitive data is included
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
        // Check key name
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
          return true;
        }

        // Check value (recursive)
        if (typeof obj[key] === 'object') {
          if (checkObject(obj[key])) {
            return true;
          }
        }

        // If value is string, strings starting with 's' and over 20 chars may be seeds
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
   * Metrics log (for performance measurement)
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
