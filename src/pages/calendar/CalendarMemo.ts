import { openModal } from '@/components/Modal';
import { saveCalendarMemo, createCalendarMemo, deleteCalendarMemo } from '@/db';
import type { HouseholdMember, CalendarMemo } from '@/types';
import { userLocale } from '@/utils/locale';

export type CalendarMemoContext = {
  members: HouseholdMember[];
  memos: Map<string, CalendarMemo[]>;
  container: HTMLElement;
};

export function buildMemoWidget(dateKey: string, dayMemos: CalendarMemo[], ctx: CalendarMemoContext): HTMLElement {
  const widget = document.createElement('div');
  widget.className = 'cal-memo-widget';

  const btn = document.createElement('button');
  const count = dayMemos.length;
  btn.className = `cal-memo-btn${count === 0 ? ' cal-memo-btn--empty' : ''}`;
  if (count === 2) btn.dataset['stacked'] = '2';
  if (count >= 3) btn.dataset['stacked'] = '3';
  btn.setAttribute('aria-label', count > 0 ? `${count} note${count > 1 ? 's' : ''}` : 'Add note');
  btn.setAttribute('title', count > 0 ? `${count} note${count > 1 ? 's' : ''}` : 'Add note');
  btn.setAttribute('data-testid', 'cal-memo-btn');
  btn.innerHTML = count === 0
    ? '+'
    : count === 1
      ? '&#9998;'
      : `&#9998;<span class="cal-memo-count-badge">${count}</span>`;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openMemoModal(dateKey, dayMemos, ctx);
  });

  widget.appendChild(btn);
  return widget;
}

