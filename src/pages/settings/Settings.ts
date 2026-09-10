import './settings.css';
import { makeHelpBtn } from '@/utils/helpNav';
import { showPageError } from '@/utils/errorUI';
import browser from 'webextension-polyfill';
import { BUCK_SVG, PENNY_SVG } from '@/mascot/svgs';
import { invalidateConfig } from '@/mascot/Mascot';
import { readKeyInfo } from '@/crypto/pgp';
import { isVaultOpen, closeVault } from '@/crypto/vault';
import { getMembers, saveMember, deleteMember, createMember, getIncomeSources, deleteIncomeSource, getBankAccounts, saveBankAccount, getExpenses, saveExpense, getSetting, getCustomNotifications, getSnapshots } from '@/db';
import { setCurrency, getCurrentCurrency, SUPPORTED_CURRENCIES } from '@/utils/finance';
import { buildBreakGlassSection } from './BreakGlass';
import { buildSnapshotsSection } from './SettingsSnapshots';
import { buildDangerSection } from './SettingsDanger';
import { buildNotificationsSection } from './SettingsNotifications';
import { buildImportRulesSection } from './SettingsImportRules';
import { buildDataSharingSection } from './SettingsDataSharing';
import type { VaultConfig, MascotGender, HouseholdMember, AvatarType, SharingKey, CustomNotification, Expense, RawSnapshot } from '@/types';

async function getConfig(): Promise<VaultConfig | null> {
  const result = await browser.storage.local.get('vaultConfig');
  return (result['vaultConfig'] as VaultConfig | undefined) ?? null;
}

async function saveConfig(patch: Partial<VaultConfig>): Promise<void> {
  const config = await getConfig();
  if (!config) return;
  await browser.storage.local.set({ vaultConfig: { ...config, ...patch } });
}

async function getSharingKeys(): Promise<SharingKey[]> {
  return (await getSetting<SharingKey[]>('sharingKeys')) ?? [];
}

