import { makeCard } from '../helpUtils';

export function render(grid: HTMLElement): void {
  grid.appendChild(cardCalendarGrid());
  grid.appendChild(cardCalendarPaydays());
  grid.appendChild(cardCalendarMemos());
}

function cardCalendarGrid(): HTMLElement {
  const card = makeCard('📆', 'Reading the Calendar Grid');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>The Calendar page shows all tracked bills (recurring expenses with a due day) laid out on a monthly grid. Bills with due days on days 29–31 clamp to the last day of shorter months.</p>
    </div>
    <div class="help-status-grid">
      <div class="help-status-row"><span class="help-status-dot" style="background:var(--color-danger)"></span><div><strong>Red chip</strong> — Past Due</div></div>
      <div class="help-status-row"><span class="help-status-dot" style="background:#f59e0b"></span><div><strong>Amber chip</strong> — Due Soon (within 7 days)</div></div>
      <div class="help-status-row"><span class="help-status-dot" style="background:var(--ff-green)"></span><div><strong>Green chip</strong> — Paid this calendar month</div></div>
      <div class="help-status-row"><span class="help-status-dot" style="background:var(--ff-sage)"></span><div><strong>Sage chip</strong> — Upcoming (due later in the month)</div></div>
    </div>
    <div class="edu-card-voice">
      <p>The summary bar above the grid shows a count for each status. Click <strong>✓ Mark Paid</strong> below any unpaid chip — the same payment dialog as the Expenses page opens.</p>
      <p>Use the <strong>‹ / ›</strong> arrows to navigate between months. Today's date is highlighted in the grid.</p>
    </div>
  `;
  return card;
}

function cardCalendarPaydays(): HTMLElement {
  const card = makeCard('💰', 'Payday Chips');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>Income sources with a set frequency show gold 💰 payday chips on the Calendar at the days they pay out. This lets you see at a glance when money is coming in vs. when bills are due.</p>
      <p><strong>Semi-monthly sources</strong> show on the 1st and 15th with their respective amounts. <strong>Biweekly sources</strong> calculate forward from a reference date you set on the income source form.</p>
      <p>One-time income items logged on the Dashboard also appear as 💵 chips on the Calendar for their logged date.</p>
    </div>
  `;
  return card;
}

function cardCalendarMemos(): HTMLElement {
  const card = makeCard('📌', 'Sticky Note Memos');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>Add personal notes to any calendar day — a note about what happened, a reminder to follow up, or anything worth remembering. Memos are stored encrypted like all other data.</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">🖱️</span><div class="help-step-body"><strong>Hover any calendar cell</strong> to reveal the sticky-note button (yellow, bottom-right of the cell). It stays hidden until you hover to keep the grid clean.</div></div>
      <div class="help-step"><span class="help-step-num">➕</span><div class="help-step-body">An <strong>empty cell</strong> shows a <code>+</code> button. Click it to open the memo modal and type your note.</div></div>
      <div class="help-step"><span class="help-step-num">✎</span><div class="help-step-body">A <strong>cell with notes</strong> shows a pencil icon (with a count badge for 2+ notes). Click to open the viewer.</div></div>
      <div class="help-step"><span class="help-step-num">◀▶</span><div class="help-step-body"><strong>Page through notes</strong> with the prev/next buttons at the top of the viewer. The label shows "Note N of M."</div></div>
      <div class="help-step"><span class="help-step-num">🗑️</span><div class="help-step-body"><strong>Delete</strong> any note using the trash button below its card. Deleting all notes restores the empty <code>+</code> state.</div></div>
      <div class="help-step"><span class="help-step-num">👤</span><div class="help-step-body">Optionally <strong>attribute a memo</strong> to a household member using the dropdown in the add form.</div></div>
    </div>
    <div class="help-callout">
      Multiple notes on a day show a <strong>stacked sticky-note visual</strong> (two or three layers) as a visual cue that more than one note exists.
    </div>
  `;
  return card;
}
