import { Client } from 'xrpl';

export type XrplNetwork = 'testnet' | 'devnet' | 'mainnet';

const NETWORK_URLS: Record<XrplNetwork, string> = {
  testnet: 'wss://s.altnet.rippletest.net:51233',
  devnet: 'wss://s.devnet.rippletest.net:51233',
  mainnet: 'wss://xrplcluster.com'
};

/**
 * XRPL client wrapper
 * Manages connections to testnet/devnet and provides connection pooling/reuse
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
   * Connect to XRPL network
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.client.connect();
      this.connected = true;
      console.log(`✓ Connected to XRPL ${this.network}`);
    } catch (error) {
      console.error(`✗ Failed to connect to XRPL ${this.network}:`, error);
      throw error;
    }
  }

  /**
   * Disconnect from XRPL network
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.client.disconnect();
      this.connected = false;
      console.log(`✓ Disconnected from XRPL ${this.network}`);
    } catch (error) {
      console.error(`✗ Failed to disconnect from XRPL ${this.network}:`, error);
      throw error;
    }
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.connected && this.client.isConnected();
  }

  /**
   * Get XRPL client
   * @throws Error if not connected
   */
  getClient(): Client {
    if (!this.connected) {
      throw new Error('Client not connected. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Get network name
   */
  getNetwork(): XrplNetwork {
    return this.network;
  }

  /**
   * Retry connection
   */
  async reconnect(): Promise<void> {
    console.log(`Attempting to reconnect to XRPL ${this.network}...`);
    await this.disconnect();
    await this.connect();
  }
}

// Singleton instance
const network = (process.env.XRPL_NETWORK as XrplNetwork) || 'testnet';
export const xrplClient = new XrplClientWrapper(network);

/**
 * Initialize XRPL client on application startup
 */
export async function initializeXrplClient(): Promise<void> {
  await xrplClient.connect();
}

/**
 * Cleanup XRPL client on application shutdown
 */
export async function cleanupXrplClient(): Promise<void> {
  await xrplClient.disconnect();
}
