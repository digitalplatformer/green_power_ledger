import { Pool } from 'pg';
import { Wallet } from 'xrpl';
import { v4 as uuidv4 } from 'uuid';
import { WalletSecretManager } from './wallet-secret-manager';

export interface WalletInfo {
  id: string;
  xrplAddress: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Wallet management service
 * Manages wallet creation, retrieval, and registration
 */
export class WalletManager {
  constructor(
    private pool: Pool,
    private secretManager: WalletSecretManager
  ) {}

  /**
   * Create a new user wallet and store encrypted secret key
   * @param seed Optional: used when importing an existing seed
   * @returns Wallet info
   */
  async createUserWallet(seed?: string): Promise<WalletInfo> {
    // 1. Generate XRPL wallet or restore from existing seed
    const wallet = seed
      ? Wallet.fromSeed(seed)
      : Wallet.generate();

    // 2. Generate wallet ID
    const walletId = uuidv4();

    // 3. Encrypt secret key (using WalletSecretManager's encrypt logic)
    const { encrypt } = await import('../crypto/encryption');
    const encrypted = await encrypt(
      wallet.seed!,
      this.secretManager['masterKey']
    );

    // 4. Convert encryption context (IV, authTag) to JSON
    const encryptionContext = {
      iv: encrypted.iv.toString('hex'),
      authTag: encrypted.authTag.toString('hex')
    };

    // 5. Save wallet info and encrypted secret key to DB
    await this.pool.query(
      `INSERT INTO wallets (id, xrpl_address, encrypted_secret, encryption_context, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [
        walletId,
        wallet.address,
        encrypted.ciphertext,
        encryptionContext
      ]
    );

    console.log(
      `✓ Wallet created successfully: ${wallet.address} (ID: ${walletId})`
    );

    return {
      id: walletId,
      xrplAddress: wallet.address,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Get issuer wallet info from .env (treated as virtual wallet)
   * Issuer wallet is not stored in DB, always restored from .env
   * @returns Issuer wallet info (virtual)
   */
  async ensureIssuerWallet(): Promise<WalletInfo> {
    const issuerSeed = process.env.ISSUER_SEED;

    if (!issuerSeed) {
      throw new Error('ISSUER_SEED is not configured in .env');
    }

    // Restore issuer wallet from .env (not saved to DB)
    const wallet = Wallet.fromSeed(issuerSeed);

    return {
      id: 'issuer', // Special constant ID
      xrplAddress: wallet.address,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Get issuer wallet
   * @returns Issuer wallet info
   */
  async getIssuerWallet(): Promise<WalletInfo> {
    return this.ensureIssuerWallet();
  }

  /**
   * Get wallet info by wallet ID
   * @param walletId Wallet ID (returns virtual wallet if 'issuer')
   * @returns Wallet info
   */
  async getWallet(walletId: string): Promise<WalletInfo | null> {
    // Handle special 'issuer' ID
    if (walletId === 'issuer') {
      return this.getIssuerWallet();
    }

    // DB search for regular user wallet
    const result = await this.pool.query(
      `SELECT id, xrpl_address, created_at, updated_at
       FROM wallets
       WHERE id = $1`,
      [walletId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      xrplAddress: row.xrpl_address,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Get all user wallets (for debugging/management)
   * Note: issuer wallet is not included (not stored in DB)
   * @returns Array of wallet info
   */
  async listWallets(): Promise<WalletInfo[]> {
    const result = await this.pool.query(
      `SELECT id, xrpl_address, created_at, updated_at
       FROM wallets
       ORDER BY created_at DESC`
    );

    return result.rows.map((row) => ({
      id: row.id,
      xrplAddress: row.xrpl_address,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * Add XRP to user wallet from faucet
   * Testnet/devnet only (not available in production)
   * @param walletId Wallet ID
   * @returns Funding result (balance info)
   */
  async addFund(walletId: string): Promise<{
    walletId: string;
    xrplAddress: string;
    balanceBefore: number;
    balanceAfter: number;
    amountFunded: string;
  }> {
    // 1. Reject funding to issuer wallet
    if (walletId === 'issuer') {
      throw new Error('Cannot fund issuer wallet. Issuer is managed via .env');
    }

    // 2. Get wallet info
    const wallet = await this.getWallet(walletId);
    if (!wallet) {
      throw new Error(`Wallet not found: ${walletId}`);
    }

    // 3. Get secret key and restore XRPL Wallet object
    const secret = await this.secretManager.retrieveSecret(walletId);
    const xrplWallet = Wallet.fromSeed(secret);

    // 4. Get XRPL Client
    const { xrplClient } = await import('../xrpl/client');
    const client = xrplClient.getClient();

    // 5. Get balance before funding (0 if account doesn't exist)
    let balanceBefore = 0;
    try {
      balanceBefore = await client.getXrpBalance(wallet.xrplAddress);
    } catch (error: any) {
      // Treat balance as 0 if account doesn't exist (first-time funding)
      if (error.data?.error === 'actNotFound') {
        balanceBefore = 0;
      } else {
        throw error;
      }
    }

    // 6. Fund from faucet (fixed 1000 XRP)
    await client.fundWallet(xrplWallet, {
      amount: '1000'
    });

    // 7. Get balance after funding
    const balanceAfter = await client.getXrpBalance(wallet.xrplAddress);

    console.log(
      `✓ Wallet funded: ${wallet.xrplAddress} (${balanceBefore} → ${balanceAfter} XRP)`
    );

    return {
      walletId: wallet.id,
      xrplAddress: wallet.xrplAddress,
      balanceBefore,
      balanceAfter,
      amountFunded: '1000'
    };
  }
}
