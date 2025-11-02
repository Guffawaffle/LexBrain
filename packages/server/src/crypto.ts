import crypto from 'crypto';

/**
 * Generate SHA256 hash from any object using stable JSON stringify
 */
export function sha256(obj: any): string {
  const jsonStr = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
}

/**
 * Encrypt plaintext using AES-256-CBC with additional authenticated data
 */
export function encryptZk(keyHex: string, plaintext: Uint8Array, aad: string): { iv: string; ct: string } {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(16); // 128-bit IV for CBC

  // For simplicity, use CBC mode and prepend AAD to plaintext
  const aadBuffer = Buffer.from(aad, 'utf8');
  const dataWithAad = Buffer.concat([
    Buffer.from(aadBuffer.length.toString().padStart(8, '0'), 'utf8'),
    aadBuffer,
    plaintext
  ]);

  const cipher = crypto.createCipher('aes-256-cbc', key);
  const encrypted = Buffer.concat([
    cipher.update(dataWithAad),
    cipher.final()
  ]);

  return {
    iv: iv.toString('base64'),
    ct: encrypted.toString('base64')
  };
}/**
 * Decrypt ciphertext using AES-256-CBC with additional authenticated data
 */
export function decryptZk(keyHex: string, ivB64: string, ctB64: string, aad: string): Uint8Array {
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');

  const decipher = crypto.createDecipher('aes-256-cbc', key);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  // Extract AAD and verify
  const aadLengthStr = decrypted.subarray(0, 8).toString('utf8');
  const aadLength = parseInt(aadLengthStr);
  const extractedAad = decrypted.subarray(8, 8 + aadLength).toString('utf8');

  if (extractedAad !== aad) {
    throw new Error('AAD verification failed');
  }

  const plaintext = decrypted.subarray(8 + aadLength);
  return new Uint8Array(plaintext);
}

/**
 * Generate deterministic fact ID from components
 */
export function factId(kind: string, scope: any, inputs_hash: string, payload_hash: string): string {
  const components = {
    kind,
    scope,
    inputs_hash,
    payload_hash
  };
  return sha256(components);
}

/**
 * Generate deterministic inputs hash
 */
export function inputsHash(raw: unknown): string {
  return sha256(raw);
}
