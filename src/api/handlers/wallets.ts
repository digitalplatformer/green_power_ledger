import { Pool } from 'pg';
import { WalletManager } from '../../services/wallet-manager';
import { WalletSecretManager } from '../../services/wallet-secret-manager';
import { masterKeyFromHex } from '../../crypto/encryption';

export interface CreateWalletRequest {
  seed?: string; // 任意: 既存のシードを使用する場合
}

/**
 * POST /api/wallets ハンドラー
 * 新しい user ウォレットを作成する
 * 注意: issuer ウォレットは .env で管理されており、このエンドポイントでは作成できません
 */
export async function handleCreateWallet(
  req: Request,
  pool: Pool
): Promise<Response> {
  try {
    // 1. リクエストボディをパース
    const body = await req.json() as CreateWalletRequest;

    // 2. ウォレットマネージャーを初期化
    const masterKey = masterKeyFromHex(process.env.ENCRYPTION_MASTER_KEY!);
    const secretManager = new WalletSecretManager(pool, masterKey);
    const walletManager = new WalletManager(pool, secretManager);

    // 3. user ウォレットを作成
    const wallet = await walletManager.createUserWallet(body.seed);

    // 4. レスポンスを返す
    return new Response(
      JSON.stringify({
        id: wallet.id,
        xrplAddress: wallet.xrplAddress,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Create wallet error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * GET /api/wallets/:walletId ハンドラー
 * ウォレット情報を取得する
 * walletId が 'issuer' の場合は virtual wallet を返す
 */
export async function handleGetWallet(
  walletId: string,
  pool: Pool
): Promise<Response> {
  try {
    const masterKey = masterKeyFromHex(process.env.ENCRYPTION_MASTER_KEY!);
    const secretManager = new WalletSecretManager(pool, masterKey);
    const walletManager = new WalletManager(pool, secretManager);

    const wallet = await walletManager.getWallet(walletId);

    if (!wallet) {
      return new Response(
        JSON.stringify({ error: 'Wallet not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        id: wallet.id,
        xrplAddress: wallet.xrplAddress,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Get wallet error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * POST /api/wallets/:walletId/fund ハンドラー
 * テストネット/デブネットの faucet からウォレットに資金を供給する
 */
export async function handleFundWallet(
  walletId: string,
  pool: Pool
): Promise<Response> {
  try {
    // 1. Issuer wallet への funding を拒否
    if (walletId === 'issuer') {
      return new Response(
        JSON.stringify({
          error: 'Cannot fund issuer wallet',
          details: 'Issuer wallet is managed via .env and does not need funding'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. ウォレットマネージャーを初期化
    const masterKey = masterKeyFromHex(process.env.ENCRYPTION_MASTER_KEY!);
    const secretManager = new WalletSecretManager(pool, masterKey);
    const walletManager = new WalletManager(pool, secretManager);

    // 3. 資金供給を実行
    const result = await walletManager.addFund(walletId);

    // 4. レスポンスを返す
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Fund wallet error:', error);

    // ウォレットが見つからない場合
    if (error.message.includes('not found')) {
      return new Response(
        JSON.stringify({ error: 'Wallet not found', details: error.message }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // その他のエラー
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
