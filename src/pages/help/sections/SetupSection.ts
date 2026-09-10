import { makeCard } from '../helpUtils';

export function render(grid: HTMLElement): void {
  grid.appendChild(cardSetupWizard());
  grid.appendChild(cardKeyPair());
  grid.appendChild(cardUnlocking());
  grid.appendChild(cardKeyBackup());
}

function cardSetupWizard(): HTMLElement {
  const card = makeCard('🧙', 'The Six-Step Setup Wizard');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>The setup wizard runs automatically the first time you open Financial Finger. You only go through it once. Here's what each step does:</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">1️⃣</span><div class="help-step-body"><strong>Welcome</strong> — an overview of the privacy model: all your data stays on your device, encrypted to a key only you hold.</div></div>
      <div class="help-step"><span class="help-step-num">2️⃣</span><div class="help-step-body"><strong>Mascot</strong> — choose <strong>Buck</strong> (cowboy pig) or <strong>Penny</strong> (sunflower-hat pig). You can rename them too.</div></div>
      <div class="help-step"><span class="help-step-num">3️⃣</span><div class="help-step-body"><strong>Keys</strong> — generate a new ECC curve25519 PGP keypair (name, email, passphrase) or paste an existing private key.</div></div>
      <div class="help-step"><span class="help-step-num">4️⃣</span><div class="help-step-body"><strong>Save your key</strong> — your private key is shown exactly once. Copy it to a password manager or print it. <em>It is never stored by the extension.</em></div></div>
      <div class="help-step"><span class="help-step-num">5️⃣</span><div class="help-step-body"><strong>Profile</strong> — name your household. This appears as the Dashboard title.</div></div>
      <div class="help-step"><span class="help-step-num">6️⃣</span><div class="help-step-body"><strong>Done</strong> — your vault is created. You land on the Dashboard.</div></div>
    </div>
  `;
  return card;
}

function cardKeyPair(): HTMLElement {
  const card = makeCard('🔑', 'Your PGP Key Pair');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>Financial Finger uses <strong>OpenPGP</strong> (ECC curve25519) to protect your data. Two mathematically linked keys are generated:</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
      <div class="calc-result good" style="border-left-color:var(--ff-navy)">
        <div style="font-weight:700;color:var(--ff-navy);margin-bottom:var(--space-2)">🔓 Public Key</div>
        <ul style="margin:0;padding-left:var(--space-4);font-size:var(--text-sm);line-height:1.7">
          <li>Stored in the extension</li>
          <li>Used to encrypt your vault key and exports</li>
          <li>Safe to share with household members</li>
        </ul>
      </div>
      <div class="calc-result" style="border-left-color:var(--ff-rust)">
        <div style="font-weight:700;color:var(--ff-rust);margin-bottom:var(--space-2)">🔒 Private Key</div>
        <ul style="margin:0;padding-left:var(--space-4);font-size:var(--text-sm);line-height:1.7">
          <li>Never stored by the extension</li>
          <li>You paste it each session to unlock</li>
          <li>Losing it means losing your data</li>
        </ul>
      </div>
    </div>
    <div class="help-callout">
      <strong>How it works:</strong> A random AES vault key encrypts all your records. That vault key is then encrypted with your public key and stored safely. When you unlock, your private key + passphrase decrypt the vault key, which decrypts your data for the session. Close the tab → vault locks.
    </div>
  `;
  return card;
}

function cardUnlocking(): HTMLElement {
  const card = makeCard('🔓', 'Unlocking the Vault');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>On every launch after setup, an unlock screen appears. Here's what to do:</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">1️⃣</span><div class="help-step-body"><strong>Load your private key</strong> — paste the armored key text from your password manager, or click <em>Choose file…</em> to load a saved <code>.asc</code> file.</div></div>
      <div class="help-step"><span class="help-step-num">2️⃣</span><div class="help-step-body"><strong>Enter your passphrase</strong> — the password you chose when generating keys.</div></div>
      <div class="help-step"><span class="help-step-num">3️⃣</span><div class="help-step-body"><strong>Click Unlock</strong> — the vault key is decrypted in memory only. Your data is now accessible.</div></div>
    </div>
    <div class="help-callout">
      The vault stays unlocked for the full browser session. Closing all extension tabs re-locks it automatically. Click <strong>🔒 Lock Vault</strong> in the sidebar at any time to lock manually.
    </div>
  `;
  return card;
}

function cardKeyBackup(): HTMLElement {
  const card = makeCard('💾', 'Keeping Your Key Safe');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>Your private key is the only thing that can open your vault. Financial Finger deliberately does not store it — that's the security model. Losing it means your data is permanently inaccessible.</p>
      <p><strong>Recommended approach:</strong></p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">✅</span><div class="help-step-body"><strong>Password manager</strong> (1Password, Bitwarden, KeePass) — paste the full armored private key as a secure note.</div></div>
      <div class="help-step"><span class="help-step-num">✅</span><div class="help-step-body"><strong>Encrypted USB drive</strong> — keep one offsite. Good for disaster recovery.</div></div>
      <div class="help-step"><span class="help-step-num">✅</span><div class="help-step-body"><strong>Printed copy</strong> in a secure physical location — low-tech but reliable for extreme scenarios.</div></div>
      <div class="help-step"><span class="help-step-num">❌</span><div class="help-step-body"><strong>Email or cloud storage (unencrypted)</strong> — don't store the raw key text in plain email or an unencrypted cloud folder.</div></div>
    </div>
    <div class="help-callout">
      <strong>Passphrase tip:</strong> use 4–5 random words strung together (e.g. "purple-anvil-river-66"). Long passphrases are far harder to crack than short symbol-filled ones. Write it down and keep it with your key backup.
    </div>
  `;
  return card;
}
