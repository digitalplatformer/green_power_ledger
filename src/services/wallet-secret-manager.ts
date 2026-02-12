import { Pool } from 'pg';
import { encrypt, decrypt} from '../crypto/encryption';
import { secretCache } from '../crypto/secret-cache';

/**
 * Wallet secret key management service
 * Manages encrypted storage, decryption, and caching of secret keys
 */
export class WalletSecretManager {
  constructor(
    private pool: Pool,
    private masterKey: Buffer
  ) {}

  /**
   * Encrypt secret key and save to database
   * @param walletId Wallet ID
   * @param secret Secret key (plaintext)
   */
  async storeSecret(walletId: string, secret: string): Promise<void> {
    // Issuer wallet secret is managed via .env, so saving is not allowed
    if (walletId === 'issuer') {
      throw new Error('Cannot store issuer secret. Issuer seed must be managed via .env');
    }

    // 1. Encrypt secret key
    const encrypted = await encrypt(secret, this.masterKey);

    // 2. Convert encryption context (IV, authTag) to JSON
    const encryptionContext = {
      iv: encrypted.iv.toString('hex'),
      authTag: encrypted.authTag.toString('hex')
    };

    // 3. Save to database
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
   * Retrieve secret key (from cache if available, otherwise decrypt from DB)
   * For issuer wallet, retrieve directly from .env
   * @param walletId Wallet ID
   * @returns Decrypted secret key
   */
  async retrieveSecret(walletId: string): Promise<string> {
    // Special handling for issuer wallet: return directly from .env
    if (walletId === 'issuer') {
      const issuerSeed = process.env.ISSUER_SEED;
      if (!issuerSeed) {
        throw new Error('ISSUER_SEED is not configured in .env');
      }
      return issuerSeed;
    }

    // 1. Check cache (user wallet only)
    const cached = secretCache.get(walletId);
    if (cached) {
      return cached;
    }

    // 2. Retrieve from database
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

    // 3. Encryption context (PostgreSQL JSONB is automatically parsed)
    const context = encryption_context;

    // 4. Decrypt
    const decrypted = await decrypt(
      {
        ciphertext: encrypted_secret,
        iv: Buffer.from(context.iv, 'hex'),
        authTag: Buffer.from(context.authTag, 'hex')
      },
      this.masterKey
    );

    // 5. Save to cache
    secretCache.set(walletId, decrypted);

    return decrypted;
  }

  /**
   * Clear cache
   * @param walletId Wallet ID
   */
  clearCache(walletId: string): void {
    secretCache.clear(walletId);
  }

  /**
   * Clear all cache
   */
  clearAllCache(): void {
    secretCache.clearAll();
  }
}
