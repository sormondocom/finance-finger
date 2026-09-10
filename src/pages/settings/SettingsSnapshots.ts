import { getSnapshots, deleteSnapshot } from '@/db';
import { takeSnapshot, restoreSnapshot } from '@/utils/snapshot';
import type { RawSnapshot } from '@/types';
import { userLocale } from '@/utils/locale';

export function buildSnapshotsSection(
  initialSnapshots: RawSnapshot[],
  showToast: (msg: string) => void,
): HTMLElement {
  let snapshots = initialSnapshots;

  const wrap = document.createElement('div');
  wrap.className = 'settings-group';

  const titleRow = document.createElement('div');
  titleRow.className = 'settings-group-title-row';
  const titleText = document.createElement('span');
  titleText.className = 'settings-group-title';
  titleText.textContent = 'Snapshots';
  const nowBtn = document.createElement('button');
  nowBtn.className = 'btn btn-secondary';
  nowBtn.textContent = 'Snapshot now';
  nowBtn.setAttribute('data-testid', 'settings-snapshot-now-btn');
  titleRow.appendChild(titleText);
  titleRow.appendChild(nowBtn);
  wrap.appendChild(titleRow);

  const descRow = document.createElement('div');
  descRow.className = 'setting-row';
  descRow.innerHTML = `
    <div class="setting-row-info">
      <span class="setting-row-label">Point-in-time recovery</span>
      <span class="setting-row-desc">
        Financial Finger automatically snapshots your data every 30 minutes.
        Snapshots are kept for 24 hours, with a minimum of 5 always retained.
        Restoring replaces all current data — a safety snapshot is taken first.
      </span>
    </div>
  `;
  wrap.appendChild(descRow);

  const list = document.createElement('div');
  list.className = 'snapshot-list';
  list.setAttribute('data-testid', 'settings-snapshot-list');
  wrap.appendChild(list);

  const buildSnapshotRow = (snap: RawSnapshot, isImport: boolean): HTMLElement => {
    const dateLabel = new Date(snap.takenAt).toLocaleString(userLocale, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });

    const row = document.createElement('div');
    row.className = 'snapshot-row' + (isImport ? ' import-snapshot-row' : '');
    row.setAttribute('data-testid', 'settings-snapshot-row');

    const info = document.createElement('div');
    info.className = 'snapshot-row-info';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'snapshot-row-label';
    labelSpan.textContent = snap.label;
    if (isImport) {
      const badge = document.createElement('span');
      badge.className = 'import-snapshot-badge';
      badge.textContent = 'Import';
      badge.setAttribute('data-testid', 'settings-snapshot-import-badge');
      labelSpan.appendChild(badge);
    }
    const dateSpan = document.createElement('span');
    dateSpan.className = 'snapshot-row-date';
    dateSpan.textContent = dateLabel;
    info.appendChild(labelSpan);
    info.appendChild(dateSpan);

    const actions = document.createElement('div');
    actions.className = 'snapshot-row-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn btn-secondary';
    restoreBtn.textContent = 'Restore';
    restoreBtn.setAttribute('data-testid', 'settings-snapshot-restore-btn');
    restoreBtn.addEventListener('click', async () => {
      const confirmed = confirm(
        `Restore to: ${dateLabel}\n\nThis will replace all current data with data from this snapshot. A safety snapshot of your current state will be saved first.\n\nProceed?`,
      );
      if (!confirmed) return;
      restoreBtn.disabled = true;
      restoreBtn.textContent = 'Restoring…';
      try {
        await takeSnapshot(`Before restore — ${dateLabel}`);
        await restoreSnapshot(snap);
        showToast('Restored! Reloading…');
        setTimeout(() => location.reload(), 1200);
      } catch {
        restoreBtn.disabled = false;
        restoreBtn.textContent = 'Restore';
        showToast('Restore failed — try again.');
      }
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-secondary snapshot-delete-btn';
    delBtn.textContent = 'Delete';
    delBtn.setAttribute('data-testid', 'settings-snapshot-delete-btn');
    delBtn.addEventListener('click', async () => {
      await deleteSnapshot(snap.id);
      snapshots = await getSnapshots();
      renderList();
    });

    actions.appendChild(restoreBtn);
    actions.appendChild(delBtn);
    row.appendChild(info);
    row.appendChild(actions);
    return row;
  };

  const renderList = () => {
    list.innerHTML = '';
    const regular = snapshots.filter((s) => s.snapshotType !== 'import');
    const imports  = snapshots.filter((s) => s.snapshotType === 'import');

    if (regular.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'snapshot-empty';
      empty.textContent = 'No snapshots yet — one will be taken automatically within 30 minutes.';
      empty.setAttribute('data-testid', 'settings-snapshot-empty');
      list.appendChild(empty);
    } else {
      regular.forEach((snap) => list.appendChild(buildSnapshotRow(snap, false)));
    }

    if (imports.length > 0) {
      const importHeading = document.createElement('div');
      importHeading.className = 'snapshot-row-info';
      importHeading.style.cssText = 'margin-top:var(--space-4);padding:var(--space-2) 0;border-top:1px solid var(--color-border);font-weight:var(--weight-semibold);font-size:var(--text-sm);color:var(--color-text-muted)';
      importHeading.textContent = 'Import snapshots (not auto-pruned)';
      list.appendChild(importHeading);
      imports.forEach((snap) => list.appendChild(buildSnapshotRow(snap, true)));
    }
  };

  const refreshList = async () => {
    snapshots = await getSnapshots();
    renderList();
  };

  nowBtn.addEventListener('click', async () => {
    nowBtn.disabled = true;
    nowBtn.textContent = 'Saving…';
    try {
      await takeSnapshot('Manual');
      await refreshList();
      showToast('Snapshot saved!');
    } catch {
      showToast('Snapshot failed — try again.');
    } finally {
      nowBtn.disabled = false;
      nowBtn.textContent = 'Snapshot now';
    }
  });

  renderList();
  return wrap;
}
