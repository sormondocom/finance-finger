import { getSetting, saveSetting, getTransactionRules, deleteTransactionRule, clearAllTransactionRules } from '@/db';
import type { TransactionRule } from '@/types';

export function buildImportRulesSection(showToast: (msg: string) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'settings-group';
  wrap.innerHTML = `<div class="settings-group-title">Repeat Transaction Detection</div>`;

  const descRow = document.createElement('div');
  descRow.className = 'setting-row';
  descRow.innerHTML = `
    <div class="setting-row-info">
      <span class="setting-row-label">Enable auto-matching</span>
      <span class="setting-row-desc">When a vendor appears the set number of times during import, you will be offered to auto-manage it going forward — skipping the review card on future imports.</span>
    </div>
  `;
  const enableToggle = document.createElement('label');
  enableToggle.className = 'setting-row-control';
  enableToggle.style.cssText = 'display:flex;align-items:center;gap:var(--space-2);cursor:pointer';
  const enableCheck = document.createElement('input');
  enableCheck.type = 'checkbox';
  enableCheck.checked = true;
  const enableLabel = document.createElement('span');
  enableLabel.style.cssText = 'font-size:var(--text-sm)';
  enableLabel.textContent = 'Enabled';
  enableToggle.appendChild(enableCheck);
  enableToggle.appendChild(enableLabel);
  descRow.appendChild(enableToggle);
  wrap.appendChild(descRow);

  void getSetting<boolean>('import.repeatDetection.enabled').then((v) => {
    enableCheck.checked = v ?? true;
  });
  enableCheck.addEventListener('change', async () => {
    await saveSetting('import.repeatDetection.enabled', enableCheck.checked);
  });

  const thresholdRow = document.createElement('div');
  thresholdRow.className = 'setting-row';
  thresholdRow.innerHTML = `
    <div class="setting-row-info">
      <span class="setting-row-label">Match threshold</span>
      <span class="setting-row-desc">Number of confirmed transactions from the same vendor before auto-management is offered. Default is 5.</span>
    </div>
  `;
  const thresholdControl = document.createElement('div');
  thresholdControl.className = 'setting-row-control';
  thresholdControl.style.cssText = 'display:flex;gap:var(--space-2);align-items:center';
  const thresholdInput = document.createElement('input');
  thresholdInput.type = 'number';
  thresholdInput.min = '1';
  thresholdInput.max = '50';
  thresholdInput.value = '5';
  thresholdInput.style.cssText = 'width:64px;text-align:right';
  thresholdInput.setAttribute('data-testid', 'settings-repeat-threshold');
  const thresholdSave = document.createElement('button');
  thresholdSave.className = 'btn btn-primary';
  thresholdSave.textContent = 'Save';
  thresholdSave.setAttribute('data-testid', 'settings-repeat-threshold-save');
  thresholdSave.addEventListener('click', async () => {
    const val = Math.max(1, Math.min(50, parseInt(thresholdInput.value, 10) || 5));
    thresholdInput.value = String(val);
    await saveSetting('import.repeatDetection.threshold', val);
    showToast('Threshold updated!');
  });
  thresholdControl.appendChild(thresholdInput);
  thresholdControl.appendChild(thresholdSave);
  thresholdRow.appendChild(thresholdControl);
  wrap.appendChild(thresholdRow);

  void getSetting<number>('import.repeatDetection.threshold').then((v) => {
    thresholdInput.value = String(v ?? 5);
  });

  const rulesLabelRow = document.createElement('div');
  rulesLabelRow.className = 'setting-row';
  rulesLabelRow.style.borderTop = '1px solid var(--color-border)';
  rulesLabelRow.innerHTML = `
    <div class="setting-row-info">
      <span class="setting-row-label">Auto-match rules</span>
      <span class="setting-row-desc">Vendors that have been seen enough times. Rules marked "Auto" are applied on import without review.</span>
    </div>
  `;
  wrap.appendChild(rulesLabelRow);

  const rulesList = document.createElement('div');
  rulesList.className = 'import-rules-list';
  wrap.appendChild(rulesList);

  const ACTION_LABELS: Record<string, string> = {
    'expense':      'Expense payment',
    'debt-payment': 'Debt / card payment',
    'transfer':     'Transfer',
    'income':       'Income / deposit',
    'category':     'Categorized charge',
  };

  const renderRules = async () => {
    rulesList.innerHTML = '';
    const rules = await getTransactionRules();
    if (rules.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'font-size:var(--text-sm);color:var(--color-text-muted);padding:var(--space-1) var(--space-5) var(--space-2)';
      empty.textContent = 'No rules yet. They are created automatically as you review imports.';
      rulesList.appendChild(empty);
      return;
    }
    rules.forEach((rule: TransactionRule) => {
      const row = document.createElement('div');
      row.className = 'import-rule-row';

      const info = document.createElement('div');
      info.className = 'import-rule-info';

      const name = document.createElement('span');
      name.className = 'import-rule-name';
      name.textContent = rule.displayName;
      name.title = `Pattern: ${rule.pattern}`;
      info.appendChild(name);

      const meta = document.createElement('span');
      meta.className = 'import-rule-meta';
      meta.textContent = `${ACTION_LABELS[rule.action.type] ?? rule.action.type} · ${rule.appliedCount} match${rule.appliedCount !== 1 ? 'es' : ''}`;
      info.appendChild(meta);

      const badge = document.createElement('span');
      badge.className = `import-rule-badge ${rule.autoManage ? 'import-rule-badge--auto' : 'import-rule-badge--learning'}`;
      badge.textContent = rule.autoManage ? 'Auto' : 'Learning';
      info.appendChild(badge);

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-secondary';
      delBtn.style.cssText = 'font-size:var(--text-xs);color:var(--color-danger);flex-shrink:0';
      delBtn.textContent = 'Remove';
      delBtn.addEventListener('click', async () => {
        await deleteTransactionRule(rule.id);
        await renderRules();
      });

      row.appendChild(info);
      row.appendChild(delBtn);
      rulesList.appendChild(row);
    });
  };

  void renderRules();

  const clearRow = document.createElement('div');
  clearRow.className = 'setting-row settings-danger';
  clearRow.innerHTML = `
    <div class="setting-row-info">
      <span class="setting-row-label">Clear all rules</span>
      <span class="setting-row-desc">Removes all auto-match rules and resets repeat detection. Future imports will require full manual review.</span>
    </div>
  `;
  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn btn-danger setting-row-control';
  clearBtn.textContent = 'Clear all';
  clearBtn.addEventListener('click', async () => {
    if (!confirm('Clear all auto-match rules? This cannot be undone.')) return;
    await clearAllTransactionRules();
    await renderRules();
    showToast('All rules cleared.');
  });
  clearRow.appendChild(clearBtn);
  wrap.appendChild(clearRow);

  return wrap;
}
