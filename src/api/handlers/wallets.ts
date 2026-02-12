import { Pool } from 'pg';
import { WalletManager } from '../../services/wallet-manager';
import { WalletSecretManager } from '../../services/wallet-secret-manager';
import { masterKeyFromHex } from '../../crypto/encryption';

export interface CreateWalletRequest {
  seed?: string; // Optional: used when importing an existing seed
}

/**
 * POST /api/wallets handler
 * Creates a new user wallet
 * Note: Issuer wallet is managed via .env and cannot be created through this endpoint
 */
export async function handleCreateWallet(
  req: Request,
  pool: Pool
): Promise<Response> {
  try {
    // 1. Parse request body
    const body = await req.json() as CreateWalletRequest;

    // 2. Initialize wallet manager
    const masterKey = masterKeyFromHex(process.env.ENCRYPTION_MASTER_KEY!);
    const secretManager = new WalletSecretManager(pool, masterKey);
    const walletManager = new WalletManager(pool, secretManager);

    // 3. Create user wallet
    const wallet = await walletManager.createUserWallet(body.seed);

    // 4. Return response
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
 * GET /api/wallets/:walletId handler
 * Retrieves wallet information
 * Returns virtual wallet when walletId is 'issuer'
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
 * POST /api/wallets/:walletId/fund handler
 * Supplies funds to a wallet from the testnet/devnet faucet
 */
export async function handleFundWallet(
  walletId: string,
  pool: Pool
): Promise<Response> {
  try {
    // 1. Reject funding to issuer wallet
    if (walletId === 'issuer') {
      return new Response(
        JSON.stringify({
          error: 'Cannot fund issuer wallet',
          details: 'Issuer wallet is managed via .env and does not need funding'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Initialize wallet manager
    const masterKey = masterKeyFromHex(process.env.ENCRYPTION_MASTER_KEY!);
    const secretManager = new WalletSecretManager(pool, masterKey);
    const walletManager = new WalletManager(pool, secretManager);

    // 3. Execute funding
    const result = await walletManager.addFund(walletId);

    // 4. Return response
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Fund wallet error:', error);

    // When wallet is not found
    if (error.message.includes('not found')) {
      return new Response(
        JSON.stringify({ error: 'Wallet not found', details: error.message }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Other errors
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
