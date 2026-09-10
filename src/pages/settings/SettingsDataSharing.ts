import browser from 'webextension-polyfill';
import { saveSetting } from '@/db';
import { readKeyInfo } from '@/crypto/pgp';
import { buildExportBundle, encryptExport, decryptImport, applyImport } from '@/crypto/export';
import { openFormModal } from '@/components/Modal';
import type { SharingKey } from '@/types';

async function putSharingKeys(keys: SharingKey[]): Promise<void> {
  await saveSetting('sharingKeys', keys);
}

function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function resolveDownloadPath(filename: string): Promise<string> {
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

export function buildDataSharingSection(
  initialSharingKeys: SharingKey[],
  publicKeyArmored: string | undefined,
  profileName: string | undefined,
  showToast: (msg: string, durationMs?: number) => void,
): HTMLElement {
  let sharingKeys = initialSharingKeys;

  const wrap = document.createElement('div');
  wrap.className = 'settings-group';

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

  const contactsInfoRow = document.createElement('div');
  contactsInfoRow.className = 'setting-row';
  contactsInfoRow.innerHTML = `
    <div class="setting-row-info">
      <span class="setting-row-label">Sharing keys</span>
      <span class="setting-row-desc">Public keys of people you share data with. Select one when exporting.</span>
    </div>
  `;
  wrap.appendChild(contactsInfoRow);

  const roster = document.createElement('div');
  roster.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-2);padding:0 var(--space-1) var(--space-2)';

  const renderRoster = () => {
    roster.innerHTML = '';
    if (sharingKeys.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'font-size:var(--text-sm);color:var(--color-text-muted);padding:var(--space-1) 0';
      empty.textContent = 'No sharing keys yet. Add a person to get started.';
      roster.appendChild(empty);
      return;
    }
    sharingKeys.forEach((sk) => {
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
        sharingKeys = sharingKeys.filter((k) => k.id !== sk.id);
        await putSharingKeys(sharingKeys);
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
    openAddPersonModal(publicKeyArmored, async (newKey) => {
      sharingKeys.push(newKey);
      await putSharingKeys(sharingKeys);
      renderRoster();
      showToast(`${newKey.label} added to sharing keys!`);
    });
  });

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
  exportBtn.addEventListener('click', () => openExportModal(sharingKeys, publicKeyArmored, profileName, showToast));
  exportRow.appendChild(exportBtn);
  wrap.appendChild(exportRow);

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
  importBtn.addEventListener('click', () => openImportModal(showToast));
  importRow.appendChild(importBtn);
  wrap.appendChild(importRow);

  return wrap;
}

function buildKeyInputSection(
  publicKeyArmored: string | undefined,
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
  useOwnBtn.setAttribute('data-testid', 'settings-key-use-own');

  const hint = document.createElement('span');
  hint.style.cssText = 'font-size:var(--text-xs);color:var(--color-text-muted)';
  hint.textContent = 'or paste below';

  fileRow.appendChild(chooseBtn);
  fileRow.appendChild(useOwnBtn);
  fileRow.appendChild(hint);
  wrap.appendChild(fileRow);

  const area = document.createElement('textarea');
  area.className = 'export-import-textarea';
  area.setAttribute('data-testid', 'settings-key-textarea');
  area.rows = 5;
  area.placeholder = '-----BEGIN PGP PUBLIC KEY BLOCK-----\n…\n-----END PGP PUBLIC KEY BLOCK-----';
  wrap.appendChild(area);

  const preview = document.createElement('div');
  preview.className = 'export-key-info';
  preview.setAttribute('data-testid', 'settings-key-preview');
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
    if (!publicKeyArmored) return;
    area.value = publicKeyArmored;
    area.dispatchEvent(new Event('input'));
  });

  return { element: wrap, getArmored: () => currentArmored };
}

