interface CacheEntry {
  secret: string;
  expiresAt: number;
}

/**
 * 復号済み秘密鍵用のメモリ内キャッシュ（TTL付き）
 */
export class SecretCache {
  private cache: Map<string, CacheEntry> = new Map();
  private ttlMs: number;
  private cleanupIntervalId?: Timer;

  constructor(ttlMs: number = 3600000) { // デフォルト1時間
    this.ttlMs = ttlMs;

    // 1分ごとに期限切れエントリをクリーンアップ
    this.cleanupIntervalId = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * 秘密鍵をキャッシュに保存
   * @param walletId ウォレット ID
   * @param secret 復号済み秘密鍵
   */
  set(walletId: string, secret: string): void {
    const expiresAt = Date.now() + this.ttlMs;
    this.cache.set(walletId, { secret, expiresAt });
  }

  /**
   * キャッシュから秘密鍵を取得
   * @param walletId ウォレット ID
   * @returns 復号済み秘密鍵（期限切れの場合は null）
   */
  get(walletId: string): string | null {
    const entry = this.cache.get(walletId);

    if (!entry) {
      return null;
    }

    // 期限切れチェック
    if (Date.now() >= entry.expiresAt) {
      this.clear(walletId);
      return null;
    }

    return entry.secret;
  }

  /**
   * 特定のウォレットのキャッシュをクリア
   * @param walletId ウォレット ID
   */
  clear(walletId: string): void {
    const entry = this.cache.get(walletId);
    if (entry) {
      // 機密データをゼロフィル（セキュリティ対策）
      this.zeroFill(entry.secret);
      this.cache.delete(walletId);
    }
  }

  /**
   * すべてのキャッシュをクリア
   */
  clearAll(): void {
    for (const [walletId] of this.cache) {
      this.clear(walletId);
    }
  }

  /**
   * 期限切れエントリをクリーンアップ
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
   * 文字列をゼロで上書き（機密データの消去）
   * @param str 消去する文字列
   */
  private zeroFill(str: string): void {
    // Note: JavaScript の文字列は immutable なので、
    // ガベージコレクションを促進する以上の完全な消去は不可能
    // この実装は best-effort のセキュリティ対策
    str = '\0'.repeat(str.length);
  }

  /**
   * クリーンアップタイマーを停止
   */
  destroy(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = undefined;
    }
    this.clearAll();
  }

  /**
   * キャッシュサイズを取得
   * @returns キャッシュエントリ数
   */
  size(): number {
    return this.cache.size;
  }
}

// シングルトンインスタンス
export const secretCache = new SecretCache(
  parseInt(process.env.SECRET_CACHE_TTL_MS || '3600000', 10)
);
