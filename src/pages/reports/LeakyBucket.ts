import { sourceMonthly, fmtCents } from '@/utils/finance';
import { getPaydaysInMonth } from '@/utils/paydays';
import type { Expense, CardCharge, IncomeSource, ExpensePaidRecord } from '@/types';

// ── Bucket interior geometry (SVG viewBox coordinates) ───────────────────────
const INT_TOP = 68;
const INT_BOT = 205;
const INT_H   = INT_BOT - INT_TOP; // 137

// ── Types ─────────────────────────────────────────────────────────────────────

interface DayData {
  day:      number;
  label:    string;
  spend:    number;
  items:    { name: string; amount: number }[];
  isPayday: boolean;
  balance:  number;
  ratio:    number; // 0–1 fill ratio
}

export interface LeakyBucketOpts {
  expenses:       Expense[];
  charges:        CardCharge[];
  incomeSources:  IncomeSource[];
  paidRecords:    ExpensePaidRecord[];
  mascotSvg:      string;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function buildLeakyBucketCard(opts: LeakyBucketOpts): HTMLElement {
  const now = new Date();
  let year  = now.getFullYear();
  let month = now.getMonth();

  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let cursor   = 0;
  let days:    DayData[] = [];
  let cap      = 0;

  // ── Skeleton ──────────────────────────────────────────────────────────────

  const card = document.createElement('div');
  card.className = 'card lb-card';
  card.innerHTML = `
    <div class="lb-head">
      <div>
        <h2 class="font-serif lb-title">Leaky Bucket</h2>
        <p class="text-xs text-muted">Step through the month day by day — the mascot pushes the bucket, bigger expenses tip it further.</p>
      </div>
      <div class="lb-controls">
        <select class="lb-month-sel" id="lb-month-sel"></select>
        <button class="lb-step-btn lb-step-btn--prev" id="lb-prev-btn" disabled>◀ Prev</button>
        <button class="lb-step-btn lb-step-btn--next" id="lb-next-btn">Next ▶</button>
      </div>
    </div>

    <div class="lb-scene">
      <div class="lb-mascot-col">
        <div class="lb-mascot" id="lb-mascot">${opts.mascotSvg}</div>
        <div class="lb-ground"></div>
      </div>

      <div class="lb-bucket-col">
        <svg class="lb-bucket-svg" id="lb-svg" viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id="lb-clip">
              <path d="M 40 68 L 160 68 L 146 205 L 54 205 Z"/>
            </clipPath>
            <linearGradient id="lb-wg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stop-color="#93C5FD" stop-opacity="0.92"/>
              <stop offset="100%" stop-color="#1D4ED8" stop-opacity="0.97"/>
            </linearGradient>
          </defs>

          <!-- Wood body -->
          <path d="M 40 68 L 160 68 L 146 205 L 54 205 Z" fill="#8B5E3C"/>
          <!-- Slats -->
          <line x1="70"  y1="68" x2="62"  y2="205" stroke="#5C3A18" stroke-width="1.5" opacity="0.38"/>
          <line x1="86"  y1="68" x2="80"  y2="205" stroke="#5C3A18" stroke-width="1.5" opacity="0.38"/>
          <line x1="100" y1="68" x2="100" y2="205" stroke="#5C3A18" stroke-width="1.5" opacity="0.38"/>
          <line x1="114" y1="68" x2="120" y2="205" stroke="#5C3A18" stroke-width="1.5" opacity="0.38"/>
          <line x1="130" y1="68" x2="138" y2="205" stroke="#5C3A18" stroke-width="1.5" opacity="0.38"/>

          <!-- Water (clipped to bucket interior) -->
          <g clip-path="url(#lb-clip)">
            <rect id="lb-water" x="36" y="68" width="128" height="137" fill="url(#lb-wg)"/>
            <path id="lb-wave"
              d="M 36 68 Q 68 59 100 68 Q 132 77 164 68 L 164 205 L 36 205 Z"
              fill="#BFDBFE" opacity="0.32"/>
          </g>

          <!-- Metal bands (drawn over water) -->
          <path d="M 37 64 Q 100 60 163 64 L 163 72 Q 100 68 37 72 Z" fill="#C9A84C" opacity="0.92"/>
          <path d="M 43 133 Q 100 130 157 133 L 157 138 Q 100 135 43 138 Z" fill="#C9A84C" opacity="0.85"/>

          <!-- Bucket outline -->
          <path d="M 40 68 L 160 68 L 146 205 L 54 205 Z" fill="none" stroke="#3D1F08" stroke-width="2.5"/>
          <!-- Bottom arc -->
          <path d="M 54 205 Q 100 213 146 205" fill="none" stroke="#3D1F08" stroke-width="3" stroke-linecap="round"/>

          <!-- Handle -->
          <path d="M 65 65 Q 100 22 135 65" fill="none" stroke="#6B3A1F" stroke-width="5" stroke-linecap="round"/>
          <circle cx="65"  cy="66" r="4" fill="#C9A84C"/>
          <circle cx="135" cy="66" r="4" fill="#C9A84C"/>

          <!-- Pour stream (hidden by default) -->
          <g id="lb-pour" style="opacity:0;transition:opacity 0.3s ease">
            <path id="lb-pour-path"
              d="M 160 120 Q 176 142 170 165 Q 164 184 173 198"
              fill="none" stroke="#60A5FA" stroke-width="5" stroke-linecap="round" opacity="0.88"/>
            <circle cx="171" cy="167" r="3.5" fill="#BFDBFE" opacity="0.8"/>
            <circle cx="174" cy="181" r="2.5" fill="#BFDBFE" opacity="0.7"/>
            <ellipse cx="171" cy="203" rx="8" ry="3.5" fill="#93C5FD" opacity="0.6"/>
          </g>
        </svg>

        <div class="lb-balance">
          <span class="lb-balance-val" id="lb-balance-val">—</span>
          <span class="lb-balance-sub">remaining</span>
        </div>
      </div>

      <div class="lb-stats-col">
        <div class="lb-stat"><span class="lb-sk">Budget</span><span class="lb-sv" id="lbs-budget">—</span></div>
        <div class="lb-stat"><span class="lb-sk">Spent</span><span class="lb-sv lb-sv-red" id="lbs-spent">—</span></div>
        <div class="lb-stat"><span class="lb-sk">Remaining</span><span class="lb-sv lb-sv-green" id="lbs-rem">—</span></div>
        <div class="lb-stat"><span class="lb-sk">% used</span><span class="lb-sv" id="lbs-pct">—</span></div>
      </div>
    </div>

    <div class="lb-day-row">
      <span class="lb-day-lbl" id="lb-day-lbl">Start of month — full budget loaded</span>
      <div class="lb-chips" id="lb-chips"></div>
    </div>

    <div class="lb-timeline">
      <div class="lb-bars" id="lb-bars"></div>
      <input type="range" id="lb-scrub" class="lb-scrub" min="0" max="31" value="0" step="1"/>
      <div class="lb-ticks" id="lb-ticks"></div>
    </div>
  `;

  // ── Element refs ──────────────────────────────────────────────────────────

  const mascotEl  = card.querySelector<HTMLElement>('#lb-mascot')!;
  const bucketSvg = card.querySelector<SVGSVGElement>('#lb-svg')!;
  const waterEl   = card.querySelector<SVGRectElement>('#lb-water')!;
  const waveEl    = card.querySelector<SVGPathElement>('#lb-wave')!;
  const pourEl    = card.querySelector<SVGGElement>('#lb-pour')!;
  const pourPath  = card.querySelector<SVGPathElement>('#lb-pour-path')!;
  const balVal    = card.querySelector<HTMLElement>('#lb-balance-val')!;
  const dayLbl    = card.querySelector<HTMLElement>('#lb-day-lbl')!;
  const chipsEl   = card.querySelector<HTMLElement>('#lb-chips')!;
  const barsEl    = card.querySelector<HTMLElement>('#lb-bars')!;
  const ticksEl   = card.querySelector<HTMLElement>('#lb-ticks')!;
  const scrubber  = card.querySelector<HTMLInputElement>('#lb-scrub')!;
  const prevBtn   = card.querySelector<HTMLButtonElement>('#lb-prev-btn')!;
  const nextBtn   = card.querySelector<HTMLButtonElement>('#lb-next-btn')!;
  const monthSel  = card.querySelector<HTMLSelectElement>('#lb-month-sel')!;
  const budgetEl  = card.querySelector<HTMLElement>('#lbs-budget')!;
  const spentEl   = card.querySelector<HTMLElement>('#lbs-spent')!;
  const remEl     = card.querySelector<HTMLElement>('#lbs-rem')!;
  const pctEl     = card.querySelector<HTMLElement>('#lbs-pct')!;

  // CSS transitions
  waterEl.style.transition  = 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)';
  waveEl.style.transition   = 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)';
  bucketSvg.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  mascotEl.style.transition  = 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  mascotEl.style.transformOrigin  = 'bottom center';
  bucketSvg.style.transformOrigin = 'bottom center';

  // ── Month selector ────────────────────────────────────────────────────────

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const opt = document.createElement('option');
    opt.value = `${d.getFullYear()}-${d.getMonth()}`;
    opt.textContent = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (d.getFullYear() === year && d.getMonth() === month) opt.selected = true;
    monthSel.appendChild(opt);
  }

  monthSel.addEventListener('change', () => {
    const [y, m] = monthSel.value.split('-').map(Number);
    year = y!; month = m!;
    rebuild();
  });

  // ── Data & timeline rebuild ───────────────────────────────────────────────

  function rebuild() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    const result = computeDayData(year, month, opts);
    days = result.days;
    cap  = result.cap;

    scrubber.max   = String(days.length);
    scrubber.value = '0';
    cursor = 0;

    // Expense bars
    const maxSpend = Math.max(...days.map(d => d.spend), 1);
    barsEl.innerHTML = '';
    days.forEach((d, i) => {
      const bar = document.createElement('div');
      bar.className = 'lb-bar' + (d.isPayday ? ' lb-bar--payday' : '');
      bar.style.height = `${Math.max(2, (d.spend / maxSpend) * 44)}px`;
      bar.title = `${d.label}: ${fmtCents.format(d.spend)}`;
      bar.addEventListener('click', () => { seek(i + 1, false); });
      barsEl.appendChild(bar);
    });

    // Day ticks
    ticksEl.innerHTML = '';
    const n = days.length;
    const addTick = (num: number, pct: string) => {
      const el = document.createElement('span');
      el.className = 'lb-tick';
      el.textContent = String(num);
      el.style.left = pct;
      ticksEl.appendChild(el);
    };
    addTick(1, '0%');
    for (let d = 5; d < n; d += 5) addTick(d, `${((d - 1) / n) * 100}%`);
    addTick(n, '100%');

    seek(0, false);
  }

  // ── Button state ──────────────────────────────────────────────────────────

  function syncButtons() {
    prevBtn.disabled = cursor <= 0;
    nextBtn.disabled = cursor >= days.length;
  }

  // ── Seek to a day ─────────────────────────────────────────────────────────

  function seek(day: number, animate: boolean) {
    cursor = day;
    scrubber.value = String(day);

    const data  = day > 0 ? days[day - 1] : null;
    const ratio = data ? data.ratio : 1;
    const spent = cap - (data ? data.balance : cap);
    const rem   = data ? data.balance : cap;
    const pct   = cap > 0 ? Math.round((Math.max(0, spent) / cap) * 100) : 0;

    // Water level
    setWater(ratio);

    // Tilt: push animation or settle immediately
    if (animate) {
      triggerPush(data?.spend ?? 0, ratio);
    } else {
      pourEl.style.opacity = '0';
      applyTilt(ratio);
    }

    // Stats
    budgetEl.textContent = fmtCents.format(cap);
    spentEl.textContent  = fmtCents.format(Math.max(0, spent));
    remEl.textContent    = fmtCents.format(Math.max(0, rem));
    pctEl.textContent    = `${pct}%`;
    balVal.textContent   = rem < 0 ? `-${fmtCents.format(-rem)}` : fmtCents.format(rem);
    balVal.className     = `lb-balance-val${ratio < 0.15 ? ' lb-danger' : ratio < 0.35 ? ' lb-warning' : ''}`;

    // Day info
    if (!data) {
      dayLbl.textContent = 'Start of month — full budget loaded';
      chipsEl.innerHTML  = '';
    } else {
      dayLbl.textContent = `${data.label}  ·  Day ${day} of ${days.length}`;
      chipsEl.innerHTML  = '';

      if (data.isPayday) {
        const chip = document.createElement('span');
        chip.className   = 'lb-chip lb-chip--payday';
        chip.textContent = '💰 Payday';
        chipsEl.appendChild(chip);
      }

      if (data.items.length > 0) {
        data.items.forEach(item => {
          const chip = document.createElement('span');
          chip.className   = 'lb-chip lb-chip--expense';
          chip.textContent = `${item.name}: ${fmtCents.format(item.amount)}`;
          chipsEl.appendChild(chip);
        });
      } else if (!data.isPayday) {
        const chip = document.createElement('span');
        chip.className   = 'lb-chip lb-chip--quiet';
        chip.textContent = 'No spending today';
        chipsEl.appendChild(chip);
      }
    }

    // Highlight active bar
    barsEl.querySelectorAll('.lb-bar').forEach((b, i) => {
      b.classList.toggle('lb-bar--active', i === day - 1);
    });

    syncButtons();
  }

  // ── Water level ───────────────────────────────────────────────────────────

  function setWater(ratio: number) {
    // The bucket is trapezoidal: top inner width 120px, bottom inner width 92px,
    // height 137px. To show the correct proportional "fullness" the water height
    // must be solved from the area equation rather than scaled linearly.
    //
    // Area from bottom to height h:  A(h) = 92h + (28/274)h²
    // Total area:                    A_total = 92·137 + 14·137 = 14,522
    // Solve A(h) = ratio·14522  →  (14/137)h² + 92h − ratio·14522 = 0
    // Quadratic solution (positive root):
    //   h = 137·(−92 + √(8464 + 5938·ratio)) / 28
    const h  = 137 * (-92 + Math.sqrt(8464 + 5938 * ratio)) / 28;
    const ty = INT_H - Math.max(0, Math.min(INT_H, h));
    waterEl.style.transform = `translateY(${ty}px)`;
    waveEl.style.transform  = `translateY(${ty}px)`;
  }

  // ── Pour stream ───────────────────────────────────────────────────────────

  function triggerPour(ratio: number, intensity: number) {
    const waterY  = INT_TOP + (1 - ratio) * INT_H;
    const exitY   = Math.max(INT_TOP + 8, Math.min(INT_BOT - 35, waterY));
    const t       = (exitY - INT_TOP) / INT_H;
    const exitX   = 160 - t * 14;

    const endY  = exitY + 58;
    pourPath.setAttribute('d',
      `M ${exitX} ${exitY} Q ${exitX + 17} ${exitY + 22} ${exitX + 11} ${exitY + 42} Q ${exitX + 4} ${endY - 8} ${exitX + 13} ${endY}`
    );
    pourPath.style.strokeWidth = String(Math.min(9, 3 + intensity * 5));
    pourEl.style.opacity = String(Math.min(1, 0.45 + intensity * 0.55));
    setTimeout(() => { pourEl.style.opacity = '0'; }, 950);
  }

  // ── Mascot push animation ─────────────────────────────────────────────────

  function triggerPush(daySpend: number, ratio: number) {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }

    // intensity: 0 = no spend, 1 = spend >= 25% of monthly budget
    const intensity = Math.min(1, daySpend / Math.max(cap * 0.25, 1));

    if (daySpend > 0) {
      // Mascot leans hard toward the bucket (positive = clockwise = toward bucket on left side)
      const mascotDeg = 14 + intensity * 24;
      const mascotTx  = 5 + intensity * 18;
      // Bucket tips away from mascot (negative = counter-clockwise)
      const bucketDeg = -(4 + intensity * 28);
      const bucketTx  = 6 + intensity * 24;

      mascotEl.style.transform  = `rotate(${mascotDeg}deg) translateX(${mascotTx}px)`;
      bucketSvg.style.transform = `rotate(${bucketDeg}deg) translateX(${bucketTx}px)`;
      triggerPour(ratio, intensity);
    } else {
      // No spending: mascot just peeks toward the bucket, no pour
      mascotEl.style.transform  = 'rotate(6deg) translateX(3px)';
      bucketSvg.style.transform = 'rotate(-1deg)';
    }

    // Settle back to the fill-level resting tilt after the push
    pushTimer = setTimeout(() => {
      applyTilt(ratio);
      pushTimer = null;
    }, 680);
  }

  // ── Fill-level resting tilt ───────────────────────────────────────────────

  function applyTilt(ratio: number) {
    if (ratio > 0.7) {
      bucketSvg.style.transform = '';
      mascotEl.style.transform  = '';
    } else if (ratio > 0.45) {
      bucketSvg.style.transform = '';
      mascotEl.style.transform  = 'rotate(9deg) translateX(6px)';
    } else if (ratio > 0.25) {
      bucketSvg.style.transform = 'rotate(-4deg)';
      mascotEl.style.transform  = 'rotate(16deg) translateX(10px)';
    } else if (ratio > 0.08) {
      bucketSvg.style.transform = 'rotate(-11deg)';
      mascotEl.style.transform  = 'rotate(22deg) translateX(14px)';
    } else {
      bucketSvg.style.transform = 'rotate(-42deg) translateX(38px)';
      mascotEl.style.transform  = 'rotate(-20deg) translateX(-16px)';
    }
  }

  // ── Step buttons ──────────────────────────────────────────────────────────

  nextBtn.addEventListener('click', () => {
    if (cursor < days.length) seek(cursor + 1, true);
  });

  prevBtn.addEventListener('click', () => {
    if (cursor > 0) seek(cursor - 1, false);
  });

  scrubber.addEventListener('input', () => {
    const d = parseInt(scrubber.value, 10);
    seek(d, false);
  });

  // ── Init ──────────────────────────────────────────────────────────────────

  rebuild();
  return card;
}

