import { encryptToPublicKey, decryptWithPrivateKey } from './pgp';
import type { EncryptedRecord } from '@/types';

let sessionKey: CryptoKey | null = null;

export function isVaultOpen(): boolean {
  return sessionKey !== null;
}

export async function createVault(publicKeyArmored: string): Promise<string> {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));

  sessionKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );

  // Encrypt before zeroing so openpgp can read the bytes
  const encryptedKey = await encryptToPublicKey(rawKey, publicKeyArmored);
  rawKey.fill(0);
  return encryptedKey;
}

export async function openVault(
  encryptedVaultKey: string,
  privateKeyArmored: string,
  passphrase: string,
): Promise<void> {
  const rawKey = await decryptWithPrivateKey(
    encryptedVaultKey,
    privateKeyArmored,
    passphrase,
  );

  sessionKey = await crypto.subtle.importKey(
    'raw',
    rawKey as unknown as Uint8Array<ArrayBuffer>,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );

  rawKey.fill(0);
}

export function closeVault(): void {
  sessionKey = null;
}

export async function encryptRecord(data: unknown): Promise<EncryptedRecord> {
  if (!sessionKey) throw new Error('Vault is locked');

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    encoded,
  );

  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(ciphertext)),
  };
}

export async function decryptRecord<T>(record: EncryptedRecord): Promise<T> {
  if (!sessionKey) throw new Error('Vault is locked');

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(record.iv) },
    sessionKey,
    new Uint8Array(record.data),
  );

  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
}
