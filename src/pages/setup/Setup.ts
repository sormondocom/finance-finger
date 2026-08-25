import './setup.css';
import browser from 'webextension-polyfill';
import { generateKeyPair, readKeyInfo, validatePrivateKey } from '@/crypto/pgp';
import { createVault } from '@/crypto/vault';
import { navigate } from '@/app/router';
import { createMember, saveMember, deleteMember } from '@/db';
import type { AvatarType, MascotGender, VaultConfig } from '@/types';
import { BUCK_SVG, PENNY_SVG, BABY_BOY_SVG, BABY_GIRL_SVG, CHILD_BOY_SVG, CHILD_GIRL_SVG, TEEN_BOY_SVG, TEEN_GIRL_SVG } from '@/mascot/svgs';

export function avatarTypeToSvg(type: AvatarType): string {
  switch (type) {
    case 'male':        return BUCK_SVG;
    case 'female':      return PENNY_SVG;
    case 'baby-male':   return BABY_BOY_SVG;
    case 'baby-female': return BABY_GIRL_SVG;
    case 'child-male':  return CHILD_BOY_SVG;
    case 'child-female':return CHILD_GIRL_SVG;
    case 'teen-male':   return TEEN_BOY_SVG;
    case 'teen-female': return TEEN_GIRL_SVG;
    default:            return BABY_GIRL_SVG; // legacy 'child' → baby-female
  }
}

type SetupStep = 'welcome' | 'mascot' | 'keys' | 'save-key' | 'profile' | 'done';

interface AddedMember {
  id: string;
  name: string;
  avatarType: AvatarType;
}

interface SetupState {
  step: SetupStep;
  mascotGender: MascotGender;
  mascotName: string;
  profileName: string;
  keyMode: 'generate' | 'import';
  // generate path
  keyName: string;
  keyEmail: string;
  keyPassphrase: string;
  generatedPublicKey: string;
  generatedPrivateKey: string;
  // import path
  importedPublicKey: string;
  importedPrivateKey: string;
  importedPassphrase: string;
  // done step
  primaryMemberName: string;
  primaryMemberId: string;
  additionalMembers: AddedMember[];
}

const STEP_ORDER: SetupStep[] = ['welcome', 'mascot', 'keys', 'save-key', 'profile', 'done'];

export class SetupWizard {
  constructor(private onComplete: () => void) {}

  private state: SetupState = {
    step: 'welcome',
    mascotGender: 'buck',
    mascotName: 'Buck',
    profileName: '',
    keyMode: 'generate',
    keyName: '',
    keyEmail: '',
    keyPassphrase: '',
    generatedPublicKey: '',
    generatedPrivateKey: '',
    importedPublicKey: '',
    importedPrivateKey: '',
    importedPassphrase: '',
    primaryMemberName: '',
    primaryMemberId: '',
    additionalMembers: [],
  };

