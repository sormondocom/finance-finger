import './settings.css';
import browser from 'webextension-polyfill';
import { BUCK_SVG, PENNY_SVG } from '@/mascot/svgs';
import { invalidateConfig } from '@/mascot/Mascot';
import { readKeyInfo } from '@/crypto/pgp';
import { isVaultOpen, closeVault } from '@/crypto/vault';
import { buildExportBundle, encryptExport, decryptImport, applyImport } from '@/crypto/export';
import { openFormModal } from '@/components/Modal';
import { getMembers, saveMember, deleteMember, createMember, getIncomeSources, deleteIncomeSource, getBankAccounts, saveBankAccount, getExpenses, saveExpense, getSetting, saveSetting, getCustomNotifications, saveCustomNotification, deleteCustomNotification, createCustomNotification } from '@/db';
import { setCurrency, getCurrentCurrency, SUPPORTED_CURRENCIES } from '@/utils/finance';
import { buildBreakGlassSection } from './BreakGlass';
import type { VaultConfig, MascotGender, HouseholdMember, AvatarType, SharingKey, CustomNotification, NotificationTriggerType, Expense } from '@/types';

function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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

async function putSharingKeys(keys: SharingKey[]): Promise<void> {
  await saveSetting('sharingKeys', keys);
}

export class SettingsPage {
  private config: VaultConfig | null = null;
  private members: HouseholdMember[] = [];
  private sharingKeys: SharingKey[] = [];
  private notifications: CustomNotification[] = [];
  private expenses: Expense[] = [];
  private container!: HTMLElement;

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'settings-page';
    this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    [this.config, this.members, this.sharingKeys, this.notifications, this.expenses] = await Promise.all([
      getConfig(),
      getMembers(),
      getSharingKeys(),
      getCustomNotifications(),
      getExpenses(),
    ]);
    this.paint();
  }

  private paint(): void {
    this.container.innerHTML = '';
    const h = document.createElement('div');
    h.innerHTML = '<h1 class="font-serif">Settings</h1>';
    this.container.appendChild(h);

    this.container.appendChild(this.sectionMascot());
    this.container.appendChild(this.sectionHousehold());
    this.container.appendChild(this.sectionTheme());
    this.container.appendChild(this.sectionSecurity());
    this.container.appendChild(this.sectionNotifications());
    this.container.appendChild(this.sectionDataSharing());
    this.container.appendChild(this.sectionDanger());
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
            ...allAccounts.filter((a) => a.memberId === m.id).map((a) => saveBankAccount({ ...a, memberId: undefined })),
            ...allExpenses.filter((e) => e.memberId === m.id).map((e) => saveExpense({ ...e, memberId: undefined })),
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
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
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
    currencyRow.setAttribute('data-testid', 'currency-row');

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
    select.setAttribute('data-testid', 'currency-select');
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
    saveBtn.setAttribute('data-testid', 'currency-save');
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
    (async () => {
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

  private sectionNotifications(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'settings-group';

    const titleRow = document.createElement('div');
    titleRow.className = 'settings-group-title-row';
    const titleText = document.createElement('span');
    titleText.textContent = 'Reminders';
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-secondary';
    addBtn.style.fontSize = 'var(--text-xs)';
    addBtn.textContent = '+ Add reminder';
    titleRow.appendChild(titleText);
    titleRow.appendChild(addBtn);
    wrap.appendChild(titleRow);

    const infoRow = document.createElement('div');
    infoRow.className = 'setting-row';
    infoRow.innerHTML = `
      <div class="setting-row-info">
        <span class="setting-row-label">Custom notifications</span>
        <span class="setting-row-desc">Your mascot will appear with a bell chime on the chosen day. Manually dismiss each reminder.</span>
      </div>
    `;
    wrap.appendChild(infoRow);

    const list = document.createElement('div');
    list.className = 'notif-list';

    const triggerDescription = (n: CustomNotification): string => {
      let base: string;
      if (n.triggerType === 'bill-before') {
        const expense = this.expenses.find((e) => e.id === n.expenseId);
        const expName = expense?.description ?? 'a bill';
        base = `${n.daysBefore ?? '?'} day${(n.daysBefore ?? 0) !== 1 ? 's' : ''} before ${expName}`;
      } else if (n.triggerType === 'monthly-day') {
        const d = n.monthlyDay ?? 1;
        const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
        base = `Every month on the ${d}${suffix}`;
      } else if (n.triggerType === 'one-time' && n.triggerDate) {
        base = `On ${new Date(n.triggerDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
      } else {
        return 'Unknown trigger';
      }
      if (n.triggerTime) {
        const [hh, mm] = n.triggerTime.split(':');
        const d = new Date();
        d.setHours(parseInt(hh ?? '0', 10), parseInt(mm ?? '0', 10), 0, 0);
        base += ` at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
      }
      return base;
    };

    const renderList = () => {
      list.innerHTML = '';
      if (this.notifications.length === 0) {
        const empty = document.createElement('p');
        empty.style.cssText = 'font-size:var(--text-sm);color:var(--color-text-muted);padding:var(--space-1) var(--space-5)';
        empty.textContent = 'No reminders yet. Add one to get notified by your mascot.';
        list.appendChild(empty);
        return;
      }
      this.notifications.forEach((n) => {
        const card = document.createElement('div');
        card.className = 'notif-card';

        const info = document.createElement('div');
        info.className = 'notif-card-info';

        const labelEl = document.createElement('span');
        labelEl.className = 'notif-card-label';
        labelEl.textContent = n.label;

        const triggerEl = document.createElement('span');
        triggerEl.className = 'notif-card-trigger';
        triggerEl.textContent = triggerDescription(n);

        info.appendChild(labelEl);
        info.appendChild(triggerEl);

        if (n.customMessage) {
          const msgEl = document.createElement('span');
          msgEl.className = 'notif-card-msg';
          msgEl.textContent = `"${n.customMessage}"`;
          info.appendChild(msgEl);
        }

        const badge = document.createElement('span');
        badge.className = `notif-badge ${n.active ? 'notif-badge--active' : 'notif-badge--inactive'}`;
        badge.textContent = n.active ? 'Active' : 'Paused';

        const actions = document.createElement('div');
        actions.className = 'notif-card-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-secondary';
        editBtn.style.fontSize = 'var(--text-xs)';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => {
          this.openNotifModal(n, async (updated) => {
            await saveCustomNotification(updated);
            this.notifications = this.notifications.map((x) => (x.id === updated.id ? updated : x));
            renderList();
            this.showToast('Reminder updated!');
          });
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-secondary';
        delBtn.style.cssText = 'font-size:var(--text-xs);color:var(--color-danger)';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async () => {
          if (!confirm(`Delete reminder "${n.label}"?`)) return;
          await deleteCustomNotification(n.id);
          this.notifications = this.notifications.filter((x) => x.id !== n.id);
          renderList();
        });

        actions.appendChild(badge);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        card.appendChild(info);
        card.appendChild(actions);
        list.appendChild(card);
      });
    };

    renderList();
    wrap.appendChild(list);

    addBtn.addEventListener('click', () => {
      this.openNotifModal(null, async (created) => {
        await saveCustomNotification(created);
        this.notifications.push(created);
        renderList();
        this.showToast('Reminder added!');
      });
    });

    return wrap;
  }

  private openNotifModal(existing: CustomNotification | null, onSave: (n: CustomNotification) => Promise<void>): void {
    const isEdit = existing !== null;
    const body = document.createElement('div');
    body.className = 'export-import-form';

    // Label
    const labelLabel = document.createElement('label');
    labelLabel.className = 'export-import-label';
    labelLabel.textContent = 'Reminder label';
    body.appendChild(labelLabel);

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.placeholder = 'e.g. Electric bill coming up';
    labelInput.maxLength = 80;
    labelInput.style.cssText = 'width:100%;box-sizing:border-box';
    labelInput.value = existing?.label ?? '';
    body.appendChild(labelInput);

    // Trigger type
    const triggerLabel = document.createElement('label');
    triggerLabel.className = 'export-import-label';
    triggerLabel.textContent = 'When to remind me';
    body.appendChild(triggerLabel);

    const triggerSelect = document.createElement('select');
    triggerSelect.style.cssText = 'width:100%;box-sizing:border-box';
    [
      { value: 'bill-before', label: 'Days before a bill\'s due date' },
      { value: 'monthly-day', label: 'Monthly on a specific day' },
      { value: 'one-time',    label: 'One-time on a specific date' },
    ].forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      opt.selected = (existing?.triggerType ?? 'bill-before') === value;
      triggerSelect.appendChild(opt);
    });
    body.appendChild(triggerSelect);

    // ── Conditional fields container ──────────────────────────────────────
    const condWrap = document.createElement('div');
    condWrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-3)';
    body.appendChild(condWrap);

    const buildBillBeforeFields = (): HTMLElement => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-2)';

      const expLabel = document.createElement('label');
      expLabel.className = 'export-import-label';
      expLabel.textContent = 'Which expense / bill';
      wrap.appendChild(expLabel);

      const expSelect = document.createElement('select');
      expSelect.name = 'cond-expenseId';
      expSelect.style.cssText = 'width:100%;box-sizing:border-box';
      const billedExpenses = this.expenses.filter((e) => e.dueDay != null);
      if (billedExpenses.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No expenses with a due date yet';
        expSelect.appendChild(opt);
        expSelect.disabled = true;
      } else {
        billedExpenses.forEach((e) => {
          const opt = document.createElement('option');
          opt.value = e.id;
          opt.textContent = `${e.description} (due day ${e.dueDay})`;
          opt.selected = existing?.expenseId === e.id;
          expSelect.appendChild(opt);
        });
      }
      wrap.appendChild(expSelect);

      const daysLabel = document.createElement('label');
      daysLabel.className = 'export-import-label';
      daysLabel.textContent = 'Days before the due date';
      wrap.appendChild(daysLabel);

      const daysInput = document.createElement('input');
      daysInput.name = 'cond-daysBefore';
      daysInput.type = 'number';
      daysInput.min = '1';
      daysInput.max = '60';
      daysInput.value = String(existing?.daysBefore ?? 7);
      daysInput.style.cssText = 'width:100px';
      wrap.appendChild(daysInput);

      return wrap;
    };

    const buildMonthlyDayFields = (): HTMLElement => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-2)';

      const dayLabel = document.createElement('label');
      dayLabel.className = 'export-import-label';
      dayLabel.textContent = 'Day of the month (1–31)';
      wrap.appendChild(dayLabel);

      const dayInput = document.createElement('input');
      dayInput.name = 'cond-monthlyDay';
      dayInput.type = 'number';
      dayInput.min = '1';
      dayInput.max = '31';
      dayInput.value = String(existing?.monthlyDay ?? 1);
      dayInput.style.cssText = 'width:100px';
      wrap.appendChild(dayInput);

      const hint = document.createElement('span');
      hint.style.cssText = 'font-size:var(--text-xs);color:var(--color-text-muted)';
      hint.textContent = 'Days 29–31 fire on the last day of shorter months.';
      wrap.appendChild(hint);

      return wrap;
    };

    const buildOneTimeFields = (): HTMLElement => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-2)';

      const dtLabel = document.createElement('label');
      dtLabel.className = 'export-import-label';
      dtLabel.textContent = 'Date';
      wrap.appendChild(dtLabel);

      const dtInput = document.createElement('input');
      dtInput.name = 'cond-triggerDate';
      dtInput.type = 'date';
      dtInput.style.cssText = 'width:180px';
      if (existing?.triggerDate) {
        const d = new Date(existing.triggerDate);
        dtInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      wrap.appendChild(dtInput);

      return wrap;
    };

    const refreshCondFields = () => {
      condWrap.innerHTML = '';
      const t = triggerSelect.value as NotificationTriggerType;
      if (t === 'bill-before') condWrap.appendChild(buildBillBeforeFields());
      else if (t === 'monthly-day') condWrap.appendChild(buildMonthlyDayFields());
      else condWrap.appendChild(buildOneTimeFields());
    };
    refreshCondFields();
    triggerSelect.addEventListener('change', refreshCondFields);

    // Time of day
    const timeRow = document.createElement('div');
    timeRow.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-1)';

    const timeLbl = document.createElement('label');
    timeLbl.className = 'export-import-label';
    timeLbl.textContent = 'Time of day (optional)';
    timeRow.appendChild(timeLbl);

    const timeInputRow = document.createElement('div');
    timeInputRow.style.cssText = 'display:flex;align-items:center;gap:var(--space-3)';

    const timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.style.cssText = 'width:130px';
    timeInput.value = existing?.triggerTime ?? '';
    timeInputRow.appendChild(timeInput);

    const timeHint = document.createElement('span');
    timeHint.style.cssText = 'font-size:var(--text-xs);color:var(--color-text-muted)';
    timeHint.textContent = 'Leave blank to fire whenever you open the app that day.';
    timeInputRow.appendChild(timeHint);

    timeRow.appendChild(timeInputRow);
    body.appendChild(timeRow);

    // Custom message
    const msgLabel = document.createElement('label');
    msgLabel.className = 'export-import-label';
    msgLabel.textContent = 'Custom message (optional)';
    body.appendChild(msgLabel);

    const msgArea = document.createElement('textarea');
    msgArea.rows = 2;
    msgArea.placeholder = 'e.g. Remember to collect Venmo from Alex before paying.';
    msgArea.style.cssText = 'width:100%;box-sizing:border-box';
    msgArea.value = existing?.customMessage ?? '';
    body.appendChild(msgArea);

    // Active toggle
    const activeWrap = document.createElement('label');
    activeWrap.style.cssText = 'display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer';
    const activeCheck = document.createElement('input');
    activeCheck.type = 'checkbox';
    activeCheck.checked = existing?.active ?? true;
    activeWrap.appendChild(activeCheck);
    activeWrap.appendChild(document.createTextNode('Active'));
    body.appendChild(activeWrap);

    const errMsg = document.createElement('p');
    errMsg.className = 'export-import-error';
    errMsg.style.display = 'none';
    body.appendChild(errMsg);

    openFormModal({
      title: isEdit ? 'Edit Reminder' : 'Add Reminder',
      body,
      submitLabel: isEdit ? 'Save' : 'Add',
      onSubmit: async (close) => {
        errMsg.style.display = 'none';
        const label = labelInput.value.trim();
        if (!label) {
          errMsg.textContent = 'Please enter a label for this reminder.';
          errMsg.style.display = '';
          labelInput.focus();
          return;
        }

        const triggerType = triggerSelect.value as NotificationTriggerType;
        let expenseId: string | undefined;
        let daysBefore: number | undefined;
        let monthlyDay: number | undefined;
        let triggerDate: number | undefined;

        if (triggerType === 'bill-before') {
          const expSel = condWrap.querySelector<HTMLSelectElement>('[name="cond-expenseId"]');
          const daysSel = condWrap.querySelector<HTMLInputElement>('[name="cond-daysBefore"]');
          expenseId = expSel?.value || undefined;
          daysBefore = parseInt(daysSel?.value ?? '7', 10) || 7;
          if (!expenseId) {
            errMsg.textContent = 'Please select an expense with a due date.';
            errMsg.style.display = '';
            return;
          }
        } else if (triggerType === 'monthly-day') {
          const dayInp = condWrap.querySelector<HTMLInputElement>('[name="cond-monthlyDay"]');
          monthlyDay = Math.max(1, Math.min(31, parseInt(dayInp?.value ?? '1', 10) || 1));
        } else {
          const dtInp = condWrap.querySelector<HTMLInputElement>('[name="cond-triggerDate"]');
          if (!dtInp?.value) {
            errMsg.textContent = 'Please choose a date.';
            errMsg.style.display = '';
            return;
          }
          triggerDate = new Date(dtInp.value + 'T00:00:00').getTime();
        }

        const base = existing ?? createCustomNotification(label, triggerType);
        const notif = { ...base } as CustomNotification;
        notif.label = label;
        notif.triggerType = triggerType;
        notif.active = activeCheck.checked;
        notif.updatedAt = Date.now();
        // Clear all optional trigger fields then set only the applicable ones
        delete notif.expenseId;
        delete notif.daysBefore;
        delete notif.monthlyDay;
        delete notif.triggerDate;
        delete notif.triggerTime;
        delete notif.customMessage;
        if (expenseId !== undefined) notif.expenseId = expenseId;
        if (daysBefore !== undefined) notif.daysBefore = daysBefore;
        if (monthlyDay !== undefined) notif.monthlyDay = monthlyDay;
        if (triggerDate !== undefined) notif.triggerDate = triggerDate;
        const triggerTime = timeInput.value || undefined;
        if (triggerTime !== undefined) notif.triggerTime = triggerTime;
        const customMessage = msgArea.value.trim();
        if (customMessage) notif.customMessage = customMessage;

        close();
        await onSave(notif);
      },
    });
  }

  // ── Data Sharing section ──────────────────────────────────────────────

  private sectionDataSharing(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'settings-group';

    // Title row with inline "Add person" button
    const titleRow = document.createElement('div');
    titleRow.className = 'settings-group-title-row';
    const titleText = document.createElement('span');
    titleText.textContent = 'Data Sharing';
    const addPersonBtn = document.createElement('button');
    addPersonBtn.className = 'btn btn-secondary';
    addPersonBtn.style.fontSize = 'var(--text-xs)';
    addPersonBtn.textContent = '+ Add person';
    addPersonBtn.setAttribute('data-testid', 'settings-add-person-btn');
    titleRow.appendChild(titleText);
    titleRow.appendChild(addPersonBtn);
    wrap.appendChild(titleRow);

    // Contacts sub-label row
    const contactsInfoRow = document.createElement('div');
    contactsInfoRow.className = 'setting-row';
    contactsInfoRow.innerHTML = `
      <div class="setting-row-info">
        <span class="setting-row-label">Sharing keys</span>
        <span class="setting-row-desc">Public keys of people you share data with. Select one when exporting.</span>
      </div>
    `;
    wrap.appendChild(contactsInfoRow);

    // Contacts roster
    const roster = document.createElement('div');
    roster.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-2);padding:0 var(--space-1) var(--space-2)';

    const renderRoster = () => {
      roster.innerHTML = '';
      if (this.sharingKeys.length === 0) {
        const empty = document.createElement('p');
        empty.style.cssText = 'font-size:var(--text-sm);color:var(--color-text-muted);padding:var(--space-1) 0';
        empty.textContent = 'No sharing keys yet. Add a person to get started.';
        roster.appendChild(empty);
        return;
      }
      this.sharingKeys.forEach((sk) => {
        const card = document.createElement('div');
        card.className = 'sharing-key-card';

        const info = document.createElement('div');
        info.className = 'sharing-key-card-info';
        const labelEl = document.createElement('span');
        labelEl.className = 'sharing-key-card-label';
        labelEl.textContent = sk.label;
        info.appendChild(labelEl);
        if (sk.email) {
          const emailEl = document.createElement('span');
          emailEl.className = 'sharing-key-card-meta';
          emailEl.textContent = sk.email;
          info.appendChild(emailEl);
        }
        const fpEl = document.createElement('span');
        fpEl.className = 'sharing-key-card-fp';
        fpEl.textContent = sk.fingerprint;
        info.appendChild(fpEl);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-secondary';
        removeBtn.style.cssText = 'font-size:var(--text-xs);color:var(--color-danger);flex-shrink:0';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', async () => {
          this.sharingKeys = this.sharingKeys.filter((k) => k.id !== sk.id);
          await putSharingKeys(this.sharingKeys);
          renderRoster();
        });

        card.appendChild(info);
        card.appendChild(removeBtn);
        roster.appendChild(card);
      });
    };

    renderRoster();
    wrap.appendChild(roster);

    addPersonBtn.addEventListener('click', () => {
      this.openAddPersonModal(async (newKey) => {
        this.sharingKeys.push(newKey);
        await putSharingKeys(this.sharingKeys);
        renderRoster();
        this.showToast(`${newKey.label} added to sharing keys!`);
      });
    });

    // Downloads location info note
    const downloadsNote = document.createElement('div');
    downloadsNote.className = 'settings-info-note';
    downloadsNote.innerHTML = `
      <span class="settings-info-note-icon">📁</span>
      <div class="settings-info-note-body">
        <span class="settings-info-note-title">Where do exported files go?</span>
        <span>
          Exported <code>.ffx</code> files are saved to your browser's
          <strong>default Downloads folder</strong>. When importing, browse to that same
          folder to find your file. Common locations by operating system:
        </span>
        <div class="settings-info-note-paths">
          <span class="settings-info-note-os">Windows</span>
          <code class="settings-info-note-path">C:\\Users\\YourName\\Downloads</code>
          <span class="settings-info-note-os">macOS</span>
          <code class="settings-info-note-path">/Users/YourName/Downloads</code>
          <span class="settings-info-note-os">Linux</span>
          <code class="settings-info-note-path">/home/YourName/Downloads</code>
        </div>
        <span class="settings-info-note-footer">
          Tip: you can change your download folder in your browser's settings, or configure
          your browser to ask where to save each file.
        </span>
      </div>
    `;
    wrap.appendChild(downloadsNote);

    // Export row
    const exportRow = document.createElement('div');
    exportRow.className = 'setting-row';
    exportRow.innerHTML = `
      <div class="setting-row-info">
        <span class="setting-row-label">Export database</span>
        <span class="setting-row-desc">Encrypt your entire database for a recipient's public key. The .ffx file is safe to email — only the holder of the matching private key can open it.</span>
      </div>
    `;
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-secondary setting-row-control';
    exportBtn.setAttribute('data-testid', 'settings-export-btn');
    exportBtn.textContent = 'Export…';
    exportBtn.addEventListener('click', () => this.openExportModal());
    exportRow.appendChild(exportBtn);
    wrap.appendChild(exportRow);

    // Import row
    const importRow = document.createElement('div');
    importRow.className = 'setting-row';
    importRow.innerHTML = `
      <div class="setting-row-info">
        <span class="setting-row-label">Import database</span>
        <span class="setting-row-desc">Import a .ffx file shared from another Financial Finger installation. Records are merged into your existing data by default.</span>
      </div>
    `;
    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-secondary setting-row-control';
    importBtn.setAttribute('data-testid', 'settings-import-btn');
    importBtn.textContent = 'Import…';
    importBtn.addEventListener('click', () => this.openImportModal());
    importRow.appendChild(importBtn);
    wrap.appendChild(importRow);

    return wrap;
  }

  // Shared helper: builds the key textarea + file picker + preview block.
  // Returns the container element and a getter for the current valid armored key.
  private buildKeyInputSection(
    onParsed?: (armored: string, name: string, email: string, fp: string) => void,
  ): { element: HTMLElement; getArmored: () => string | null } {
    let currentArmored: string | null = null;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-2)';

    const fileRow = document.createElement('div');
    fileRow.style.cssText = 'display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap';

    const chooseBtn = document.createElement('button');
    chooseBtn.className = 'btn btn-secondary';
    chooseBtn.style.fontSize = 'var(--text-xs)';
    chooseBtn.textContent = 'Choose file…';

    const useOwnBtn = document.createElement('button');
    useOwnBtn.className = 'btn btn-secondary';
    useOwnBtn.style.fontSize = 'var(--text-xs)';
    useOwnBtn.textContent = 'Use my own key';
    useOwnBtn.setAttribute('data-testid', 'key-use-own');

    const hint = document.createElement('span');
    hint.style.cssText = 'font-size:var(--text-xs);color:var(--color-text-muted)';
    hint.textContent = 'or paste below';

    fileRow.appendChild(chooseBtn);
    fileRow.appendChild(useOwnBtn);
    fileRow.appendChild(hint);
    wrap.appendChild(fileRow);

    const area = document.createElement('textarea');
    area.className = 'export-import-textarea';
    area.setAttribute('data-testid', 'key-textarea');
    area.rows = 5;
    area.placeholder = '-----BEGIN PGP PUBLIC KEY BLOCK-----\n…\n-----END PGP PUBLIC KEY BLOCK-----';
    wrap.appendChild(area);

    const preview = document.createElement('div');
    preview.className = 'export-key-info';
    preview.setAttribute('data-testid', 'key-preview');
    preview.style.display = 'none';
    wrap.appendChild(preview);

    let debounce: ReturnType<typeof setTimeout> | undefined;
    area.addEventListener('input', () => {
      clearTimeout(debounce);
      preview.style.display = 'none';
      currentArmored = null;
      const val = area.value.trim();
      if (!val) return;
      debounce = setTimeout(async () => {
        try {
          const info = await readKeyInfo(val);
          currentArmored = val;
          preview.innerHTML = '';
          const n = document.createElement('span');
          n.className = 'export-key-name';
          n.textContent = info.name;
          preview.appendChild(n);
          if (info.email) {
            const em = document.createElement('span');
            em.className = 'export-key-email';
            em.textContent = `<${info.email}>`;
            preview.appendChild(em);
          }
          const fp = document.createElement('span');
          fp.className = 'export-key-fp';
          fp.textContent = info.fingerprint;
          preview.appendChild(fp);
          preview.style.display = 'flex';
          onParsed?.(val, info.name, info.email, info.fingerprint);
        } catch {
          // Incomplete — wait for more
        }
      }, 400);
    });

    chooseBtn.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.asc,.pgp,.txt,.pub';
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          area.value = reader.result as string;
          area.dispatchEvent(new Event('input'));
        };
        reader.readAsText(file);
      });
      fileInput.click();
    });

    useOwnBtn.addEventListener('click', async () => {
      const pubkey = this.config?.publicKeyArmored;
      if (!pubkey) return;
      area.value = pubkey;
      area.dispatchEvent(new Event('input'));
    });

    return { element: wrap, getArmored: () => currentArmored };
  }

  private openAddPersonModal(onAdded: (key: SharingKey) => void): void {
    const body = document.createElement('div');
    body.className = 'export-import-form';

    const keyLabel = document.createElement('label');
    keyLabel.className = 'export-import-label';
    keyLabel.textContent = "Recipient's public key";
    body.appendChild(keyLabel);

    let parsedMeta: { name: string; email: string; fp: string } | null = null;
    const labelInput = document.createElement('input');

    const { element: keySection, getArmored } = this.buildKeyInputSection(
      (_armored, name, email, fp) => {
        parsedMeta = { name, email, fp };
        if (!labelInput.value) labelInput.value = name;
        labelWrap.style.display = '';
      },
    );
    body.appendChild(keySection);

    // Label field — revealed once a valid key is parsed
    const labelWrap = document.createElement('div');
    labelWrap.style.cssText = 'display:none;flex-direction:column;gap:var(--space-1)';
    const labelTitle = document.createElement('label');
    labelTitle.className = 'export-import-label';
    labelTitle.textContent = 'Display name';
    labelInput.type = 'text';
    labelInput.placeholder = 'e.g. Alice';
    labelInput.maxLength = 64;
    labelInput.style.cssText = 'width:100%;box-sizing:border-box';
    labelWrap.appendChild(labelTitle);
    labelWrap.appendChild(labelInput);
    body.appendChild(labelWrap);

    const errMsg = document.createElement('p');
    errMsg.className = 'export-import-error';
    errMsg.style.display = 'none';
    body.appendChild(errMsg);

    openFormModal({
      title: 'Add Person',
      body,
      submitLabel: 'Add',
      onSubmit: async (close) => {
        errMsg.style.display = 'none';
        const armored = getArmored();
        if (!armored || !parsedMeta) {
          errMsg.textContent = 'Please provide a valid public key.';
          errMsg.style.display = '';
          return;
        }
        const newKey: SharingKey = {
          id: crypto.randomUUID(),
          label: labelInput.value.trim() || parsedMeta.name,
          publicKeyArmored: armored,
          fingerprint: parsedMeta.fp,
          email: parsedMeta.email,
          addedAt: Date.now(),
        };
        close();
        onAdded(newKey);
      },
    });
  }

  private openExportModal(): void {
    const body = document.createElement('div');
    body.className = 'export-import-form';
    const hasContacts = this.sharingKeys.length > 0;

    // getArmored is assigned in the no-contacts branch or the one-time sub-section
    let getArmored: () => string | null = () => null;

    if (hasContacts) {
      const recipLabel = document.createElement('div');
      recipLabel.className = 'export-import-label';
      recipLabel.textContent = 'Recipient';
      body.appendChild(recipLabel);

      // One-time expando — declared early so contact radio listeners can reference it
      const oneTimeWrap = document.createElement('div');
      oneTimeWrap.style.cssText = 'display:none;flex-direction:column;gap:var(--space-2);padding:var(--space-2) 0 0 var(--space-6)';

      const contactList = document.createElement('div');
      contactList.className = 'export-contact-list';

      this.sharingKeys.forEach((sk, idx) => {
        const item = document.createElement('label');
        item.className = 'export-contact-item';

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'export-recipient';
        radio.value = sk.id;
        if (idx === 0) radio.checked = true;

        const info = document.createElement('div');
        info.className = 'export-contact-info';
        const nameEl = document.createElement('span');
        nameEl.className = 'sharing-key-card-label';
        nameEl.textContent = sk.label;
        info.appendChild(nameEl);
        if (sk.email) {
          const emEl = document.createElement('span');
          emEl.className = 'sharing-key-card-meta';
          emEl.textContent = sk.email;
          info.appendChild(emEl);
        }
        const fpEl = document.createElement('span');
        fpEl.className = 'sharing-key-card-fp';
        fpEl.textContent = sk.fingerprint;
        info.appendChild(fpEl);

        radio.addEventListener('change', () => {
          oneTimeWrap.style.display = 'none';
        });

        item.appendChild(radio);
        item.appendChild(info);
        contactList.appendChild(item);
      });

      // "One-time key" option at the bottom of the list
      const oneTimeItem = document.createElement('label');
      oneTimeItem.className = 'export-contact-item';
      const oneTimeRadio = document.createElement('input');
      oneTimeRadio.type = 'radio';
      oneTimeRadio.name = 'export-recipient';
      oneTimeRadio.value = '__onetime__';
      const oneTimeLabel = document.createElement('span');
      oneTimeLabel.className = 'sharing-key-card-label';
      oneTimeLabel.style.color = 'var(--color-text-muted)';
      oneTimeLabel.textContent = 'One-time key…';
      oneTimeItem.appendChild(oneTimeRadio);
      oneTimeItem.appendChild(oneTimeLabel);
      contactList.appendChild(oneTimeItem);
      body.appendChild(contactList);

      // Build and wire the one-time key section
      const { element: keySection, getArmored: ga } = this.buildKeyInputSection();
      getArmored = ga;
      oneTimeWrap.appendChild(keySection);
      body.appendChild(oneTimeWrap);

      oneTimeRadio.addEventListener('change', () => {
        oneTimeWrap.style.display = 'flex';
      });
    } else {
      // No saved contacts — show the paste/file UI directly
      const keyLabel = document.createElement('label');
      keyLabel.className = 'export-import-label';
      keyLabel.textContent = "Recipient's public key";
      body.appendChild(keyLabel);

      const { element: keySection, getArmored: ga } = this.buildKeyInputSection();
      getArmored = ga;
      body.appendChild(keySection);
    }

    const errMsg = document.createElement('p');
    errMsg.className = 'export-import-error';
    errMsg.setAttribute('data-testid', 'export-error');
    errMsg.style.display = 'none';
    body.appendChild(errMsg);

    // Resolve which public key to use at submit time
    const getSelectedKey = (): string | null => {
      if (hasContacts) {
        const checked = body.querySelector<HTMLInputElement>('input[name="export-recipient"]:checked');
        if (!checked || checked.value === '__onetime__') return getArmored();
        return this.sharingKeys.find((k) => k.id === checked.value)?.publicKeyArmored ?? null;
      }
      return getArmored();
    };

    openFormModal({
      title: 'Export Database',
      body,
      submitLabel: 'Export & Download',
      onSubmit: async (close) => {
        errMsg.style.display = 'none';
        const pubkey = getSelectedKey();
        if (!pubkey) {
          errMsg.textContent = hasContacts
            ? 'Select a recipient or provide a one-time key.'
            : 'Please provide a recipient public key.';
          errMsg.style.display = '';
          return;
        }
        try {
          const exporterName = this.config?.profileName ?? 'Financial Finger';
          const bundle = await buildExportBundle(exporterName);
          const armored = await encryptExport(bundle, pubkey);
          const now = new Date();
          const pad = (n: number) => String(n).padStart(2, '0');
          const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
          const filename = `ff-export-${ts}.ffx`;
          triggerDownload(armored, filename);
          close();
          // Resolve the absolute save path then show it; falls back to filename if unavailable
          const savedPath = await this.resolveDownloadPath(filename);
          this.showToast(`Saved to: ${savedPath}`, 6000);
        } catch (e) {
          errMsg.textContent = `Export failed: ${(e as Error).message}`;
          errMsg.style.display = '';
        }
      },
    });
  }

  private openImportModal(): void {
    const body = document.createElement('div');
    body.className = 'export-import-form';

    const msgLabel = document.createElement('label');
    msgLabel.className = 'export-import-label';
    msgLabel.textContent = 'Encrypted export (.ffx)';
    body.appendChild(msgLabel);

    const fileRow = document.createElement('div');
    fileRow.style.cssText = 'display:flex;align-items:center;gap:var(--space-2)';
    const chooseBtn = document.createElement('button');
    chooseBtn.className = 'btn btn-secondary';
    chooseBtn.style.fontSize = 'var(--text-xs)';
    chooseBtn.textContent = 'Choose file…';
    const fileHint = document.createElement('span');
    fileHint.style.cssText = 'font-size:var(--text-xs);color:var(--color-text-muted)';
    fileHint.textContent = 'or paste below';
    fileRow.appendChild(chooseBtn);
    fileRow.appendChild(fileHint);
    body.appendChild(fileRow);

    const msgArea = document.createElement('textarea');
    msgArea.id = 'im-message';
    msgArea.className = 'export-import-textarea';
    msgArea.rows = 4;
    msgArea.placeholder = '-----BEGIN PGP MESSAGE-----\n…\n-----END PGP MESSAGE-----';
    body.appendChild(msgArea);

    chooseBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.ffx,.asc,.pgp';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { msgArea.value = reader.result as string; };
        reader.readAsText(file);
      });
      input.click();
    });

    const pkLabel = document.createElement('label');
    pkLabel.className = 'export-import-label';
    pkLabel.textContent = 'Your private key';
    body.appendChild(pkLabel);

    const pkFileRow = document.createElement('div');
    pkFileRow.style.cssText = 'display:flex;align-items:center;gap:var(--space-2)';
    const pkChooseBtn = document.createElement('button');
    pkChooseBtn.className = 'btn btn-secondary';
    pkChooseBtn.style.fontSize = 'var(--text-xs)';
    pkChooseBtn.textContent = 'Choose file…';
    const pkFileHint = document.createElement('span');
    pkFileHint.style.cssText = 'font-size:var(--text-xs);color:var(--color-text-muted)';
    pkFileHint.textContent = 'or paste below';
    pkFileRow.appendChild(pkChooseBtn);
    pkFileRow.appendChild(pkFileHint);
    body.appendChild(pkFileRow);

    const pkArea = document.createElement('textarea');
    pkArea.id = 'im-private-key';
    pkArea.className = 'export-import-textarea';
    pkArea.rows = 4;
    pkArea.placeholder = '-----BEGIN PGP PRIVATE KEY BLOCK-----\n…\n-----END PGP PRIVATE KEY BLOCK-----';
    body.appendChild(pkArea);

    pkChooseBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.asc,.txt,.key';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          pkArea.value = reader.result as string;
          pkFileHint.textContent = file.name;
        };
        reader.readAsText(file);
      });
      input.click();
    });

    const ppLabel = document.createElement('label');
    ppLabel.className = 'export-import-label';
    ppLabel.textContent = 'Passphrase';
    body.appendChild(ppLabel);

    const ppInput = document.createElement('input');
    ppInput.id = 'im-passphrase';
    ppInput.type = 'password';
    ppInput.style.cssText = 'width:100%;box-sizing:border-box';
    ppInput.placeholder = 'Your key passphrase';
    body.appendChild(ppInput);

    const modeLabel = document.createElement('div');
    modeLabel.className = 'export-import-label';
    modeLabel.textContent = 'Import mode';
    body.appendChild(modeLabel);

    const modeWrap = document.createElement('div');
    modeWrap.style.cssText = 'display:flex;gap:var(--space-4)';
    modeWrap.innerHTML = `
      <label style="display:flex;align-items:center;gap:var(--space-1);font-size:var(--text-sm);cursor:pointer">
        <input type="radio" name="im-mode" value="merge" checked> Merge
      </label>
      <label style="display:flex;align-items:center;gap:var(--space-1);font-size:var(--text-sm);cursor:pointer">
        <input type="radio" name="im-mode" value="replace"> Replace
      </label>
    `;
    body.appendChild(modeWrap);

    const replaceWarn = document.createElement('div');
    replaceWarn.className = 'export-import-warning';
    replaceWarn.textContent = 'Replace mode deletes all your existing data before importing. This cannot be undone.';
    replaceWarn.style.display = 'none';
    body.appendChild(replaceWarn);

    modeWrap.addEventListener('change', (e) => {
      const val = (e.target as HTMLInputElement).value;
      replaceWarn.style.display = val === 'replace' ? '' : 'none';
    });

    const errMsg = document.createElement('p');
    errMsg.className = 'export-import-error';
    errMsg.setAttribute('data-testid', 'import-error');
    errMsg.style.display = 'none';
    body.appendChild(errMsg);

    openFormModal({
      title: 'Import Database',
      body,
      submitLabel: 'Decrypt & Import',
      onSubmit: async (close) => {
        errMsg.style.display = 'none';
        const message = msgArea.value.trim();
        const privateKey = pkArea.value.trim();
        const passphrase = ppInput.value;
        const mode = (body.querySelector<HTMLInputElement>('input[name="im-mode"]:checked')?.value ?? 'merge') as
          | 'merge'
          | 'replace';

        if (!message) {
          errMsg.textContent = 'Please paste the .ffx content or choose a file.';
          errMsg.style.display = '';
          return;
        }
        if (!privateKey) {
          errMsg.textContent = 'Please paste your private key.';
          errMsg.style.display = '';
          return;
        }
        if (!passphrase) {
          errMsg.textContent = 'Passphrase is required.';
          errMsg.style.display = '';
          return;
        }

        try {
          const bundle = await decryptImport(message, privateKey, passphrase);
          const result = await applyImport(bundle, mode);
          const total = Object.values(result).reduce((s, n) => s + n, 0);
          close();
          this.showToast(`Imported ${total} record${total !== 1 ? 's' : ''} — reloading…`);
          setTimeout(() => location.reload(), 1800);
        } catch (e) {
          const raw = (e as Error).message ?? '';
          if (raw.includes('Unsupported export version')) {
            errMsg.textContent = raw;
          } else if (
            raw.toLowerCase().includes('passphrase') ||
            raw.toLowerCase().includes('session key') ||
            raw.toLowerCase().includes('decrypt')
          ) {
            errMsg.textContent = 'Decryption failed. Check that your private key and passphrase match.';
          } else {
            errMsg.textContent = 'Import failed. The file may be corrupt or incompatible.';
          }
          errMsg.style.display = '';
        }
      },
    });
  }

  // ── Danger zone ───────────────────────────────────────────────────────

  private sectionDanger(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'settings-group';
    wrap.innerHTML = `<div class="settings-group-title" style="color:var(--color-danger)">Danger Zone</div>`;

    const resetRow = document.createElement('div');
    resetRow.className = 'setting-row settings-danger';
    resetRow.innerHTML = `
      <div class="setting-row-info">
        <span class="setting-row-label">Reset vault configuration</span>
        <span class="setting-row-desc">
          Clears all stored settings and vault config from this browser.
          Your encrypted data in IndexedDB is deleted too.
          <strong>This cannot be undone.</strong>
        </span>
      </div>
    `;

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-danger setting-row-control';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
      const confirmed = confirm(
        'Are you sure? This will permanently delete your vault configuration and all encrypted data in this browser.\n\n' +
        'Your private key stored offsite is NOT affected — but without vault data there is nothing to decrypt.',
      );
      if (!confirmed) return;
      this.doReset();
    });

    resetRow.appendChild(resetBtn);
    wrap.appendChild(resetRow);
    return wrap;
  }

  private async doReset(): Promise<void> {
    // Clear browser extension storage
    await browser.storage.local.clear();

    // Drop IndexedDB
    const DBName = 'financial-finger';
    indexedDB.deleteDatabase(DBName);

    // Reload to setup wizard
    location.reload();
  }

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