function openMemoModal(dateKey: string, initialMemos: CalendarMemo[], ctx: CalendarMemoContext): void {
  let memos = [...initialMemos];
  let currentIndex = 0;

  const [y, mo, d] = dateKey.split('-').map(Number) as [number, number, number];
  const dateLabel = new Date(y, mo - 1, d, 12).toLocaleDateString(userLocale, {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const content = document.createElement('div');
  content.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';

  const pagerSection = document.createElement('div');
  pagerSection.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-3)';

  const pagerBar = document.createElement('div');
  pagerBar.className = 'cal-memo-pager';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'cal-memo-nav-btn';
  prevBtn.textContent = '←';
  prevBtn.setAttribute('aria-label', 'Previous note');
  prevBtn.setAttribute('data-testid', 'cal-memo-prev');

  const pagerLabel = document.createElement('span');
  pagerLabel.className = 'cal-memo-pager-label';
  pagerLabel.setAttribute('data-testid', 'cal-memo-pager-label');

  const nextBtn = document.createElement('button');
  nextBtn.className = 'cal-memo-nav-btn';
  nextBtn.textContent = '→';
  nextBtn.setAttribute('aria-label', 'Next note');
  nextBtn.setAttribute('data-testid', 'cal-memo-next');

  pagerBar.appendChild(prevBtn);
  pagerBar.appendChild(pagerLabel);
  pagerBar.appendChild(nextBtn);

  const noteCard = document.createElement('div');
  noteCard.className = 'cal-memo-note-card';
  noteCard.setAttribute('data-testid', 'cal-memo-note-card');

  const noteText = document.createElement('p');
  noteText.className = 'cal-memo-note-text';
  noteText.setAttribute('data-testid', 'cal-memo-note-text');
  noteCard.appendChild(noteText);

  const noteMeta = document.createElement('div');
  noteMeta.className = 'cal-memo-note-meta';

  const metaInfo = document.createElement('span');
  metaInfo.className = 'cal-memo-meta-info';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'cal-memo-delete-btn';
  deleteBtn.setAttribute('data-testid', 'cal-memo-delete-btn');
  deleteBtn.textContent = 'Delete';

  noteMeta.appendChild(metaInfo);
  noteMeta.appendChild(deleteBtn);

  pagerSection.appendChild(pagerBar);
  pagerSection.appendChild(noteCard);
  pagerSection.appendChild(noteMeta);

  const divider = document.createElement('hr');
  divider.className = 'cal-memo-divider';

  const addSection = document.createElement('div');
  addSection.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-3)';

  const addLabel = document.createElement('label');
  addLabel.className = 'form-label';

  const textarea = document.createElement('textarea');
  textarea.rows = 3;
  textarea.maxLength = 500;
  textarea.placeholder = 'Write a note for yourself or a family member...';
  textarea.style.cssText = 'resize:vertical;min-height:72px';
  textarea.setAttribute('data-testid', 'cal-memo-textarea');

  const addRow = document.createElement('div');
  addRow.style.cssText = 'display:flex;align-items:center;gap:var(--space-3)';

  if (ctx.members.length > 0) {
    const fromLabel = document.createElement('span');
    fromLabel.style.cssText = 'font-size:var(--text-sm);color:var(--color-text-muted);white-space:nowrap';
    fromLabel.textContent = 'From:';
    const memberSel = document.createElement('select');
    memberSel.id = 'cal-memo-member';
    memberSel.style.flex = '1';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— No author —';
    memberSel.appendChild(noneOpt);
    ctx.members.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      memberSel.appendChild(opt);
    });
    addRow.appendChild(fromLabel);
    addRow.appendChild(memberSel);
  }

  const addNoteBtn = document.createElement('button');
  addNoteBtn.className = 'btn btn-primary';
  addNoteBtn.style.whiteSpace = 'nowrap';
  addNoteBtn.setAttribute('data-testid', 'cal-memo-add-btn');
  addNoteBtn.textContent = 'Add Note';
  addRow.appendChild(addNoteBtn);

  const errorEl = document.createElement('p');
  errorEl.className = 'form-error';
  errorEl.style.display = 'none';

  addSection.appendChild(addLabel);
  addSection.appendChild(textarea);
  addSection.appendChild(addRow);
  addSection.appendChild(errorEl);

  const refreshPager = () => {
    if (memos.length === 0) {
      pagerSection.style.display = 'none';
      divider.style.display = 'none';
      addLabel.textContent = 'Write a note';
      return;
    }
    pagerSection.style.display = '';
    divider.style.display = '';
    addLabel.textContent = 'Add another note';

    const memo = memos[currentIndex]!;
    pagerLabel.textContent = `Note ${currentIndex + 1} of ${memos.length}`;
    noteText.textContent = memo.text;

    const member = ctx.members.find((m) => m.id === memo.memberId);
    const authorStr = member ? `— ${member.name}` : '';
    const dateStr = new Date(memo.createdAt).toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: 'numeric' });
    metaInfo.textContent = [authorStr, dateStr].filter(Boolean).join(' · ');

    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === memos.length - 1;
  };

  prevBtn.addEventListener('click', () => { currentIndex--; refreshPager(); });
  nextBtn.addEventListener('click', () => { currentIndex++; refreshPager(); });

  deleteBtn.addEventListener('click', async () => {
    const memo = memos[currentIndex]!;
    await deleteCalendarMemo(memo.id);
    memos = memos.filter((m) => m.id !== memo.id);
    if (currentIndex >= memos.length) currentIndex = Math.max(0, memos.length - 1);
    if (memos.length === 0) ctx.memos.delete(dateKey);
    else ctx.memos.set(dateKey, [...memos]);
    updateMemoWidget(dateKey, memos, ctx);
    refreshPager();
  });

  addNoteBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) {
      errorEl.textContent = '⚠ Write something first.';
      errorEl.style.display = '';
      return;
    }
    errorEl.style.display = 'none';
    const memberSel = content.querySelector<HTMLSelectElement>('#cal-memo-member');
    const memberId = memberSel?.value || undefined;
    const memo = memberId
      ? createCalendarMemo(dateKey, text, memberId)
      : createCalendarMemo(dateKey, text);
    await saveCalendarMemo(memo);
    memos = [...memos, memo];
    currentIndex = memos.length - 1;
    ctx.memos.set(dateKey, [...memos]);
    updateMemoWidget(dateKey, memos, ctx);
    textarea.value = '';
    refreshPager();
  });

  content.appendChild(pagerSection);
  content.appendChild(divider);
  content.appendChild(addSection);

  refreshPager();

  openModal({ title: `Notes — ${dateLabel}`, content });
}

function updateMemoWidget(dateKey: string, memos: CalendarMemo[], ctx: CalendarMemoContext): void {
  const day = parseInt(dateKey.split('-')[2]!, 10);
  const cell = ctx.container.querySelector<HTMLElement>(`[data-day="${day}"]`);
  if (!cell) return;
  const existing = cell.querySelector('.cal-memo-widget');
  const newWidget = buildMemoWidget(dateKey, memos, ctx);
  if (existing) {
    existing.replaceWith(newWidget);
  } else {
    cell.appendChild(newWidget);
  }
}