// ── Compute day-by-day data ───────────────────────────────────────────────────

function computeDayData(year: number, month: number, opts: LeakyBucketOpts) {
  const { expenses, charges, incomeSources, paidRecords } = opts;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const t0 = new Date(year, month,     1).getTime();
  const t1 = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();

  // Income capacity
  const monthlyRate = incomeSources
    .filter(s => s.active && s.frequency !== 'once')
    .reduce((sum, s) => sum + sourceMonthly(s), 0);
  const onceAmt = incomeSources
    .filter(s => s.frequency === 'once' && (s.date ?? 0) >= t0 && (s.date ?? 0) <= t1)
    .reduce((sum, s) => sum + s.amount, 0);

  // Fallback capacity = total spending
  const totalSpend =
    expenses.filter(e => !e.recurring && e.date >= t0 && e.date <= t1).reduce((s, e) => s + e.amount, 0) +
    paidRecords.filter(r => r.date >= t0 && r.date <= t1).reduce((s, r) => s + r.amount, 0) +
    charges.filter(c => c.date >= t0 && c.date <= t1).reduce((s, c) => s + c.amount, 0);

  const cap = monthlyRate + onceAmt || totalSpend || 1;

  // Spend per day
  const spendMap = new Map<number, { name: string; amount: number }[]>();

  expenses.filter(e => !e.recurring && e.date >= t0 && e.date <= t1).forEach(e => {
    const d = new Date(e.date).getDate();
    spendMap.set(d, [...(spendMap.get(d) ?? []), { name: e.description, amount: e.amount }]);
  });

  paidRecords.filter(r => r.date >= t0 && r.date <= t1).forEach(r => {
    const ex = expenses.find(e => e.id === r.expenseId);
    if (!ex) return;
    const d = new Date(r.date).getDate();
    spendMap.set(d, [...(spendMap.get(d) ?? []), { name: ex.description, amount: r.amount }]);
  });

  charges.filter(c => c.date >= t0 && c.date <= t1).forEach(c => {
    const d = new Date(c.date).getDate();
    spendMap.set(d, [...(spendMap.get(d) ?? []), { name: c.merchant, amount: c.amount }]);
  });

  // Payday markers
  const paydaySet = new Set<number>();
  incomeSources.filter(s => s.active && s.paydayRef).forEach(s => {
    getPaydaysInMonth(s, year, month).forEach(d => paydaySet.add(d));
  });

  // Build day array
  let cum = 0;
  const days: DayData[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const items = spendMap.get(d) ?? [];
    const spend = items.reduce((s, i) => s + i.amount, 0);
    cum += spend;
    const balance = cap - cum;
    const ratio   = Math.max(0, Math.min(1, balance / cap));

    days.push({
      day:      d,
      label:    new Date(year, month, d).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric',
                }),
      spend,
      items,
      isPayday: paydaySet.has(d),
      balance,
      ratio,
    });
  }

  return { days, cap };
}
