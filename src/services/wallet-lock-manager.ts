/**
 * Wallet sequence lock manager
 * Uses in-process mutex to allow only one transaction at a time per wallet
 */
export class WalletLockManager {
  private locks: Map<string, Promise<void>> = new Map();

  /**
   * Lock wallet and execute function
   * @param walletId Wallet ID
   * @param fn Function to execute
   * @returns Return value of function
   */
  async withLock<T>(walletId: string, fn: () => Promise<T>): Promise<T> {
    // Wait if lock already exists
    while (this.locks.has(walletId)) {
      await this.locks.get(walletId);
    }

    // Create lock
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.locks.set(walletId, lockPromise);

    try {
      console.log(`🔒 Wallet ${walletId} locked`);

      // Execute function
      const result = await fn();

      console.log(`🔓 Wallet ${walletId} unlocked`);

      return result;
    } finally {
      // Release lock
      this.locks.delete(walletId);
      releaseLock!();
    }
  }

  /**
   * Check if specific wallet is locked
   * @param walletId Wallet ID
   * @returns true: locked, false: unlocked
   */
  isLocked(walletId: string): boolean {
    return this.locks.has(walletId);
  }

  /**
   * Get number of currently locked wallets
   * @returns Number of locks
   */
  getLockedCount(): number {
    return this.locks.size;
  }

  /**
   * Clear all locks (for testing)
   */
  clearAll(): void {
    this.locks.clear();
  }
}

// Singleton instance
export const walletLockManager = new WalletLockManager();
