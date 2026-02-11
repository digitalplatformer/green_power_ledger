import { Pool } from 'pg';
import { router } from './api/router';
import { initializeXrplClient } from './xrpl/client';
import { ValidationPoller } from './jobs/validation-poller';
import { WalletManager } from './services/wallet-manager';
import { WalletSecretManager } from './services/wallet-secret-manager';
import { masterKeyFromHex } from './crypto/encryption';

// データベース接続プールを作成
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// XRPL クライアントを初期化
await initializeXrplClient();

console.log('✓ Database pool created');
console.log('✓ XRPL client initialized');

// Issuer ウォレットを確認
const masterKey = masterKeyFromHex(process.env.ENCRYPTION_MASTER_KEY!);
const secretManager = new WalletSecretManager(pool, masterKey);
const walletManager = new WalletManager(pool, secretManager);
const issuerWallet = await walletManager.ensureIssuerWallet();

console.log(`✓ Issuer wallet validated: ${issuerWallet.xrplAddress}`);

// バックグラウンド検証ジョブを開始
const validationPoller = new ValidationPoller(pool, 30000); // 30秒ごと
validationPoller.start();

// Bun HTTP サーバーを起動
const server = Bun.serve({
  port: 3005,
  async fetch(req) {
    try {
      return await router(req, pool);
    } catch (error: any) {
      console.error('Server error:', error);
      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          message: error.message
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
});

console.log(`🚀 Server running at ${server.url}`);
console.log(`📡 API endpoints available:`);
console.log(`  POST   ${server.url}api/operations/mint`);
console.log(`  POST   ${server.url}api/operations/transfer`);
console.log(`  POST   ${server.url}api/operations/burn`);
console.log(`  GET    ${server.url}api/operations/:operationId`);
console.log(`  POST   ${server.url}api/wallets`);
console.log(`  GET    ${server.url}api/wallets/:walletId`);
console.log(`  GET    ${server.url}health`);