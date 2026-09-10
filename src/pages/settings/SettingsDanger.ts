import browser from 'webextension-polyfill';

export function buildDangerSection(): HTMLElement {
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
    void doReset();
  });

  resetRow.appendChild(resetBtn);
  wrap.appendChild(resetRow);
  return wrap;
}

async function doReset(): Promise<void> {
  await browser.storage.local.clear();
  indexedDB.deleteDatabase('financial-finger');
  location.reload();
}