  private container!: HTMLElement;
  private doneShowAdder = false;
  private doneAdderType: AvatarType = 'baby-male';

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'setup-wizard';
    this.update();
    return this.container;
  }

  private update(): void {
    this.container.innerHTML = '';
    this.container.appendChild(this.renderStepDots());
    this.container.appendChild(this.renderStep());
  }

  private renderStepDots(): HTMLElement {
    const currentIdx = STEP_ORDER.indexOf(this.state.step);
    const bar = document.createElement('div');
    bar.className = 'setup-steps';
    STEP_ORDER.forEach((step, i) => {
      const dot = document.createElement('div');
      dot.className =
        'setup-step-dot' +
        (i === currentIdx ? ' active' : '') +
        (i < currentIdx ? ' done' : '');
      dot.setAttribute('data-testid', 'setup-step-dot');
      dot.setAttribute('data-step', step);
      bar.appendChild(dot);
    });
    return bar;
  }

  private renderStep(): HTMLElement {
    switch (this.state.step) {
      case 'welcome':  return this.renderWelcome();
      case 'mascot':   return this.renderMascot();
      case 'keys':     return this.renderKeys();
      case 'save-key': return this.renderSaveKey();
      case 'profile':  return this.renderProfile();
      case 'done':     return this.renderDone();
    }
  }

  // ── Steps ────────────────────────────────────────────────────────────────

  private renderWelcome(): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="setup-header">
        <h1>Howdy, neighbor!</h1>
        <p>Welcome to <strong>Financial Finger</strong> — let's get you set up<br>
        so you can start figurin' out your finances.</p>
      </div>
      <div class="card" style="text-align:center;padding:var(--space-8)">
        <p style="font-size:4rem;margin-bottom:var(--space-4)">🐷</p>
        <p>Everything you enter stays right here on your device,<br>
        encrypted and private. We don't have a server to send it to,<br>
        and that's exactly the point.</p>
      </div>
    `;
    el.appendChild(this.renderNav({ nextLabel: "Let's go →", onNext: () => this.go('mascot') }));
    return el;
  }

  private renderMascot(): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="setup-header">
        <h1>Pick your guide</h1>
        <p>They'll mosey in from time to time with friendly advice.</p>
      </div>
      <div class="mascot-picker" id="mascot-picker">
        <button class="mascot-option ${this.state.mascotGender === 'buck' ? 'selected' : ''}" data-gender="buck">
          ${BUCK_SVG}
          <span class="mascot-option-name">Buck</span>
          <span class="mascot-option-desc">Old-school charm,<br>sharp as a tack</span>
        </button>
        <button class="mascot-option ${this.state.mascotGender === 'penny' ? 'selected' : ''}" data-gender="penny">
          ${PENNY_SVG}
          <span class="mascot-option-name">Penny</span>
          <span class="mascot-option-desc">Witty, warm,<br>takes no hogwash</span>
        </button>
      </div>
      <div class="form-group" style="margin-top:var(--space-4)">
        <label class="form-label" for="mascot-name">
          Give 'em a name (or keep the one they came with)
        </label>
        <input id="mascot-name" type="text" value="${this.state.mascotName}" maxlength="24" />
      </div>
    `;

    el.querySelectorAll<HTMLButtonElement>('.mascot-option').forEach((btn) => {
      btn.setAttribute('data-testid', `mascot-option-${btn.dataset['gender']}`);
      btn.addEventListener('click', () => {
        const gender = btn.dataset['gender'] as MascotGender;
        this.state.mascotGender = gender;
        this.state.mascotName = gender === 'buck' ? 'Buck' : 'Penny';
        el.querySelectorAll('.mascot-option').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        const input = el.querySelector<HTMLInputElement>('#mascot-name')!;
        input.value = this.state.mascotName;
      });
    });

    el.querySelector<HTMLInputElement>('#mascot-name')!.addEventListener('input', (e) => {
      this.state.mascotName = (e.target as HTMLInputElement).value;
    });

    el.appendChild(
      this.renderNav({
        onBack: () => this.go('welcome'),
        nextLabel: 'Next →',
        onNext: () => this.go('keys'),
      }),
    );
    return el;
  }

  private renderKeys(): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="setup-header">
        <h1>Your encryption keys</h1>
        <p>Your data is encrypted with your personal PGP key.<br>
        You own it. We never see it.</p>
      </div>
      <div class="tab-bar">
        <button class="tab-btn ${this.state.keyMode === 'generate' ? 'active' : ''}" data-tab="generate">Generate new keys</button>
        <button class="tab-btn ${this.state.keyMode === 'import'   ? 'active' : ''}" data-tab="import">Import existing keys</button>
      </div>

      <div class="tab-panel ${this.state.keyMode === 'generate' ? 'active' : ''}" id="tab-generate">
        <div class="form-group">
          <label class="form-label" for="key-name">Your name</label>
          <input id="key-name" type="text" value="${this.state.keyName}" placeholder="e.g. Beauregard Swinton" />
        </div>
        <div class="form-group">
          <label class="form-label" for="key-email">Email address</label>
          <input id="key-email" type="email" value="${this.state.keyEmail}" placeholder="e.g. beau@farm.example" />
        </div>
        <div class="form-group">
          <label class="form-label" for="key-pass">Key passphrase</label>
          <input id="key-pass" type="password" value="${this.state.keyPassphrase}"
            placeholder="Strong passphrase — don't lose it!" autocomplete="new-password" />
          <span class="form-hint">This protects your private key. Write it down somewhere safe.</span>
        </div>
      </div>

      <div class="tab-panel ${this.state.keyMode === 'import' ? 'active' : ''}" id="tab-import">
        <div class="form-group">
          <label class="form-label">Public key</label>
          <div class="file-input-row">
            <button type="button" class="btn btn-secondary btn-sm" id="import-pub-pick">Choose file…</button>
            <input id="import-pub-file" type="file" accept=".asc,.txt,.key,.pub" style="display:none" />
            <span id="import-pub-fname" class="file-name-hint">No file chosen</span>
          </div>
          <span class="form-hint">or paste below</span>
          <textarea id="import-pub" rows="4" placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Private key</label>
          <div class="file-input-row">
            <button type="button" class="btn btn-secondary btn-sm" id="import-priv-pick">Choose file…</button>
            <input id="import-priv-file" type="file" accept=".asc,.txt,.key" style="display:none" />
            <span id="import-priv-fname" class="file-name-hint">No file chosen</span>
          </div>
          <span class="form-hint">or paste below</span>
          <textarea id="import-priv" rows="4" placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="import-pass">Key passphrase</label>
          <input id="import-pass" type="password" autocomplete="current-password" />
        </div>
      </div>

      <div id="key-error" class="form-error" style="display:none"></div>
    `;

    // Restore any previously entered import values (e.g. user navigated back)
    if (this.state.importedPublicKey) {
      el.querySelector<HTMLTextAreaElement>('#import-pub')!.value = this.state.importedPublicKey;
    }
    if (this.state.importedPrivateKey) {
      el.querySelector<HTMLTextAreaElement>('#import-priv')!.value = this.state.importedPrivateKey;
    }
    if (this.state.importedPassphrase) {
      el.querySelector<HTMLInputElement>('#import-pass')!.value = this.state.importedPassphrase;
    }

    // ── Dynamic next-button label ────────────────────────────────────────
    const nextLabel = () =>
      this.state.keyMode === 'generate' ? 'Generate & Continue →' : 'Import & Continue →';

    // Build nav first so we can grab a reference to update its primary button
    const nav = this.renderNav({
      onBack: () => this.go('mascot'),
      nextLabel: nextLabel(),
      onNext: async (btn) => {
        const errEl = el.querySelector<HTMLElement>('#key-error')!;
        errEl.style.display = 'none';
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Working...';

        try {
          if (this.state.keyMode === 'generate') {
            if (!this.state.keyName || !this.state.keyEmail || !this.state.keyPassphrase) {
              throw new Error('Please fill in all fields.');
            }
            const pair = await generateKeyPair(
              this.state.keyName,
              this.state.keyEmail,
              this.state.keyPassphrase,
            );
            this.state.generatedPublicKey = pair.publicKeyArmored;
            this.state.generatedPrivateKey = pair.privateKeyArmored;
          } else {
            if (!this.state.importedPublicKey || !this.state.importedPrivateKey) {
              throw new Error('Please choose key files or paste them below.');
            }
            const valid = await validatePrivateKey(
              this.state.importedPrivateKey,
              this.state.importedPassphrase,
            );
            if (!valid) throw new Error('Could not unlock private key. Check your passphrase.');
          }
          this.go('save-key');
        } catch (err) {
          errEl.textContent = (err as Error).message;
          errEl.style.display = 'block';
        } finally {
          btn.disabled = false;
          btn.textContent = nextLabel();
        }
      },
    });

    const nextBtn = nav.querySelector<HTMLButtonElement>('.btn-primary')!;

    // ── Tab switching ────────────────────────────────────────────────────
    el.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
      btn.setAttribute('data-testid', `tab-${btn.dataset['tab']}`);
      btn.addEventListener('click', () => {
        this.state.keyMode = btn.dataset['tab'] as 'generate' | 'import';
        el.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        el.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        el.querySelector(`#tab-${this.state.keyMode}`)!.classList.add('active');
        nextBtn.textContent = nextLabel();
      });
    });

    // ── File inputs ──────────────────────────────────────────────────────
    // Use button→input.click() delegation instead of <label for=""> — Firefox extensions
    // block the label activation pattern in their security sandbox.
    el.querySelector<HTMLButtonElement>('#import-pub-pick')?.addEventListener('click', () => {
      el.querySelector<HTMLInputElement>('#import-pub-file')!.click();
    });
    el.querySelector<HTMLButtonElement>('#import-priv-pick')?.addEventListener('click', () => {
      el.querySelector<HTMLInputElement>('#import-priv-file')!.click();
    });

    el.querySelector<HTMLInputElement>('#import-pub-file')?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = (await file.text()).trim();
      this.state.importedPublicKey = text;
      el.querySelector<HTMLTextAreaElement>('#import-pub')!.value = text;
      el.querySelector<HTMLSpanElement>('#import-pub-fname')!.textContent = file.name;
    });

    el.querySelector<HTMLInputElement>('#import-priv-file')?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = (await file.text()).trim();
      this.state.importedPrivateKey = text;
      el.querySelector<HTMLTextAreaElement>('#import-priv')!.value = text;
      el.querySelector<HTMLSpanElement>('#import-priv-fname')!.textContent = file.name;
    });

    // ── Text inputs ──────────────────────────────────────────────────────
    el.querySelector<HTMLInputElement>('#key-name')?.addEventListener('input', (e) => {
      this.state.keyName = (e.target as HTMLInputElement).value;
    });
    el.querySelector<HTMLInputElement>('#key-email')?.addEventListener('input', (e) => {
      this.state.keyEmail = (e.target as HTMLInputElement).value;
    });
    el.querySelector<HTMLInputElement>('#key-pass')?.addEventListener('input', (e) => {
      this.state.keyPassphrase = (e.target as HTMLInputElement).value;
    });
    el.querySelector<HTMLTextAreaElement>('#import-pub')?.addEventListener('input', (e) => {
      this.state.importedPublicKey = (e.target as HTMLTextAreaElement).value;
    });
    el.querySelector<HTMLTextAreaElement>('#import-priv')?.addEventListener('input', (e) => {
      this.state.importedPrivateKey = (e.target as HTMLTextAreaElement).value;
    });
    el.querySelector<HTMLInputElement>('#import-pass')?.addEventListener('input', (e) => {
      this.state.importedPassphrase = (e.target as HTMLInputElement).value;
    });

    el.appendChild(nav);
    return el;
  }

  private renderSaveKey(): HTMLElement {
    const isGenerated = this.state.keyMode === 'generate';
    const privKey = isGenerated ? this.state.generatedPrivateKey : this.state.importedPrivateKey;
    const pubKey  = isGenerated ? this.state.generatedPublicKey  : this.state.importedPublicKey;

    const el = document.createElement('div');
    el.innerHTML = `
      <div class="setup-header">
        <h1>Save your private key</h1>
        <p>${isGenerated
          ? 'Download both key files before continuing — they are your only access to this vault.'
          : "You imported your own key — make sure it's already backed up."
        }</p>
      </div>
      <div class="key-warning">
        <span class="key-warning-icon">⚠️</span>
        <div>
          <strong>If you lose this key, your data cannot be recovered.</strong><br>
          Save it to a USB drive, a password manager, or another secure location.
          We don't store it and can't help you get it back.
        </div>
      </div>
      ${isGenerated ? `<div class="key-display" id="key-display">${privKey}</div>` : '<p style="color:var(--color-text-muted);font-size:var(--text-sm)">You imported your own key — make sure it\'s already backed up.</p>'}
    `;

    const nav = this.renderNav({
      onBack: () => this.go('keys'),
      nextLabel: "I've saved my key →",
      onNext: () => this.go('profile'),
    });

    if (isGenerated) {
      const nextBtn = nav.querySelector<HTMLButtonElement>('.btn-primary')!;
      nextBtn.disabled = true;
      nextBtn.title = 'Download your private key first';

      const btnGroup = document.createElement('div');
      btnGroup.className = 'save-key-actions';

      const triggerKeyDownload = (content: string, filename: string): void => {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      };

      const savePrivBtn = document.createElement('button');
      savePrivBtn.className = 'btn btn-primary';
      savePrivBtn.setAttribute('data-testid', 'save-private-key');
      savePrivBtn.textContent = '💾 Save Private Key';
      savePrivBtn.addEventListener('click', () => {
        triggerKeyDownload(privKey, 'ff-private-key.asc');
        savePrivBtn.textContent = '✓ Private Key Downloaded';
        savePrivBtn.className = 'btn btn-secondary';
        nextBtn.disabled = false;
        nextBtn.title = '';
      });

      const savePubBtn = document.createElement('button');
      savePubBtn.className = 'btn btn-secondary';
      savePubBtn.setAttribute('data-testid', 'save-public-key');
      savePubBtn.textContent = '💾 Save Public Key';
      savePubBtn.addEventListener('click', () => {
        triggerKeyDownload(pubKey, 'ff-public-key.asc');
        savePubBtn.textContent = '✓ Public Key Downloaded';
        savePubBtn.disabled = true;
      });

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-secondary save-key-copy';
      copyBtn.setAttribute('data-testid', 'copy-private-key');
      copyBtn.textContent = 'Copy private key to clipboard';
      copyBtn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(privKey);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => (copyBtn.textContent = 'Copy private key to clipboard'), 2000);
      });

      btnGroup.appendChild(savePrivBtn);
      btnGroup.appendChild(savePubBtn);
      btnGroup.appendChild(copyBtn);
      el.appendChild(btnGroup);
    }

    el.appendChild(nav);
    return el;
  }

  private renderProfile(): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="setup-header">
        <h1>Name your household</h1>
        <p>This is just for you — it can be anything.</p>
      </div>
      <div class="form-group">
        <label class="form-label" for="profile-name">Household name</label>
        <input id="profile-name" type="text" value="${this.state.profileName}"
          placeholder="e.g. The Swinton Family" maxlength="64" />
        <span class="form-hint">You can add family members on the next screen.</span>
      </div>
      <div id="profile-error" class="form-error" style="display:none"></div>
    `;

    el.querySelector<HTMLInputElement>('#profile-name')!.addEventListener('input', (e) => {
      this.state.profileName = (e.target as HTMLInputElement).value;
    });

    el.appendChild(
      this.renderNav({
        onBack: () => this.go('save-key'),
        nextLabel: 'Finish setup →',
        onNext: async (btn) => {
          const errEl = el.querySelector<HTMLElement>('#profile-error')!;
          if (!this.state.profileName.trim()) {
            errEl.textContent = 'Please enter a household name.';
            errEl.style.display = 'block';
            return;
          }
          btn.disabled = true;
          btn.innerHTML = '<span class="spinner"></span> Setting up...';
          try {
            await this.finalize();
            this.go('done');
          } catch (err) {
            errEl.textContent = (err as Error).message;
            errEl.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Finish setup →';
          }
        },
      }),
    );
    return el;
  }

  private renderDone(): HTMLElement {
    const name = this.state.mascotName;
    const mascotSVG = this.state.mascotGender === 'buck' ? BUCK_SVG : PENNY_SVG;

    const el = document.createElement('div');
    el.style.textAlign = 'center';

    // Mascot in a div (not p — avoids SVG-inside-p HTML parsing quirk)
    const mascotWrap = document.createElement('div');
    mascotWrap.className = 'done-mascot';
    mascotWrap.innerHTML = mascotSVG;
    el.appendChild(mascotWrap);

    const heading = document.createElement('h1');
    heading.textContent = "You're all set, neighbor!";
    el.appendChild(heading);

    const sub = document.createElement('p');
    sub.style.cssText = 'margin-top:var(--space-3);font-size:var(--text-lg);color:var(--color-text-muted)';
    sub.textContent = `${name} is saddled up and ready to ride.`;
    el.appendChild(sub);

    // Household roster
    el.appendChild(this.renderHouseholdRoster());

    // Enter button
    const enterWrap = document.createElement('div');
    enterWrap.style.marginTop = 'var(--space-4)';
    const enterBtn = document.createElement('button');
    enterBtn.className = 'btn btn-primary btn-lg';
    enterBtn.setAttribute('data-testid', 'setup-enter-app');
    enterBtn.textContent = 'Enter Financial Finger →';
    enterBtn.addEventListener('click', () => this.onComplete());
    enterWrap.appendChild(enterBtn);
    el.appendChild(enterWrap);

    return el;
  }

  private renderHouseholdRoster(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'household-section';

    // Header row
    const header = document.createElement('div');
    header.className = 'household-header';

    const title = document.createElement('h3');
    title.textContent = 'Your Household';
    header.appendChild(title);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-secondary btn-sm';
    addBtn.setAttribute('data-testid', 'setup-add-person');
    addBtn.textContent = '+ Add Person';
    addBtn.addEventListener('click', () => {
      this.doneShowAdder = true;
      this.doneAdderType = 'male';
      this.update();
    });
    header.appendChild(addBtn);
    section.appendChild(header);

    // Roster list
    const roster = document.createElement('div');
    roster.className = 'household-roster';

    if (this.state.primaryMemberName) {
      const primaryType: AvatarType = this.state.mascotGender === 'buck' ? 'male' : 'female';
      roster.appendChild(this.renderMemberCard(this.state.primaryMemberName, primaryType, null));
    }

    for (const m of this.state.additionalMembers) {
      roster.appendChild(this.renderMemberCard(m.name, m.avatarType, m.id));
    }

    section.appendChild(roster);

    // Add person form (inline)
    if (this.doneShowAdder) {
      section.appendChild(this.renderAdderForm());
    }

    return section;
  }

  private renderMemberCard(name: string, avatarType: AvatarType, id: string | null): HTMLElement {
    const svgStr = avatarTypeToSvg(avatarType);

    const card = document.createElement('div');
    card.className = 'member-card';
    card.setAttribute('data-testid', 'member-card');
    card.setAttribute('data-member-name', name);

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'member-avatar';
    avatarDiv.innerHTML = svgStr;
    card.appendChild(avatarDiv);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'member-name';
    nameSpan.textContent = name;
    card.appendChild(nameSpan);

    if (id === null) {
      const badge = document.createElement('span');
      badge.className = 'member-badge';
      badge.textContent = 'You';
      card.appendChild(badge);
    } else {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'member-remove-btn';
      removeBtn.setAttribute('data-testid', 'member-remove');
      removeBtn.setAttribute('data-member-id', id);
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', async () => {
        await deleteMember(id);
        this.state.additionalMembers = this.state.additionalMembers.filter((m) => m.id !== id);
        this.update();
      });
      card.appendChild(removeBtn);
    }

    return card;
  }

  private renderAdderForm(): HTMLElement {
    const form = document.createElement('div');
    form.className = 'adder-form';

    // Character type picker
    const pickerDiv = document.createElement('div');
    pickerDiv.className = 'adder-type-picker';

    const types: Array<{ type: AvatarType; label: string; svg: string }> = [
      { type: 'male',         label: 'Adult Male',   svg: BUCK_SVG      },
      { type: 'female',       label: 'Adult Female', svg: PENNY_SVG     },
      { type: 'baby-male',    label: 'Baby Boy',     svg: BABY_BOY_SVG  },
      { type: 'baby-female',  label: 'Baby Girl',    svg: BABY_GIRL_SVG },
      { type: 'child-male',   label: 'Kid Boy',      svg: CHILD_BOY_SVG },
      { type: 'child-female', label: 'Kid Girl',     svg: CHILD_GIRL_SVG},
      { type: 'teen-male',    label: 'Teen Boy',     svg: TEEN_BOY_SVG  },
      { type: 'teen-female',  label: 'Teen Girl',    svg: TEEN_GIRL_SVG },
    ];

    types.forEach(({ type, label, svg }) => {
      const btn = document.createElement('button');
      btn.className = 'adder-type-btn' + (this.doneAdderType === type ? ' selected' : '');
      btn.dataset['type'] = type;
      btn.setAttribute('data-testid', `adder-type-${type}`);

      const avatarDiv = document.createElement('div');
      avatarDiv.className = 'adder-type-avatar';
      avatarDiv.innerHTML = svg;
      btn.appendChild(avatarDiv);

      const labelSpan = document.createElement('span');
      labelSpan.textContent = label;
      btn.appendChild(labelSpan);

      btn.addEventListener('click', () => {
        this.doneAdderType = type;
        pickerDiv
          .querySelectorAll('.adder-type-btn')
          .forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
      });

      pickerDiv.appendChild(btn);
    });

    form.appendChild(pickerDiv);

    // Name input
    const inputGroup = document.createElement('div');
    inputGroup.className = 'form-group';
    inputGroup.innerHTML = `
      <label class="form-label" for="adder-name">Their name</label>
      <input id="adder-name" type="text" placeholder="e.g. Daisy Mae" maxlength="48" />
    `;
    form.appendChild(inputGroup);

    // Focus the input on next tick
    setTimeout(() => form.querySelector<HTMLInputElement>('#adder-name')?.focus(), 0);

    // Actions
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary btn-sm';
    cancelBtn.setAttribute('data-testid', 'adder-cancel');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      this.doneShowAdder = false;
      this.update();
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary btn-sm';
    confirmBtn.setAttribute('data-testid', 'adder-confirm');
    confirmBtn.textContent = 'Add to household →';
    confirmBtn.addEventListener('click', async () => {
      const nameInput = form.querySelector<HTMLInputElement>('#adder-name')!;
      const memberName = nameInput.value.trim();
      if (!memberName) {
        nameInput.focus();
        return;
      }
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Adding...';
      const member = createMember(memberName, this.doneAdderType);
      await saveMember(member);
      this.state.additionalMembers.push({
        id: member.id,
        name: member.name,
        avatarType: this.doneAdderType,
      });
      this.doneShowAdder = false;
      this.update();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    form.appendChild(actions);

    return form;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private go(step: SetupStep): void {
    this.state.step = step;
    this.update();
    this.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private async finalize(): Promise<void> {
    const publicKey =
      this.state.keyMode === 'generate'
        ? this.state.generatedPublicKey
        : this.state.importedPublicKey;

    const encryptedVaultKey = await createVault(publicKey);

    const config: VaultConfig = {
      setupComplete: true,
      publicKeyArmored: publicKey,
      encryptedVaultKey,
      profileName: this.state.profileName.trim(),
      mascotGender: this.state.mascotGender,
      mascotName: this.state.mascotName.trim() || (this.state.mascotGender === 'buck' ? 'Buck' : 'Penny'),
    };

    await browser.storage.local.set({ vaultConfig: config });

    // Seed first household member from key owner's name
    const keyInfo = await readKeyInfo(publicKey);
    const primaryType: AvatarType = this.state.mascotGender === 'buck' ? 'male' : 'female';
    const self = createMember(keyInfo.name || this.state.profileName, primaryType);
    await saveMember(self);

    this.state.primaryMemberName = self.name;
    this.state.primaryMemberId = self.id;
  }

  private renderNav(opts: {
    onBack?: () => void;
    nextLabel: string;
    onNext: (btn: HTMLButtonElement) => void | Promise<void>;
  }): HTMLElement {
    const nav = document.createElement('div');
    nav.className = 'setup-nav';

    if (opts.onBack) {
      const back = document.createElement('button');
      back.className = 'btn btn-secondary';
      back.setAttribute('data-testid', 'setup-back');
      back.textContent = '← Back';
      back.addEventListener('click', opts.onBack);
      nav.appendChild(back);
    } else {
      nav.appendChild(document.createElement('span'));
    }

    const next = document.createElement('button');
    next.className = 'btn btn-primary';
    next.setAttribute('data-testid', 'setup-next');
    next.textContent = opts.nextLabel;
    next.addEventListener('click', () => opts.onNext(next));
    nav.appendChild(next);

    return nav;
  }
}
