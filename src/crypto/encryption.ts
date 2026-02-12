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
 * Encrypts plaintext using AES-256-GCM
 * @param plaintext The plaintext to encrypt
 * @param masterKey 32-byte master key
 * @returns Encryption result (ciphertext, iv, authTag)
 */
export async function encrypt(
  plaintext: string,
  masterKey: Buffer
): Promise<EncryptionResult> {
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error(`Master key must be ${KEY_LENGTH} bytes`);
  }

  // Generate random initialization vector (IV)
  const iv = randomBytes(IV_LENGTH);

  // Create cipher object
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);

  // Execute encryption
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv,
    authTag
  };
}

/**
 * Decrypts ciphertext using AES-256-GCM
 * @param encrypted Encryption result
 * @param masterKey 32-byte master key
 * @returns Decrypted plaintext
 */
export async function decrypt(
  encrypted: EncryptionResult,
  masterKey: Buffer
): Promise<string> {
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error(`Master key must be ${KEY_LENGTH} bytes`);
  }

  // Create decipher object
  const decipher = createDecipheriv(ALGORITHM, masterKey, encrypted.iv);

  // Set authentication tag
  decipher.setAuthTag(encrypted.authTag);

  // Execute decryption
  const decrypted = Buffer.concat([
    decipher.update(encrypted.ciphertext),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

/**
 * Generates a random 32-byte master key
 * @returns 32-byte master key
 */
export function generateMasterKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

/**
 * Creates a master key Buffer from a hexadecimal string
 * @param hex Hexadecimal string (64 characters)
 * @returns 32-byte master key
 */
export function masterKeyFromHex(hex: string): Buffer {
  if (hex.length !== KEY_LENGTH * 2) {
    throw new Error(`Master key hex must be ${KEY_LENGTH * 2} characters`);
  }
  return Buffer.from(hex, 'hex');
}
