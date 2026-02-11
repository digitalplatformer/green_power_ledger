import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export interface EncryptionResult {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

/**
 * AES-256-GCM で平文を暗号化する
 * @param plaintext 暗号化する平文
 * @param masterKey 32バイトのマスター鍵
 * @returns 暗号化結果（ciphertext, iv, authTag）
 */
export async function encrypt(
  plaintext: string,
  masterKey: Buffer
): Promise<EncryptionResult> {
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error(`Master key must be ${KEY_LENGTH} bytes`);
  }

  // ランダムな初期化ベクトル（IV）を生成
  const iv = randomBytes(IV_LENGTH);

  // 暗号化オブジェクトを作成
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);

  // 暗号化を実行
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  // 認証タグを取得
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv,
    authTag
  };
}

/**
 * AES-256-GCM で暗号文を復号化する
 * @param encrypted 暗号化結果
 * @param masterKey 32バイトのマスター鍵
 * @returns 復号化された平文
 */
export async function decrypt(
  encrypted: EncryptionResult,
  masterKey: Buffer
): Promise<string> {
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error(`Master key must be ${KEY_LENGTH} bytes`);
  }

  // 復号化オブジェクトを作成
  const decipher = createDecipheriv(ALGORITHM, masterKey, encrypted.iv);

  // 認証タグを設定
  decipher.setAuthTag(encrypted.authTag);

  // 復号化を実行
  const decrypted = Buffer.concat([
    decipher.update(encrypted.ciphertext),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

/**
 * 32バイトのランダムなマスター鍵を生成する
 * @returns 32バイトのマスター鍵
 */
export function generateMasterKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

/**
 * 16進数文字列からマスター鍵 Buffer を作成する
 * @param hex 16進数文字列（64文字）
 * @returns 32バイトのマスター鍵
 */
export function masterKeyFromHex(hex: string): Buffer {
  if (hex.length !== KEY_LENGTH * 2) {
    throw new Error(`Master key hex must be ${KEY_LENGTH * 2} characters`);
  }
  return Buffer.from(hex, 'hex');
}
