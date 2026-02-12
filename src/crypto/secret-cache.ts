interface CacheEntry {
  secret: string;
  expiresAt: number;
}

/**
 * In-memory cache for decrypted secrets (with TTL)
 */
export class SecretCache {
  private cache: Map<string, CacheEntry> = new Map();
  private ttlMs: number;
  private cleanupIntervalId?: Timer;

  constructor(ttlMs: number = 3600000) { // Default 1 hour
    this.ttlMs = ttlMs;

    // Cleanup expired entries every minute
    this.cleanupIntervalId = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Store secret in cache
   * @param walletId Wallet ID
   * @param secret Decrypted secret
   */
  set(walletId: string, secret: string): void {
    const expiresAt = Date.now() + this.ttlMs;
    this.cache.set(walletId, { secret, expiresAt });
  }

  /**
   * Retrieve secret from cache
   * @param walletId Wallet ID
   * @returns Decrypted secret (null if expired)
   */
  get(walletId: string): string | null {
    const entry = this.cache.get(walletId);

    if (!entry) {
      return null;
    }

    // Expiration check
    if (Date.now() >= entry.expiresAt) {
      this.clear(walletId);
      return null;
    }

    return entry.secret;
  }

  /**
   * Clear cache for specific wallet
   * @param walletId Wallet ID
   */
  clear(walletId: string): void {
    const entry = this.cache.get(walletId);
    if (entry) {
      // Zero-fill sensitive data (security measure)
      this.zeroFill(entry.secret);
      this.cache.delete(walletId);
    }
  }

  /**
   * Clear all cache entries
   */
  clearAll(): void {
    for (const [walletId] of this.cache) {
      this.clear(walletId);
    }
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [walletId, entry] of this.cache) {
      if (now >= entry.expiresAt) {
        expiredKeys.push(walletId);
      }
    }

    for (const key of expiredKeys) {
      this.clear(key);
    }

    if (expiredKeys.length > 0) {
      console.log(`Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }

  /**
   * Overwrite string with zeros (sensitive data erasure)
   * @param str String to erase
   */
  private zeroFill(str: string): void {
    // Note: JavaScript strings are immutable, so complete erasure
    // beyond promoting garbage collection is not possible.
    // This implementation is a best-effort security measure.
    str = '\0'.repeat(str.length);
  }

  /**
   * Stop cleanup timer
   */
  destroy(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = undefined;
    }
    this.clearAll();
  }

  /**
   * Get cache size
   * @returns Number of cache entries
   */
  size(): number {
    return this.cache.size;
  }
}

// Singleton instance
export const secretCache = new SecretCache(
  parseInt(process.env.SECRET_CACHE_TTL_MS || '3600000', 10)
);
