import * as openpgp from 'openpgp';

export interface GeneratedKeyPair {
  publicKeyArmored: string;
  privateKeyArmored: string;
}

export interface KeyInfo {
  name: string;
  email: string;
  fingerprint: string;
  createdAt: Date;
}

export async function generateKeyPair(
  name: string,
  email: string,
  passphrase: string,
): Promise<GeneratedKeyPair> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'curve25519Legacy',
    userIDs: [{ name, email }],
    passphrase,
    format: 'armored',
  });
  return { publicKeyArmored: publicKey, privateKeyArmored: privateKey };
}

export async function encryptToPublicKey(
  data: Uint8Array,
  publicKeyArmored: string,
): Promise<string> {
  const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
  const message = await openpgp.createMessage({ binary: data });
  return (await openpgp.encrypt({
    message,
    encryptionKeys: publicKey,
    format: 'armored',
  })) as string;
}

export async function decryptWithPrivateKey(
  armoredMessage: string,
  privateKeyArmored: string,
  passphrase: string,
): Promise<Uint8Array> {
  const privateKey = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
    passphrase,
  });
  const message = await openpgp.readMessage({ armoredMessage });
  const { data } = await openpgp.decrypt({
    message,
    decryptionKeys: privateKey,
    format: 'binary',
  });
  return data as Uint8Array;
}

export async function readKeyInfo(armoredKey: string): Promise<KeyInfo> {
  const key = await openpgp.readKey({ armoredKey });
  const userId = key.getUserIDs()[0] ?? '';
  const match = userId.match(/^(.+?)\s*<(.+?)>$/);
  return {
    name: match?.[1]?.trim() ?? userId,
    email: match?.[2]?.trim() ?? '',
    fingerprint: key.getFingerprint().toUpperCase(),
    createdAt: key.getCreationTime(),
  };
}

export async function validatePrivateKey(
  armoredKey: string,
  passphrase: string,
): Promise<boolean> {
  try {
    await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({ armoredKey }),
      passphrase,
    });
    return true;
  } catch {
    return false;
  }
}
