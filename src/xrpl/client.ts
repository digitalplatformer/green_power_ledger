import { Client } from 'xrpl';

export type XrplNetwork = 'testnet' | 'devnet' | 'mainnet';

const NETWORK_URLS: Record<XrplNetwork, string> = {
  testnet: 'wss://s.altnet.rippletest.net:51233',
  devnet: 'wss://s.devnet.rippletest.net:51233',
  mainnet: 'wss://xrplcluster.com'
};

/**
 * XRPL クライアントラッパー
 * testnet/devnet への接続を管理し、接続プール/再利用を提供
 */
export class XrplClientWrapper {
  private client: Client;
  private connected: boolean = false;
  private network: XrplNetwork;

  constructor(network: XrplNetwork) {
    this.network = network;
    this.client = new Client(NETWORK_URLS[network]);
  }

  /**
   * XRPL ネットワークに接続
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.client.connect();
      this.connected = true;
      console.log(`✓ XRPL ${this.network} に接続しました`);
    } catch (error) {
      console.error(`✗ XRPL ${this.network} への接続に失敗しました:`, error);
      throw error;
    }
  }

  /**
   * XRPL ネットワークから切断
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.client.disconnect();
      this.connected = false;
      console.log(`✓ XRPL ${this.network} から切断しました`);
    } catch (error) {
      console.error(`✗ XRPL ${this.network} からの切断に失敗しました:`, error);
      throw error;
    }
  }

  /**
   * 接続状態を確認
   */
  isConnected(): boolean {
    return this.connected && this.client.isConnected();
  }

  /**
   * XRPL クライアントを取得
   * @throws 接続されていない場合はエラー
   */
  getClient(): Client {
    if (!this.connected) {
      throw new Error('Client not connected. Call connect() first.');
    }
    return this.client;
  }

  /**
   * ネットワーク名を取得
   */
  getNetwork(): XrplNetwork {
    return this.network;
  }

  /**
   * 接続を再試行
   */
  async reconnect(): Promise<void> {
    console.log(`XRPL ${this.network} への再接続を試みています...`);
    await this.disconnect();
    await this.connect();
  }
}

// シングルトンインスタンス
const network = (process.env.XRPL_NETWORK as XrplNetwork) || 'testnet';
export const xrplClient = new XrplClientWrapper(network);

/**
 * アプリケーション起動時に XRPL クライアントを初期化
 */
export async function initializeXrplClient(): Promise<void> {
  await xrplClient.connect();
}

/**
 * アプリケーション終了時に XRPL クライアントをクリーンアップ
 */
export async function cleanupXrplClient(): Promise<void> {
  await xrplClient.disconnect();
}
