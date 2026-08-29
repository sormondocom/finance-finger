import '@/pages/break-glass/break-glass.css';
import { BUCK_SVG, PENNY_SVG } from '@/mascot/svgs';
import { navigate } from '@/app/router';
import type { MascotGender } from '@/types';

const WARNED_KEY = 'bg-warned';

function showEntryWarning(mascotGender: MascotGender | null | undefined, onConfirm: () => void): void {
  const svg = (mascotGender ?? 'buck') === 'penny' ? PENNY_SVG : BUCK_SVG;

  const overlay = document.createElement('div');
  overlay.className = 'bg-overlay';

  const card = document.createElement('div');
  card.className = 'bg-warning-card';
  card.innerHTML = `
    <div class="bg-warning-mascot">${svg}</div>
    <p class="bg-warning-title">Hold on there, sugar.</p>
    <div class="bg-warning-body">
      <p>What you're fixin' to open is the <strong>Break Glass</strong> tool — direct access to every raw record in your database. No guardrails, no polished forms, and no undo button once you start messin' around in there.</p>
      <p>One wrong character in the wrong field and your whole financial setup could end up more tangled than a fishing line in a cedar tree. I'm talkin' <em>corrupted records, orphaned data, the whole nine yards</em>.</p>
      <p>Now, if something broke and you need to fix it — I'm right here with you, and I'm proud of you for bein' brave. If you're just pokin' around — please, for the love of sweet tea, close this up and go about your day.</p>
      <p>Still wanna go in? <strong>Bless your heart.</strong> I'll be right here.</p>
    </div>
  `;

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-danger bg-warning-btn';
  confirmBtn.dataset['testid'] = 'bg-warning-confirm';
  confirmBtn.textContent = "I hear ya — open 'er up";
  confirmBtn.addEventListener('click', () => {
    sessionStorage.setItem(WARNED_KEY, '1');
    overlay.remove();
    onConfirm();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target !== overlay) return;
    card.style.animation = 'none';
    requestAnimationFrame(() => { card.style.animation = 'bg-shake 0.35s ease'; });
  });

  card.appendChild(confirmBtn);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

export function buildBreakGlassSection(mascotGender: MascotGender | null | undefined): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'settings-group';
  wrap.innerHTML = `<div class="settings-group-title" style="color:var(--color-danger)">Break Glass</div>`;

  const row = document.createElement('div');
  row.className = 'setting-row settings-danger';
  row.innerHTML = `
    <div class="setting-row-info">
      <span class="setting-row-label">Raw data editor</span>
      <span class="setting-row-desc">
        Direct read/edit/delete access to every IndexedDB store, plus an orphan record scanner.
        For debugging and emergency fixes only — no undo, no guardrails.
      </span>
    </div>
  `;

  const openBtn = document.createElement('button');
  openBtn.className = 'btn btn-danger setting-row-control';
  openBtn.dataset['testid'] = 'bg-open-btn';
  openBtn.textContent = '🔧 Open Break Glass';
  openBtn.addEventListener('click', () => {
    showEntryWarning(mascotGender, () => navigate('/break-glass'));
  });

  row.appendChild(openBtn);
  wrap.appendChild(row);
  return wrap;
}
