# Security

Financial Finger's security model is intentional and structural — not a configuration option or a promise. This document explains exactly how data is protected, what the extension cannot do, and what remains your responsibility as the key holder.

---

## Crypto model

### Key generation

At setup, the wizard generates an **ECC curve25519 PGP keypair** via OpenPGP.js v6:

```
generateKeyPair()
  ├─ publicKeyArmored  →  stored in chrome.storage.local (VaultConfig)
  └─ privateKeyArmored →  displayed once; user copies to password manager
```

The private key is **never stored by the extension** — not in IndexedDB, not in `chrome.storage`, not in memory after the setup wizard closes. The extension has no way to recover it.

### Vault key

At the same time, a random 32-byte **AES-256-GCM `CryptoKey`** is generated (`extractable: false`) and encrypted to the PGP public key via OpenPGP.js. The resulting ciphertext (`VaultConfig.encryptedVaultKey`) is stored in `chrome.storage.local`. The raw key is never written anywhere.

### Session unlock

When the user opens the extension after initial setup:

```
openVault(encryptedVaultKey, privateKey, passphrase)
  └─ OpenPGP.js decrypts the armored ciphertext using the private key + passphrase
       └─ AES-256-GCM CryptoKey is held in module-level memory only
```

The vault key lives in JavaScript module memory for the duration of the session. Closing all extension tabs clears the module scope — the key is gone. On next open, the user must paste their private key and passphrase again.

### Per-record encryption

Every IndexedDB write goes through:

```
encryptRecord(plaintext: T) → EncryptedRecord { iv: number[], data: number[] }
```

Each write generates a fresh 12-byte random IV. The resulting `EncryptedRecord` is what is stored on disk — the raw domain object is never written.

Every read goes through the inverse:

```
decryptRecord<T>(record: EncryptedRecord) → T
```

---

## What is and isn't encrypted

A forensic examination of your browser's storage will find:

| Location | Content | Encrypted? |
|---|---|---|
| IndexedDB — all stores except `snapshots` outer envelope | Every field of every financial record | ✅ Yes — AES-256-GCM per record |
| IndexedDB — `snapshots` outer envelope | Snapshot `id`, `takenAt`, `label`, `snapshotType` | ❌ No — metadata only |
| IndexedDB — `snapshots` inner entries | The encrypted record blobs (same ciphertext as main stores) | ✅ Yes — unchanged ciphertext |
| `chrome.storage.local` — `vaultConfig` | PGP public key, encrypted vault key ciphertext, mascot + theme settings | Public key is public; vault key is ciphertext (passphrase required to use); settings are non-financial |
| `chrome.storage.local` — `lastSnapshotError` | Error message from last failed auto-snapshot, if any | ❌ No — error text only, no financial data |

**In practice:** someone with physical access to your browser profile can see *when* you took snapshots and what you named them. They cannot see your income, balances, debts, or any financial figures.

---

## Threat model

### What Financial Finger protects against

- **Passive storage access** — a process that reads your browser's user data directory cannot read your financial records. Every record is AES-256-GCM encrypted under a key that is itself encrypted to your PGP public key.
- **Extension compromise without the private key** — if the extension's JavaScript or storage is modified by a malicious browser extension or local attacker, they still cannot read past records without the vault key, and they cannot get the vault key without the private key and passphrase.
- **Cloud exposure** — there is no server, no sync service, and no telemetry. Nothing is transmitted anywhere.

### What Financial Finger does not protect against

- **Malware with live session access** — if an attacker can run code in the extension's JavaScript context while the vault is unlocked, the `CryptoKey` is in memory and can be used. Financial Finger is not a defense against a fully compromised device.
- **Keylogger or clipboard interception at unlock time** — the private key is pasted at unlock. A keylogger or clipboard monitor present at that moment can capture it.
- **Browser profile theft with a weak passphrase** — the vault key ciphertext is in storage. If your PGP passphrase is weak enough to brute-force, the vault key is recoverable. Use a strong passphrase.
- **Snapshot metadata** — snapshot labels and timestamps are stored unencrypted. An adversary with storage access cannot read your finances but can infer that you use a financial tool and when you took backups.
- **Physical access to an unlocked browser** — if the browser session is running and the vault is unlocked, a person with physical access to the machine can navigate to the extension and see your data.

---

## Your responsibility as the key holder

Financial Finger enforces the cryptography. You are responsible for the key.

- **Store your private key in a password manager** (Bitwarden, 1Password, KeePass, or similar). The key does not expire and does not change unless you generate a new pair. Treat it like any other critical credential.
- **Use a strong passphrase** — one that is not a dictionary word, not reused elsewhere, and not trivially guessable. There is no rate limiting on local key derivation.
- **There is no recovery mechanism.** If you lose your private key or forget your passphrase, every encrypted record in IndexedDB is permanently inaccessible. The math is the security model: without the key, the ciphertext is noise.

See the [FAQ in the README](README.md#i-lost-my-private-key--forgot-my-passphrase-can-i-recover-my-data) for recovery steps to try before concluding access is lost.

---

## Key loss: what to try

If you cannot unlock your vault:

1. **Check your password manager.** Search by URL, site name ("Financial Finger"), or note content.
2. **Check old email or cloud sync.** Search for `-----BEGIN PGP PRIVATE KEY BLOCK-----` — the PGP header is distinctive.
3. **Check saved key files.** The wizard offers "Load from file" at unlock — check your Downloads folder, USB drives, and backups from around your setup date.
4. **Try passphrase variations.** OpenPGP.js passphrases are case-sensitive. Try upper/lowercase variations of what you remember.

If none of these work: **Settings → Danger zone → Wipe vault** to start over. All data will be lost.

---

## Reporting a vulnerability

If you find a security issue in Financial Finger, please report it privately rather than opening a public issue.

**Contact:** [sormond@gmail.com](mailto:sormond@gmail.com)

Please include:
- A description of the vulnerability and its impact
- Steps to reproduce
- Any relevant browser/OS version information

This is an open-source personal project. There is no paid bug bounty program, but reported vulnerabilities will be taken seriously, addressed promptly, and credited in the changelog.

**Please do not** open a public GitHub issue for security vulnerabilities — doing so discloses the issue to everyone before a fix is available.