export class SettingsPage {
  private config: VaultConfig | null = null;
  private members: HouseholdMember[] = [];
  private sharingKeys: SharingKey[] = [];
  private notifications: CustomNotification[] = [];
  private expenses: Expense[] = [];
  private snapshots: RawSnapshot[] = [];
  private container!: HTMLElement;

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'settings-page';
    void this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    try {
      [this.config, this.members, this.sharingKeys, this.notifications, this.expenses, this.snapshots] = await Promise.all([
        getConfig(),
        getMembers(),
        getSharingKeys(),
        getCustomNotifications(),
        getExpenses(),
        getSnapshots(),
      ]);
      this.paint();
    } catch (err) {
      showPageError(this.container, err instanceof Error ? err.message : 'Failed to load settings', () => { void this.load(); });
    }
  }

  private paint(): void {
    this.container.innerHTML = '';
    const h = document.createElement('div');
    h.innerHTML = '<h1 class="font-serif">Settings</h1>';
    h.querySelector('h1')?.appendChild(makeHelpBtn('settings'));
    this.container.appendChild(h);

    this.container.appendChild(this.sectionMascot());
    this.container.appendChild(this.sectionHousehold());
    this.container.appendChild(this.sectionTheme());
    this.container.appendChild(this.sectionSecurity());
    this.container.appendChild(buildNotificationsSection(this.notifications, this.expenses, (msg) => this.showToast(msg)));
    this.container.appendChild(buildDataSharingSection(this.sharingKeys, this.config?.publicKeyArmored, this.config?.profileName, (msg, ms) => this.showToast(msg, ms)));
    this.container.appendChild(buildImportRulesSection((msg) => this.showToast(msg)));
    this.container.appendChild(buildSnapshotsSection(this.snapshots, (msg) => this.showToast(msg)));
    this.container.appendChild(buildDangerSection());
    this.container.appendChild(buildBreakGlassSection(this.config?.mascotGender));
  }

  // ── Mascot section ────────────────────────────────────────────────────

  private sectionMascot(): HTMLElement {
    const config = this.config;
    const currentGender: MascotGender = config?.mascotGender ?? 'buck';
    const currentName = config?.mascotName ?? (currentGender === 'buck' ? 'Buck' : 'Penny');

    const wrap = document.createElement('div');
    wrap.className = 'settings-group';
    wrap.innerHTML = `<div class="settings-group-title">Mascot</div>`;

    // Gender picker
    const pickerRow = document.createElement('div');
    pickerRow.className = 'setting-row';
    pickerRow.style.flexWrap = 'wrap';
    pickerRow.style.gap = 'var(--space-5)';
    pickerRow.innerHTML = `
      <div class="setting-row-info">
        <span class="setting-row-label">Your mascot</span>
        <span class="setting-row-desc">Choose Buck or Penny — or rename them to whatever suits you.</span>
      </div>
    `;

    let selectedGender = currentGender;

    const preview = document.createElement('div');
    preview.className = 'mascot-preview';

    const buckOpt = document.createElement('div');
    buckOpt.className = `mascot-option ${currentGender === 'buck' ? 'selected' : ''}`;
    buckOpt.innerHTML = `${BUCK_SVG}<span class="mascot-option-label">Buck</span>`;

    const pennyOpt = document.createElement('div');
    pennyOpt.className = `mascot-option ${currentGender === 'penny' ? 'selected' : ''}`;
    pennyOpt.innerHTML = `${PENNY_SVG}<span class="mascot-option-label">Penny</span>`;

    buckOpt.addEventListener('click', () => {
      selectedGender = 'buck';
      buckOpt.classList.add('selected');
      pennyOpt.classList.remove('selected');
    });

    pennyOpt.addEventListener('click', () => {
      selectedGender = 'penny';
      pennyOpt.classList.add('selected');
      buckOpt.classList.remove('selected');
    });

    preview.appendChild(buckOpt);
    preview.appendChild(pennyOpt);
    pickerRow.appendChild(preview);
    wrap.appendChild(pickerRow);

    // Name input
    const nameRow = document.createElement('div');
    nameRow.className = 'setting-row';
    nameRow.innerHTML = `
      <div class="setting-row-info">
        <span class="setting-row-label">Nickname</span>
        <span class="setting-row-desc">Rename your mascot — they'll answer to anything.</span>
      </div>
      <div class="setting-row-control" style="display:flex;gap:var(--space-3);align-items:center">
        <input id="mascot-name-input" type="text" value="${currentName}" maxlength="24"
          style="width:140px;text-align:right" />
        <button id="mascot-save-btn" class="btn btn-primary">Save</button>
      </div>
    `;

    nameRow.querySelector('#mascot-save-btn')!.addEventListener('click', async () => {
      const nameInput = nameRow.querySelector<HTMLInputElement>('#mascot-name-input')!;
      const newName = nameInput.value.trim() || (selectedGender === 'buck' ? 'Buck' : 'Penny');
      await saveConfig({ mascotGender: selectedGender, mascotName: newName });
      invalidateConfig();
      this.config = await getConfig();
      this.showToast('Mascot updated!');
    });

    wrap.appendChild(nameRow);
    return wrap;
  }

  // ── Household section ─────────────────────────────────────────────────

  private sectionHousehold(): HTMLElement {
    const profileName = this.config?.profileName ?? 'Household';

    const wrap = document.createElement('div');
    wrap.className = 'settings-group';
    wrap.innerHTML = `<div class="settings-group-title">Household</div>`;

    // Household name row
    const nameRow = document.createElement('div');
    nameRow.className = 'setting-row';
    nameRow.innerHTML = `
      <div class="setting-row-info">
        <span class="setting-row-label">Household name</span>
        <span class="setting-row-desc">Shown on your dashboard as the profile header.</span>
      </div>
      <div class="setting-row-control" style="display:flex;gap:var(--space-3);align-items:center">
        <input id="profile-name-input" type="text" value="${profileName}" maxlength="48"
          style="width:180px;text-align:right" data-testid="settings-profile-name-input" />
        <button id="profile-save-btn" class="btn btn-primary" data-testid="settings-profile-name-save">Save</button>
      </div>
    `;

    nameRow.querySelector('#profile-save-btn')!.addEventListener('click', async () => {
      const val = nameRow.querySelector<HTMLInputElement>('#profile-name-input')!.value.trim();
      if (!val) return;
      await saveConfig({ profileName: val });
      this.config = await getConfig();
      this.showToast('Household name updated!');
    });

    wrap.appendChild(nameRow);

    // Members sub-heading row
    const membersLabelRow = document.createElement('div');
    membersLabelRow.className = 'setting-row';
    membersLabelRow.style.borderTop = '1px solid var(--color-border)';
    membersLabelRow.innerHTML = `
      <div class="setting-row-info">
        <span class="setting-row-label">Members</span>
        <span class="setting-row-desc">People in your household. Members can be assigned to income sources.</span>
      </div>
    `;
    wrap.appendChild(membersLabelRow);

    // Member roster (re-rendered in place on add/remove)
    const roster = document.createElement('div');
    roster.className = 'member-roster-list';
    roster.setAttribute('data-testid', 'settings-members-list');

    const childTypes = new Set(['child', 'baby-male', 'baby-female', 'child-male', 'child-female', 'teen-male', 'teen-female']);

    const renderRoster = () => {
      roster.innerHTML = '';
      if (this.members.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-muted text-sm';
        empty.style.padding = '0 var(--space-5) var(--space-2)';
        empty.textContent = 'No members yet. Add one below.';
        roster.appendChild(empty);
        return;
      }
      this.members.forEach((m) => {
        const isChild = childTypes.has(m.avatarType ?? '');
        const isFemale = m.avatarType === 'female';
        const row = document.createElement('div');
        row.className = 'member-roster-item';
        row.setAttribute('data-testid', 'settings-member-row');
        row.setAttribute('data-member-id', m.id);

        const avatar = document.createElement('div');
        avatar.className = `member-avatar${isChild ? ' member-avatar--child' : isFemale ? ' member-avatar--female' : ''}`;
        avatar.textContent = m.name.charAt(0).toUpperCase();

        const nameEl = document.createElement('span');
        nameEl.className = 'member-roster-name';
        nameEl.textContent = m.name;

        row.appendChild(avatar);
        row.appendChild(nameEl);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-secondary';
        removeBtn.setAttribute('data-testid', 'settings-member-remove');
        removeBtn.setAttribute('data-member-id', m.id);
        removeBtn.style.cssText = 'font-size:var(--text-xs);color:var(--color-danger);margin-left:auto';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', async () => {
          if (!confirm(`Remove "${m.name}"? Their income sources will also be removed.`)) return;
          const [sources, allAccounts, allExpenses] = await Promise.all([
            getIncomeSources(),
            getBankAccounts(),
            getExpenses(),
          ]);
          const toDelete = sources.filter((s) => s.memberId === m.id);
          await Promise.all([
            ...toDelete.map((s) => deleteIncomeSource(s.id)),
            ...allAccounts.filter((a) => a.memberId === m.id).map(({ memberId: _, ...a }) => saveBankAccount(a)),
            ...allExpenses.filter((e) => e.memberId === m.id).map((e) => saveExpense({ ...e, memberId: null })),
          ]);
          await deleteMember(m.id);
          this.members = this.members.filter((x) => x.id !== m.id);
          renderRoster();
        });

        row.appendChild(removeBtn);
        roster.appendChild(row);
      });
    };

    renderRoster();
    wrap.appendChild(roster);

    // Add member inline form
    const addWrap = document.createElement('div');
    addWrap.style.cssText = 'padding:0 var(--space-5) var(--space-4)';

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-secondary';
    addBtn.setAttribute('data-testid', 'settings-add-member-btn');
    addBtn.style.fontSize = 'var(--text-sm)';
    addBtn.textContent = '+ Add member';

    const addForm = document.createElement('div');
    addForm.setAttribute('data-testid', 'settings-add-member-form');
    addForm.style.cssText = 'display:none;flex-direction:column;gap:var(--space-3);padding:var(--space-4);background:var(--color-bg-sunken);border-radius:var(--radius-md)';

    let newType: AvatarType = 'baby-male';

    const AVATAR_OPTIONS: Array<{ type: AvatarType; label: string }> = [
      { type: 'male',         label: '👨 Adult M' },
      { type: 'female',       label: '👩 Adult F' },
      { type: 'baby-male',    label: '🐷 Baby Boy' },
      { type: 'baby-female',  label: '🐷 Baby Girl' },
      { type: 'child-male',   label: '🐷 Kid Boy' },
      { type: 'child-female', label: '🐷 Kid Girl' },
      { type: 'teen-male',    label: '🐷 Teen Boy' },
      { type: 'teen-female',  label: '🐷 Teen Girl' },
    ];

    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--space-2)';

    const refreshTypeButtons = () => {
      typeRow.querySelectorAll<HTMLButtonElement>('[data-type]').forEach((btn) => {
        const active = btn.dataset['type'] === newType;
        btn.style.opacity = active ? '1' : '0.55';
        btn.style.fontWeight = active ? '700' : '400';
      });
    };

    AVATAR_OPTIONS.forEach(({ type, label }) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary';
      btn.setAttribute('data-testid', `settings-member-type-${type}`);
      btn.setAttribute('data-type', type);
      btn.style.cssText = 'font-size:var(--text-xs);padding:var(--space-1) var(--space-3)';
      btn.textContent = label;
      btn.addEventListener('click', () => { newType = type; refreshTypeButtons(); });
      typeRow.appendChild(btn);
    });
    refreshTypeButtons();
    addForm.appendChild(typeRow);

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:var(--space-2);align-items:center';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Member name…';
    nameInput.maxLength = 48;
    nameInput.setAttribute('data-testid', 'settings-member-name-input');
    nameInput.style.flex = '1';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.setAttribute('data-testid', 'settings-member-confirm');
    confirmBtn.style.fontSize = 'var(--text-sm)';
    confirmBtn.textContent = 'Add';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.setAttribute('data-testid', 'settings-member-cancel');
    cancelBtn.style.fontSize = 'var(--text-sm)';
    cancelBtn.textContent = 'Cancel';

    const doAdd = async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      confirmBtn.disabled = true;
      const member = createMember(name, newType);
      await saveMember(member);
      this.members.push(member);
      nameInput.value = '';
      newType = 'male';
      refreshTypeButtons();
      addForm.style.display = 'none';
      addBtn.style.display = '';
      confirmBtn.disabled = false;
      renderRoster();
      this.showToast(`${name} added to household!`);
    };

    confirmBtn.addEventListener('click', doAdd);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') void doAdd(); });
    cancelBtn.addEventListener('click', () => {
      addForm.style.display = 'none';
      addBtn.style.display = '';
      nameInput.value = '';
    });

    inputRow.appendChild(nameInput);
    inputRow.appendChild(confirmBtn);
    inputRow.appendChild(cancelBtn);
    addForm.appendChild(inputRow);

    addBtn.addEventListener('click', () => {
      addBtn.style.display = 'none';
      addForm.style.display = 'flex';
      nameInput.focus();
    });

    addWrap.appendChild(addBtn);
    addWrap.appendChild(addForm);
    wrap.appendChild(addWrap);

    return wrap;
  }

  // ── Theme section ─────────────────────────────────────────────────────

  private sectionTheme(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'settings-group';
    wrap.innerHTML = `<div class="settings-group-title">Appearance</div>`;

    const getActiveTheme = (): string => {
      const attr = document.documentElement.getAttribute('data-theme');
      return attr ?? 'auto';
    };

    const themeRow = document.createElement('div');
    themeRow.className = 'setting-row';

    const themeInfo = document.createElement('div');
    themeInfo.className = 'setting-row-info';
    themeInfo.innerHTML = `
      <span class="setting-row-label">Color theme</span>
      <span class="setting-row-desc">Auto follows your system preference. Light and Dark override it.</span>
    `;

    const toggle = document.createElement('div');
    toggle.className = 'setting-row-control theme-toggle';

    const themes = [
      { value: 'auto',  label: '🌗 Auto' },
      { value: 'light', label: '☀️ Light' },
      { value: 'dark',  label: '🌙 Dark' },
    ];

    const active = getActiveTheme();
    themes.forEach(({ value, label }) => {
      const btn = document.createElement('button');
      btn.className = `theme-btn ${active === value ? 'active' : ''}`;
      btn.textContent = label;
      btn.addEventListener('click', async () => {
        toggle.querySelectorAll('.theme-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        if (value === 'auto') {
          document.documentElement.removeAttribute('data-theme');
          await browser.storage.local.remove('theme');
        } else {
          document.documentElement.setAttribute('data-theme', value);
          await browser.storage.local.set({ theme: value });
        }
      });
      toggle.appendChild(btn);
    });

    themeRow.appendChild(themeInfo);
    themeRow.appendChild(toggle);
    wrap.appendChild(themeRow);

    // ── Currency ──
    const currencyRow = document.createElement('div');
    currencyRow.className = 'setting-row';
    currencyRow.setAttribute('data-testid', 'settings-currency-row');

    const currencyInfo = document.createElement('div');
    currencyInfo.className = 'setting-row-info';
    currencyInfo.innerHTML = `
      <span class="setting-row-label">Currency</span>
      <span class="setting-row-desc">Sets the symbol and decimal style used throughout the app. Number formatting follows your system language.</span>
    `;

    const currencyControl = document.createElement('div');
    currencyControl.className = 'setting-row-control';
    currencyControl.style.cssText = 'display:flex;gap:var(--space-3);align-items:center';

    const select = document.createElement('select');
    select.setAttribute('data-testid', 'settings-currency-select');
    select.style.cssText = 'min-width:160px';

    const currentCode = getCurrentCurrency();
    SUPPORTED_CURRENCIES.forEach(({ code, name }) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `${code} — ${name}`;
      opt.selected = code === currentCode;
      select.appendChild(opt);
    });

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.setAttribute('data-testid', 'settings-currency-save');
    saveBtn.textContent = 'Save';

    saveBtn.addEventListener('click', async () => {
      const code = select.value;
      setCurrency(code);
      await browser.storage.local.set({ currency: code });
      this.showToast(`Currency set to ${code}`);
    });

    currencyControl.appendChild(select);
    currencyControl.appendChild(saveBtn);
    currencyRow.appendChild(currencyInfo);
    currencyRow.appendChild(currencyControl);
    wrap.appendChild(currencyRow);

    return wrap;
  }

  // ── Security section ──────────────────────────────────────────────────

  private sectionSecurity(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'settings-group';
    wrap.innerHTML = `<div class="settings-group-title">Security & Keys</div>`;

    // Fingerprint row
    const fpRow = document.createElement('div');
    fpRow.className = 'setting-row';

    const fpDisplay = document.createElement('div');
    fpDisplay.className = 'fingerprint-display';
    fpDisplay.textContent = 'Loading key info…';

    const fpInfo = document.createElement('div');
    fpInfo.className = 'setting-row-info';
    fpInfo.innerHTML = `
      <span class="setting-row-label">PGP key fingerprint</span>
      <span class="setting-row-desc">Use this to verify your public key. Store your private key offsite — Financial Finger cannot recover it.</span>
    `;

    fpRow.appendChild(fpInfo);
    fpRow.appendChild(fpDisplay);
    wrap.appendChild(fpRow);

    // Load fingerprint async
    void (async () => {
      const publicKey = this.config?.publicKeyArmored;
      if (!publicKey) {
        fpDisplay.textContent = 'No key configured.';
        return;
      }
      try {
        const info = await readKeyInfo(publicKey);
        fpDisplay.textContent = info.fingerprint;
      } catch {
        fpDisplay.textContent = 'Could not read key.';
      }
    })();

    // Export public key row
    const copyRow = document.createElement('div');
    copyRow.className = 'setting-row';
    copyRow.innerHTML = `
      <div class="setting-row-info">
        <span class="setting-row-label">Export public key</span>
        <span class="setting-row-desc">Copy or save your public key as a file — safe to share. Used to encrypt data written to this vault.</span>
      </div>
    `;

    const keyBtns = document.createElement('div');
    keyBtns.className = 'setting-row-control';
    keyBtns.style.cssText = 'display:flex;gap:var(--space-2)';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-secondary';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', async () => {
      const pubkey = this.config?.publicKeyArmored;
      if (!pubkey) return;
      await navigator.clipboard.writeText(pubkey);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    });

    const saveKeyBtn = document.createElement('button');
    saveKeyBtn.className = 'btn btn-secondary';
    saveKeyBtn.setAttribute('data-testid', 'settings-save-public-key-btn');
    saveKeyBtn.textContent = 'Save file…';
    saveKeyBtn.addEventListener('click', async () => {
      const pubkey = this.config?.publicKeyArmored;
      if (!pubkey) return;
      const blob = new Blob([pubkey], { type: 'application/pgp-keys' });
      const url = URL.createObjectURL(blob);
      await browser.downloads.download({
        url,
        filename: 'finance-finger-public-key.asc',
        saveAs: true,
      });
    });

    keyBtns.appendChild(copyBtn);
    keyBtns.appendChild(saveKeyBtn);
    copyRow.appendChild(keyBtns);
    wrap.appendChild(copyRow);

    // Vault status row
    const vaultRow = document.createElement('div');
    vaultRow.className = 'setting-row';
    const open = isVaultOpen();
    vaultRow.innerHTML = `
      <div class="setting-row-info">
        <span class="setting-row-label">Vault status</span>
        <span class="setting-row-desc">The vault stays open for the full browser session. Closing all tabs locks it automatically.</span>
      </div>
      <div class="setting-row-control" style="display:flex;align-items:center;gap:var(--space-3)">
        <span style="font-size:var(--text-sm);font-weight:700;color:${open ? 'var(--ff-green)' : 'var(--color-danger)'}">
          ${open ? '🔓 Unlocked' : '🔒 Locked'}
        </span>
      </div>
    `;

    if (open) {
      const lockBtn = document.createElement('button');
      lockBtn.className = 'btn btn-secondary';
      lockBtn.style.cssText = 'color:var(--color-danger);border-color:rgba(239,68,68,0.4);font-size:var(--text-xs)';
      lockBtn.textContent = '🔒 Lock Vault';
      lockBtn.addEventListener('click', () => {
        closeVault();
        location.reload();
      });
      vaultRow.querySelector<HTMLDivElement>('.setting-row-control')!.appendChild(lockBtn);
    }

    wrap.appendChild(vaultRow);

    return wrap;
  }

  // ── Reminders / Notifications section ────────────────────────────────


  // ── Helpers ───────────────────────────────────────────────────────────

  private showToast(msg: string, durationMs = 2500): void {
    const t = document.createElement('div');
    t.style.cssText = `
      position:fixed;bottom:var(--space-6);right:var(--space-6);
      padding:var(--space-3) var(--space-5);
      background:var(--ff-navy);color:#fff;
      border-radius:var(--radius-lg);
      font-size:var(--text-sm);font-weight:700;
      box-shadow:var(--shadow-lg);
      z-index:9999;
      max-width:480px;word-break:break-all;
      animation:fade-in 0.2s ease;
    `;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), durationMs);
  }

  /** Polls browser.downloads to resolve the absolute path for a just-triggered download. */
  private async resolveDownloadPath(filename: string): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise<void>((r) => setTimeout(r, 250));
      try {
        const items = await browser.downloads.search({ limit: 10, orderBy: ['-startTime'] });
        const match = items.find((d) => d.filename.endsWith(filename));
        if (match?.filename) return match.filename;
      } catch {
        break;
      }
    }
    return filename;
  }
}
