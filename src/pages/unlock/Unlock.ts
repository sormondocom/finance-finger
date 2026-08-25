import './unlock.css';
import { openVault } from '@/crypto/vault';
import { readKeyInfo } from '@/crypto/pgp';
import type { VaultConfig } from '@/types';
import { BUCK_SVG, PENNY_SVG } from '@/mascot/svgs';

export class UnlockPage {
  constructor(private config: VaultConfig, private onUnlocked: () => void) {}

  render(): HTMLElement {
    const mascotSvg =
      this.config.mascotGender === 'buck' ? BUCK_SVG : PENNY_SVG;

    const el = document.createElement('div');
    el.className = 'unlock-page';
    el.innerHTML = `
      <div class="unlock-mascot">${mascotSvg}</div>
      <div class="unlock-header">
        <h1>Howdy, ${this.config.profileName}!</h1>
        <p>${this.config.mascotName}'s been keeping an eye on things.<br>
        Load or paste your private key to pick up where you left off.</p>
      </div>

      <div class="form-group">
        <label class="form-label">Private key</label>
        <div class="file-input-row">
          <button type="button" class="btn btn-secondary btn-sm" id="unlock-key-pick">Choose file…</button>
          <input id="unlock-key-file" type="file" accept=".asc,.txt,.key" style="display:none" />
          <span id="unlock-key-fname" class="file-name-hint">No file chosen</span>
        </div>
        <span class="form-hint">or paste below</span>
        <textarea id="unlock-key" rows="5"
          placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----&#10;&#10;...&#10;-----END PGP PRIVATE KEY BLOCK-----"
          style="font-family:var(--font-mono);font-size:var(--text-xs)"></textarea>
      </div>

      <div class="form-group">
        <label class="form-label" for="unlock-pass">Key passphrase</label>
        <input id="unlock-pass" type="password" autocomplete="current-password" />
      </div>

      <div id="unlock-error" class="form-error" style="display:none"></div>

      <button class="btn btn-primary" id="unlock-btn" style="width:100%">
        Unlock vault →
      </button>

      <div class="unlock-or">or</div>

      <details style="font-size:var(--text-sm);color:var(--color-text-muted)">
        <summary style="cursor:pointer">Public key fingerprint</summary>
        <div class="unlock-fingerprint" id="unlock-fingerprint" style="margin-top:var(--space-2)">
          Loading...
        </div>
      </details>
    `;

    el.querySelector<HTMLButtonElement>('#unlock-key-pick')!.addEventListener('click', () => {
      el.querySelector<HTMLInputElement>('#unlock-key-file')!.click();
    });

    el.querySelector<HTMLInputElement>('#unlock-key-file')!.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = (await file.text()).trim();
      el.querySelector<HTMLTextAreaElement>('#unlock-key')!.value = text;
      el.querySelector<HTMLSpanElement>('#unlock-key-fname')!.textContent = file.name;
    });

    readKeyInfo(this.config.publicKeyArmored)
      .then((info) => {
        const el2 = el.querySelector<HTMLElement>('#unlock-fingerprint');
        if (el2) el2.textContent = info.fingerprint;
      })
      .catch(() => {});

    const doUnlock = async () => {
      const btn = el.querySelector<HTMLButtonElement>('#unlock-btn')!;
      const errEl = el.querySelector<HTMLElement>('#unlock-error')!;
      const keyText = el.querySelector<HTMLTextAreaElement>('#unlock-key')!.value.trim();
      const passphrase = el.querySelector<HTMLInputElement>('#unlock-pass')!.value;

      errEl.style.display = 'none';

      if (!keyText) {
        errEl.textContent = 'Please load or paste your private key.';
        errEl.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Unlocking...';

      try {
        await openVault(this.config.encryptedVaultKey, keyText, passphrase);
        this.onUnlocked();
      } catch {
        errEl.textContent =
          'Could not unlock vault. Check your private key and passphrase.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Unlock vault →';
      }
    };

    el.querySelector<HTMLButtonElement>('#unlock-btn')!.addEventListener('click', doUnlock);
    el.querySelector<HTMLInputElement>('#unlock-pass')!.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doUnlock();
    });

    return el;
  }
}
