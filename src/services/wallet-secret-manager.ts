import { Pool } from 'pg';
import { encrypt, decrypt} from '../crypto/encryption';
import { secretCache } from '../crypto/secret-cache';

/**
 * ウォレット秘密鍵管理サービス
 * 秘密鍵の暗号化保存・復号化・キャッシュを管理
 */
export class WalletSecretManager {
  constructor(
    private pool: Pool,
    private masterKey: Buffer
  ) {}

  /**
   * 秘密鍵を暗号化してデータベースに保存
   * @param walletId ウォレット ID
   * @param secret 秘密鍵（平文）
   */
  async storeSecret(walletId: string, secret: string): Promise<void> {
    // issuer wallet の秘密鍵は .env で管理するため、保存を許可しない
    if (walletId === 'issuer') {
      throw new Error('Cannot store issuer secret. Issuer seed must be managed via .env');
    }

    // 1. 秘密鍵を暗号化
    const encrypted = await encrypt(secret, this.masterKey);

    // 2. 暗号化コンテキスト（IV, authTag）を JSON に変換
    const encryptionContext = {
      iv: encrypted.iv.toString('hex'),
      authTag: encrypted.authTag.toString('hex')
    };

    // 3. データベースに保存
    await this.pool.query(
      `UPDATE wallets
       SET encrypted_secret = $1,
           encryption_context = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [encrypted.ciphertext, JSON.stringify(encryptionContext), walletId]
    );
  }

  /**
   * 秘密鍵を取得（キャッシュから取得、なければDB から復号化）
   * issuer wallet の場合は .env から直接取得
   * @param walletId ウォレット ID
   * @returns 復号済み秘密鍵
   */
  async retrieveSecret(walletId: string): Promise<string> {
    // issuer wallet の特別処理: .env から直接返す
    if (walletId === 'issuer') {
      const issuerSeed = process.env.ISSUER_SEED;
      if (!issuerSeed) {
        throw new Error('ISSUER_SEED is not configured in .env');
      }
      return issuerSeed;
    }

    // 1. キャッシュをチェック（user wallet のみ）
    const cached = secretCache.get(walletId);
    if (cached) {
      return cached;
    }

    // 2. データベースから取得
    const result = await this.pool.query(
      `SELECT encrypted_secret, encryption_context
       FROM wallets
       WHERE id = $1`,
      [walletId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Wallet not found: ${walletId}`);
    }

    const { encrypted_secret, encryption_context } = result.rows[0];

    if (!encrypted_secret || !encryption_context) {
      throw new Error(`Wallet ${walletId} has no encrypted secret`);
    }

    // 3. 暗号化コンテキスト（PostgreSQL の JSONB は自動的にパースされる）
    const context = encryption_context;

    // 4. 復号化
    const decrypted = await decrypt(
      {
        ciphertext: encrypted_secret,
        iv: Buffer.from(context.iv, 'hex'),
        authTag: Buffer.from(context.authTag, 'hex')
      },
      this.masterKey
    );

    // 5. キャッシュに保存
    secretCache.set(walletId, decrypted);

    return decrypted;
  }

  /**
   * キャッシュをクリア
   * @param walletId ウォレット ID
   */
  clearCache(walletId: string): void {
    secretCache.clear(walletId);
  }

  /**
   * すべてのキャッシュをクリア
   */
  clearAllCache(): void {
    secretCache.clearAll();
  }
}