function openAddPersonModal(
  publicKeyArmored: string | undefined,
  onAdded: (key: SharingKey) => void,
): void {
  const body = document.createElement('div');
  body.className = 'export-import-form';

  const keyLabel = document.createElement('label');
  keyLabel.className = 'export-import-label';
  keyLabel.textContent = "Recipient's public key";
  body.appendChild(keyLabel);

  let parsedMeta: { name: string; email: string; fp: string } | null = null;
  const labelInput = document.createElement('input');

  const { element: keySection, getArmored } = buildKeyInputSection(
    publicKeyArmored,
    (_armored, name, email, fp) => {
      parsedMeta = { name, email, fp };
      if (!labelInput.value) labelInput.value = name;
      labelWrap.style.display = '';
    },
  );
  body.appendChild(keySection);

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

function openExportModal(
  sharingKeys: SharingKey[],
  publicKeyArmored: string | undefined,
  profileName: string | undefined,
  showToast: (msg: string, durationMs?: number) => void,
): void {
  const body = document.createElement('div');
  body.className = 'export-import-form';
  const hasContacts = sharingKeys.length > 0;

  let getArmored: () => string | null = () => null;

  if (hasContacts) {
    const recipLabel = document.createElement('div');
    recipLabel.className = 'export-import-label';
    recipLabel.textContent = 'Recipient';
    body.appendChild(recipLabel);

    const oneTimeWrap = document.createElement('div');
    oneTimeWrap.style.cssText = 'display:none;flex-direction:column;gap:var(--space-2);padding:var(--space-2) 0 0 var(--space-6)';

    const contactList = document.createElement('div');
    contactList.className = 'export-contact-list';

    sharingKeys.forEach((sk, idx) => {
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
      fpEl.textContent = `…${sk.fingerprint.slice(-12)}`;
      fpEl.title = sk.fingerprint;
      info.appendChild(fpEl);

      radio.addEventListener('change', () => {
        oneTimeWrap.style.display = 'none';
      });

      item.appendChild(radio);
      item.appendChild(info);
      contactList.appendChild(item);
    });

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

    const { element: keySection, getArmored: ga } = buildKeyInputSection(publicKeyArmored);
    getArmored = ga;
    oneTimeWrap.appendChild(keySection);
    body.appendChild(oneTimeWrap);

    oneTimeRadio.addEventListener('change', () => {
      oneTimeWrap.style.display = 'flex';
    });
  } else {
    const keyLabel = document.createElement('label');
    keyLabel.className = 'export-import-label';
    keyLabel.textContent = "Recipient's public key";
    body.appendChild(keyLabel);

    const { element: keySection, getArmored: ga } = buildKeyInputSection(publicKeyArmored);
    getArmored = ga;
    body.appendChild(keySection);
  }

  const errMsg = document.createElement('p');
  errMsg.className = 'export-import-error';
  errMsg.setAttribute('data-testid', 'settings-export-error');
  errMsg.style.display = 'none';
  body.appendChild(errMsg);

  const getSelectedKey = (): string | null => {
    if (hasContacts) {
      const checked = body.querySelector<HTMLInputElement>('input[name="export-recipient"]:checked');
      if (!checked || checked.value === '__onetime__') return getArmored();
      return sharingKeys.find((k) => k.id === checked.value)?.publicKeyArmored ?? null;
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
        const exporterName = profileName ?? 'Financial Finger';
        const bundle = await buildExportBundle(exporterName);
        const armored = await encryptExport(bundle, pubkey);
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
        const filename = `ff-export-${ts}.ffx`;
        triggerDownload(armored, filename);
        close();
        const savedPath = await resolveDownloadPath(filename);
        showToast(`Saved to: ${savedPath}`, 6000);
      } catch (e) {
        errMsg.textContent = `Export failed: ${(e as Error).message}`;
        errMsg.style.display = '';
      }
    },
  });
}

function openImportModal(showToast: (msg: string, durationMs?: number) => void): void {
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
  errMsg.setAttribute('data-testid', 'settings-import-error');
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
        showToast(`Imported ${total} record${total !== 1 ? 's' : ''} — reloading…`);
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
