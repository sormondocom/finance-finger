import * as openpgp from 'openpgp';

export interface TestKeyPair {
  publicKey: string;
  privateKey: string;
  passphrase: string;
  name: string;
  email: string;
}

/**
 * Generates a fresh ECC key pair for use in Playwright tests.
 * Uses Node.js's native crypto.subtle (available in Node 18+).
 * Key generation takes 1-3 seconds — call once in beforeAll and cache the result.
 */
export async function generateTestKeyPair(
  name: string,
  email: string,
  passphrase: string,
): Promise<TestKeyPair> {
  const { publicKey, privateKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'curve25519',
    userIDs: [{ name, email }],
    passphrase,
    format: 'armored',
  });

  return {
    publicKey: publicKey as string,
    privateKey: privateKey as string,
    passphrase,
    name,
    email,
  };
}
