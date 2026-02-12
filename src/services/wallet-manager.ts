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
 * ウォレット管理サービス
 * ウォレットの作成、取得、登録を管理
 */
export class WalletManager {
  constructor(
    private pool: Pool,
    private secretManager: WalletSecretManager
  ) {}

  /**
   * 新しい user ウォレットを作成し、秘密鍵を暗号化して保存
   * @param seed 任意: 既存のシードを使用する場合
   * @returns ウォレット情報
   */
  async createUserWallet(seed?: string): Promise<WalletInfo> {
    // 1. XRPL ウォレットを生成または既存のシードから復元
    const wallet = seed
      ? Wallet.fromSeed(seed)
      : Wallet.generate();

    // 2. ウォレットIDを生成
    const walletId = uuidv4();

    // 3. 秘密鍵を暗号化（WalletSecretManager の encrypt ロジックを使用）
    const { encrypt } = await import('../crypto/encryption');
    const encrypted = await encrypt(
      wallet.seed!,
      this.secretManager['masterKey']
    );

    // 4. 暗号化コンテキスト（IV, authTag）を JSON に変換
    const encryptionContext = {
      iv: encrypted.iv.toString('hex'),
      authTag: encrypted.authTag.toString('hex')
    };

    // 5. ウォレット情報と暗号化された秘密鍵をDBに一括保存
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
      `✓ ウォレット作成成功: ${wallet.address} (ID: ${walletId})`
    );

    return {
      id: walletId,
      xrplAddress: wallet.address,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * .env から issuer ウォレット情報を取得（virtual wallet として扱う）
   * issuer wallet は DB に保存せず、常に .env から復元する
   * @returns issuer ウォレット情報（virtual）
   */
  async ensureIssuerWallet(): Promise<WalletInfo> {
    const issuerSeed = process.env.ISSUER_SEED;

    if (!issuerSeed) {
      throw new Error('ISSUER_SEED is not configured in .env');
    }

    // .env から issuer wallet を復元（DB には保存しない）
    const wallet = Wallet.fromSeed(issuerSeed);

    return {
      id: 'issuer', // 特別な定数 ID
      xrplAddress: wallet.address,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Issuer ウォレットを取得
   * @returns issuer ウォレット情報
   */
  async getIssuerWallet(): Promise<WalletInfo> {
    return this.ensureIssuerWallet();
  }

  /**
   * ウォレットIDからウォレット情報を取得
   * @param walletId ウォレットID（'issuer' の場合は virtual wallet を返す）
   * @returns ウォレット情報
   */
  async getWallet(walletId: string): Promise<WalletInfo | null> {
    // 特別な 'issuer' ID の処理
    if (walletId === 'issuer') {
      return this.getIssuerWallet();
    }

    // 通常の user wallet の DB 検索
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
   * すべての user ウォレットを取得（デバッグ・管理用）
   * 注意: issuer wallet は含まれません（DB に保存されていないため）
   * @returns ウォレット情報の配列
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
   * User wallet に faucet から XRP を追加
   * テストネット/デブネット専用（本番環境では使用不可）
   * @param walletId ウォレットID
   * @returns 資金供給結果（残高情報）
   */
  async addFund(walletId: string): Promise<{
    walletId: string;
    xrplAddress: string;
    balanceBefore: number;
    balanceAfter: number;
    amountFunded: string;
  }> {
    // 1. Issuer wallet への funding は拒否
    if (walletId === 'issuer') {
      throw new Error('Cannot fund issuer wallet. Issuer is managed via .env');
    }

    // 2. Wallet 情報を取得
    const wallet = await this.getWallet(walletId);
    if (!wallet) {
      throw new Error(`Wallet not found: ${walletId}`);
    }

    // 3. 秘密鍵を取得して XRPL Wallet オブジェクトを復元
    const secret = await this.secretManager.retrieveSecret(walletId);
    const xrplWallet = Wallet.fromSeed(secret);

    // 4. XRPL Client を取得
    const { xrplClient } = await import('../xrpl/client');
    const client = xrplClient.getClient();

    // 5. 資金供給前の残高を取得（アカウントが存在しない場合は0）
    let balanceBefore = 0;
    try {
      balanceBefore = await client.getXrpBalance(wallet.xrplAddress);
    } catch (error: any) {
      // アカウントが存在しない場合（初回資金供給）は残高0として扱う
      if (error.data?.error === 'actNotFound') {
        balanceBefore = 0;
      } else {
        throw error;
      }
    }

    // 6. Faucet から資金供給（固定 1000 XRP）
    await client.fundWallet(xrplWallet, {
      amount: '1000'
    });

    // 7. 資金供給後の残高を取得
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
