/**
 * ウォレットシーケンスロック管理
 * プロセス内 mutex を使用して、1つのウォレットに対して同時に1つのトランザクションのみを許可
 */
export class WalletLockManager {
  private locks: Map<string, Promise<void>> = new Map();

  /**
   * ウォレットをロックして関数を実行
   * @param walletId ウォレットID
   * @param fn 実行する関数
   * @returns 関数の戻り値
   */
  async withLock<T>(walletId: string, fn: () => Promise<T>): Promise<T> {
    // すでにロックが存在する場合は待機
    while (this.locks.has(walletId)) {
      await this.locks.get(walletId);
    }

    // ロックを作成
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.locks.set(walletId, lockPromise);

    try {
      console.log(`🔒 ウォレット ${walletId} をロックしました`);

      // 関数を実行
      const result = await fn();

      console.log(`🔓 ウォレット ${walletId} のロックを解除しました`);

      return result;
    } finally {
      // ロックを解放
      this.locks.delete(walletId);
      releaseLock!();
    }
  }

  /**
   * 特定のウォレットがロックされているかチェック
   * @param walletId ウォレットID
   * @returns true: ロック中, false: 未ロック
   */
  isLocked(walletId: string): boolean {
    return this.locks.has(walletId);
  }

  /**
   * 現在ロックされているウォレットの数を取得
   * @returns ロック数
   */
  getLockedCount(): number {
    return this.locks.size;
  }

  /**
   * すべてのロックをクリア（テスト用）
   */
  clearAll(): void {
    this.locks.clear();
  }
}

// シングルトンインスタンス
export const walletLockManager = new WalletLockManager();
