import './mascot.css';
import browser from 'webextension-polyfill';
import { BUCK_SVG, PENNY_SVG, DOOR_SVG } from './svgs';
import { getLines, getDailyTip } from './messages';
import { navigate } from '@/app/router';
import { playCowbell } from '@/utils/bellSound';
import type { NotifierItem } from '@/utils/notifier';
import type { CustomNotification, MascotGender, MascotTrigger, VaultConfig } from '@/types';
import { userLocale } from '@/utils/locale';
import { fmtCents } from '@/utils/finance';
import { showToast } from '@/utils/errorUI';
import type { MissedPayday } from '@/utils/paydayDeposits';
import type { LapsedDebtCycle } from '@/utils/debtCatchUp';
import type { LapsedExpenseCycle } from '@/utils/expenseCatchUp';

// ── Debt Payoff Celebration ───────────────────────────────────────────────────

const CELEBRATION_LINES: Record<
  MascotGender,
  { solo: string[]; couple: string[]; family: string[] }
> = {
  buck: {
    solo: [
      "Yee-haw! That debt's been lassoed, hogtied, and sent to the pasture for GOOD, partner!",
      "Well butter my biscuit — {name} is tip-tappin' his hooves tonight! That balance hit ZERO!",
      "Git along, little loan! {name}'s hootin' and hollerin' — that one's DONE!",
      "That debt answered to the wrong herd, partner. Wrangled and retired for good!",
    ],
    couple: [
      "{name} and the missus are do-si-do-ing all night long! That debt didn't stand a chance!",
      "The hoedown's started! When the whole corral celebrates, debts don't stand a chance!",
      "Two-step to victory! This family just cleared the books on that one!",
    ],
    family: [
      "The whole herd is dancin'! Best day on the financial range — EVER, y'all!",
      "Hats in the air, little ones! The whole family lassoed this one together!",
      "Even the piglets are stompin' their hooves! Debt down, family celebrating!",
    ],
  },
  penny: {
    solo: [
      "Land sakes alive, {name} is twirling! That debt is DONE, sugar!",
      "Well aren't you just the cat's meow! Zero balance — {name} couldn't be prouder!",
      "Oh my stars! That debt is absolutely, positively HISTORY. Fabulous job, honey!",
      "{name} is dancing on air! Nothing quite like watching a balance hit zero!",
    ],
    couple: [
      "{name} and her beau are swingin' partners tonight — that debt answered to this family!",
      "Oh my goodness, this calls for a real celebration! That debt is yesterday's news, darling!",
      "When this household teams up, debts don't last long. Simply gorgeous work, you two!",
    ],
    family: [
      "The whole family's going hog-wild! This calls for the biggest hoedown the house has ever seen!",
      "Sweets for everyone! {name} and the whole crew paid this one off together — gorgeous!",
      "Every little piglet is spinning! This family is absolutely unstoppable!",
    ],
  },
};

function pickLine(gender: MascotGender, name: string, hasPartner: boolean, hasKids: boolean): string {
  const set = CELEBRATION_LINES[gender];
  const pool = hasKids ? set.family : hasPartner ? set.couple : set.solo;
  const line = pool[Math.floor(Math.random() * pool.length)]!;
  return line.replace(/\{name\}/g, name);
}

function buildConfetti(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'confetti-wrap';
  const colors = ['#C9A84C','#2D5A27','#B45309','#7C3AED','#BE185D','#0891B2','#F59E0B','#EF4444','#10B981','#38BDF8','#FCD34D'];
  for (let i = 0; i < 38; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    const size = 7 + Math.random() * 11;
    p.style.cssText = [
      `left:${(Math.random() * 100).toFixed(1)}%`,
      `width:${size.toFixed(1)}px`,
      `height:${(size * (Math.random() > 0.5 ? 1 : 0.45)).toFixed(1)}px`,
      `background:${colors[Math.floor(Math.random() * colors.length)]}`,
      `animation-delay:${(Math.random() * 2.5).toFixed(2)}s`,
      `animation-duration:${(1.6 + Math.random() * 2).toFixed(2)}s`,
      `border-radius:${Math.random() > 0.45 ? '50%' : '2px'}`,
      `transform:rotate(${Math.floor(Math.random() * 360)}deg)`,
    ].join(';');
    wrap.appendChild(p);
  }
  return wrap;
}

function dismissCelebration(overlay: HTMLElement): void {
  if (!document.body.contains(overlay)) return;
  overlay.classList.add('celebration-out');
  overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
}

export async function showDebtPayoffCelebration(cardName: string): Promise<void> {
  document.getElementById('debt-celebration')?.remove();

  await loadConfig();
  const gender: MascotGender = activeConfig?.mascotGender ?? 'buck';
  const name = activeConfig?.mascotName ?? (gender === 'buck' ? 'Buck' : 'Penny');

  const { getMembers } = await import('@/db');
  const members = await getMembers();
  const hasPartner = members.some((m) =>
    (gender === 'buck' && m.avatarType === 'female') ||
    (gender === 'penny' && m.avatarType === 'male'),
  );
  const kidTypes = new Set(['child', 'baby-male', 'baby-female', 'child-male', 'child-female', 'teen-male', 'teen-female']);
  const kidCount = members.filter((m) => kidTypes.has(m.avatarType ?? '')).length;

  const overlay = document.createElement('div');
  overlay.className = 'celebration-overlay';
  overlay.id = 'debt-celebration';

  overlay.appendChild(buildConfetti());

  const panel = document.createElement('div');
  panel.className = 'celebration-panel';

  // Title
  const banner = document.createElement('div');
  banner.className = 'celebration-banner';
  banner.textContent = '🎉 PAID OFF! 🎉';
  panel.appendChild(banner);

  const subtitle = document.createElement('p');
  subtitle.className = 'celebration-card-name';
  subtitle.textContent = `${cardName} is DEBT FREE!`;
  panel.appendChild(subtitle);

  // Dancing mascots
  const mascotRow = document.createElement('div');
  mascotRow.className = 'celebration-mascots';

  const primary = document.createElement('div');
  primary.className = 'celebration-mascot';
  primary.setAttribute('aria-hidden', 'true');
  primary.innerHTML = gender === 'buck' ? BUCK_SVG : PENNY_SVG;
  mascotRow.appendChild(primary);

  if (hasPartner) {
    const partner = document.createElement('div');
    partner.className = 'celebration-mascot celebration-mascot--offset';
    partner.setAttribute('aria-hidden', 'true');
    partner.innerHTML = gender === 'buck' ? PENNY_SVG : BUCK_SVG;
    mascotRow.appendChild(partner);
  }

  panel.appendChild(mascotRow);

  // Kid piglets
  if (kidCount > 0) {
    const kidsEl = document.createElement('div');
    kidsEl.className = 'celebration-kids';
    for (let i = 0; i < Math.min(kidCount, 4); i++) {
      const k = document.createElement('span');
      k.className = 'celebration-kid';
      k.style.animationDelay = `${(i * 0.12).toFixed(2)}s`;
      k.textContent = '🐷';
      kidsEl.appendChild(k);
    }
    panel.appendChild(kidsEl);
  }

  // Message
  const msgEl = document.createElement('p');
  msgEl.className = 'celebration-msg';
  msgEl.textContent = pickLine(gender, name, hasPartner, kidCount > 0);
  panel.appendChild(msgEl);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-primary celebration-btn';
  closeBtn.textContent = gender === 'buck' ? 'Yee-haw! Keep it up! 🤠' : "Let's keep going! 🌻";
  closeBtn.addEventListener('click', () => { clearTimeout(timer); dismissCelebration(overlay); });
  panel.appendChild(closeBtn);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const timer = setTimeout(() => dismissCelebration(overlay), 9000);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { clearTimeout(timer); dismissCelebration(overlay); }
  });
}

// ── All-Debt-Free Celebration ─────────────────────────────────────────────────

const FREEDOM_LINES: Record<MascotGender, { solo: string[]; couple: string[]; family: string[] }> = {
  buck: {
    solo: [
      "COMPLETELY DEBT FREE! {name} is riding off into the clearest sunset this ranch has EVER seen!",
      "Hot dog and hallelujah — {name} just wrangled the LAST debt into the ground! ZERO ACROSS THE BOARD!",
      "Every single balance: ZERO! {name} is king of this range tonight, partner. You earned it!",
    ],
    couple: [
      "Y'all did it TOGETHER! Every last debt lassoed, every balance zeroed — this couple is UNSTOPPABLE!",
      "The barn dance of a LIFETIME! This family just crossed the finish line on ALL their debt. ZERO!",
    ],
    family: [
      "The whole herd — {name}, the missus, and every little piglet — completely, absolutely, TOTALLY debt free!",
      "Greatest day on the ranch! From the biggest bill to the last lil' loan — ALL gone! Family FOREVER free!",
    ],
  },
  penny: {
    solo: [
      "OH MY STARS! Every single debt — GONE! {name} is twirling her way into a completely debt-free life!",
      "Total debt freedom, sugar! {name} paid off every last one. This is your MOMENT — treasure it forever!",
      "Bless your heart and every hard-earned dollar — COMPLETELY DEBT FREE! {name} is absolutely glowing!",
    ],
    couple: [
      "Together you wiped the slate COMPLETELY clean! Every account, every balance — ZERO! Pure Southern magic!",
      "This family crossed the ultimate finish line — together, hand in hand, COMPLETELY debt free. Gorgeous!",
    ],
    family: [
      "The whole family — {name}, her beau, and every precious little piglet — 100% debt free! Simply miraculous!",
      "From the biggest debt to the tiniest bill — ALL gone! This household is free, fabulous, and unstoppable!",
    ],
  },
};

function buildHeavyConfetti(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'confetti-wrap';
  const colors = ['#C9A84C','#FFD700','#2D5A27','#B45309','#7C3AED','#BE185D','#0891B2','#F59E0B','#EF4444','#10B981','#38BDF8','#FCD34D','#F472B6','#A78BFA'];
  for (let i = 0; i < 72; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    const size = 8 + Math.random() * 14;
    p.style.cssText = [
      `left:${(Math.random() * 100).toFixed(1)}%`,
      `width:${size.toFixed(1)}px`,
      `height:${(size * (Math.random() > 0.5 ? 1 : 0.45)).toFixed(1)}px`,
      `background:${colors[Math.floor(Math.random() * colors.length)]}`,
      `animation-delay:${(Math.random() * 3).toFixed(2)}s`,
      `animation-duration:${(1.4 + Math.random() * 2.5).toFixed(2)}s`,
      `border-radius:${Math.random() > 0.4 ? '50%' : '2px'}`,
      `transform:rotate(${Math.floor(Math.random() * 360)}deg)`,
    ].join(';');
    wrap.appendChild(p);
  }
  return wrap;
}

export async function showAllDebtFreeCelebration(): Promise<void> {
  document.getElementById('debt-celebration')?.remove();
  document.getElementById('all-debt-celebration')?.remove();

  await loadConfig();
  const gender: MascotGender = activeConfig?.mascotGender ?? 'buck';
  const name = activeConfig?.mascotName ?? (gender === 'buck' ? 'Buck' : 'Penny');

  const { getMembers } = await import('@/db');
  const members = await getMembers();
  const hasPartner = members.some((m) =>
    (gender === 'buck' && m.avatarType === 'female') ||
    (gender === 'penny' && m.avatarType === 'male'),
  );
  const kidTypes = new Set(['child', 'baby-male', 'baby-female', 'child-male', 'child-female', 'teen-male', 'teen-female']);
  const kidCount = members.filter((m) => kidTypes.has(m.avatarType ?? '')).length;

  const overlay = document.createElement('div');
  overlay.className = 'celebration-overlay celebration-overlay--grand';
  overlay.id = 'all-debt-celebration';

  overlay.appendChild(buildHeavyConfetti());

  const panel = document.createElement('div');
  panel.className = 'celebration-panel celebration-panel--grand';

  const banner = document.createElement('div');
  banner.className = 'celebration-banner celebration-banner--grand';
  banner.innerHTML = '🏆 COMPLETELY DEBT FREE! 🏆';
  panel.appendChild(banner);

  const subtitle = document.createElement('p');
  subtitle.className = 'celebration-card-name';
  subtitle.style.cssText = 'font-size:var(--text-lg);margin-bottom:var(--space-2)';
  subtitle.textContent = 'Every. Last. Balance. ZERO! 🎊';
  panel.appendChild(subtitle);

  // Dancing mascots — always show both if partner exists, offset for party feel
  const mascotRow = document.createElement('div');
  mascotRow.className = 'celebration-mascots celebration-mascots--grand';

  const primary = document.createElement('div');
  primary.className = 'celebration-mascot celebration-mascot--dance';
  primary.setAttribute('aria-hidden', 'true');
  primary.innerHTML = gender === 'buck' ? BUCK_SVG : PENNY_SVG;
  mascotRow.appendChild(primary);

  // Always show both mascots for the grand finale
  const partner = document.createElement('div');
  partner.className = 'celebration-mascot celebration-mascot--offset celebration-mascot--dance';
  partner.setAttribute('aria-hidden', 'true');
  partner.innerHTML = gender === 'buck' ? PENNY_SVG : BUCK_SVG;
  mascotRow.appendChild(partner);

  panel.appendChild(mascotRow);

  // All the kids
  const _showKids = kidCount > 0 || !hasPartner;
  const kidsEl = document.createElement('div');
  kidsEl.className = 'celebration-kids celebration-kids--grand';
  const kidEmojis = ['🐷', '🐽', '🐷', '🐽'];
  for (let i = 0; i < Math.min(Math.max(kidCount, 2), 6); i++) {
    const k = document.createElement('span');
    k.className = 'celebration-kid';
    k.style.animationDelay = `${(i * 0.1).toFixed(2)}s`;
    k.textContent = kidEmojis[i % kidEmojis.length]!;
    kidsEl.appendChild(k);
  }
  panel.appendChild(kidsEl);

  const msgEl = document.createElement('p');
  msgEl.className = 'celebration-msg';
  const set = FREEDOM_LINES[gender];
  const pool = kidCount > 0 ? set.family : hasPartner ? set.couple : set.solo;
  const line = pool[Math.floor(Math.random() * pool.length)]!.replace(/\{name\}/g, name);
  msgEl.textContent = line;
  panel.appendChild(msgEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-primary celebration-btn celebration-btn--grand';
  closeBtn.textContent = gender === 'buck'
    ? '🤠 Ride off into the sunset, debt-free! 🌅'
    : '🌻 Live debt-free and fabulous! 🎊';
  closeBtn.addEventListener('click', () => { clearTimeout(timer); dismissCelebration(overlay); });
  panel.appendChild(closeBtn);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const timer = setTimeout(() => dismissCelebration(overlay), 14000);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { clearTimeout(timer); dismissCelebration(overlay); }
  });
}

let activeConfig: Pick<VaultConfig, 'mascotGender' | 'mascotName'> | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
let isBusy = false;

async function loadConfig(): Promise<void> {
  const result = await browser.storage.local.get('vaultConfig');
  const cfg = result['vaultConfig'] as VaultConfig | undefined;
  if (cfg) {
    activeConfig = { mascotGender: cfg.mascotGender, mascotName: cfg.mascotName };
  }
}

export function invalidateConfig(): void {
  activeConfig = null;
}

export async function showMascot(
  trigger: MascotTrigger,
  substitutions: Record<string, string> = {},
  autoDismissMs = 8000,
  items?: NotifierItem[],
): Promise<void> {
  if (isBusy) return;
  isBusy = true;

  await loadConfig();
  const gender: MascotGender = activeConfig?.mascotGender ?? 'buck';
  const name = activeConfig?.mascotName ?? (gender === 'buck' ? 'Buck' : 'Penny');
  const lines = getLines(trigger, gender, substitutions);

  const rootEl = document.getElementById('mascot-root');
  if (!rootEl) { isBusy = false; return; }

  const { root, stack, figure } = ensureShell(gender);

  // Only one "primary" bubble (briefing/greeting/tip/etc.) exists at a time —
  // replace any that's already showing rather than wiping the whole shared
  // root, which would also tear down any catch-up/alert cards stacked above it.
  stack.querySelector<HTMLElement>(':scope > .mascot-bubble')?.remove();

  const bubble = buildBubble(name, gender, lines, () => dismissPrimary(root), items);
  // Appended last among the stack's children, which keeps it nearest the
  // figure (bottom of the visual stack) regardless of what catch-up/alert
  // cards are already stacked above it.
  stack.appendChild(bubble);
  layoutStack(root);

  // When alert items are shown the figure is decorative — dismiss is handled by
  // the explicit "Git along" button. Disabling pointer events on the figure prevents
  // its idle-animation hit area from overlapping the bubble's bottom edge and
  // accidentally triggering the react/dismiss sequence on item clicks.
  figure.style.pointerEvents = items && items.length > 0 ? 'none' : '';

  if (autoDismissMs > 0) {
    dismissTimer = setTimeout(() => dismissPrimary(root), autoDismissMs);
  }
}

export async function greet(): Promise<void> {
  await showMascot('greeting', {}, 6000);
}

export async function showTip(): Promise<void> {
  if (isBusy) return;
  isBusy = true;

  await loadConfig();
  const gender: MascotGender = activeConfig?.mascotGender ?? 'buck';
  const name = activeConfig?.mascotName ?? (gender === 'buck' ? 'Buck' : 'Penny');
  const lines = getDailyTip(gender);

  const rootEl = document.getElementById('mascot-root');
  if (!rootEl) { isBusy = false; return; }

  const { root, stack } = ensureShell(gender);
  stack.querySelector<HTMLElement>(':scope > .mascot-bubble')?.remove();

  const bubble = buildBubble(name, gender, lines, () => dismissPrimary(root));
  stack.appendChild(bubble);
  layoutStack(root);

  // Tips auto-dismiss after 12 seconds
  dismissTimer = setTimeout(() => dismissPrimary(root), 12000);
}

// Ensures the single shared #mascot-root shell exists: a `.mascot-stack-cards`
// wrapper (holding the primary bubble and/or any catch-up/alert cards) and a
// `.mascot-figure` anchored at the bottom. Reused across calls so multiple
// independent producers (the daily/briefing bubble, the catch-up queue, etc.)
// stack together above one mascot instead of each building its own
// competing overlay at the same fixed screen position.
function ensureShell(gender: MascotGender): { root: HTMLElement; stack: HTMLElement; figure: HTMLElement } {
  const root = document.getElementById('mascot-root')!;

  // A programmatic summon (a payment alert firing, a reminder, etc.) should
  // supersede the "dismissed, door showing" state rather than stack oddly
  // alongside it.
  root.querySelector<HTMLElement>(':scope > .mascot-door')?.remove();

  let stack = root.querySelector<HTMLElement>(':scope > .mascot-stack-cards');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'mascot-stack-cards';
    root.appendChild(stack);
  }

  let figure = root.querySelector<HTMLElement>(':scope > .mascot-figure');
  if (!figure) {
    figure = buildFigure(gender, () => dismissPrimary(root));
    root.appendChild(figure);

    // Guard on animationName so a bubbled child-element animationend doesn't
    // trigger idle prematurely before mosey-in has actually finished.
    const fig = figure;
    const onMoseyInEnd = (e: AnimationEvent) => {
      if (e.animationName !== 'mosey-in') return;
      fig.removeEventListener('animationend', onMoseyInEnd);
      if (!fig.classList.contains('leaving')) fig.classList.add('idle');
    };
    figure.addEventListener('animationend', onMoseyInEnd);
  }

  return { root, stack, figure };
}

// Pixel values matching mascot.css's var(--space-3) (0.75rem @ a 16px root
// font-size) — the gap this module previously got "for free" from flexbox's
// `gap` property, now reproduced by hand since cards are positioned via
// plain arithmetic instead. If --space-3 ever changes, update this too.
const STACK_GAP_PX = 12;

// Positions every card in the stack via plain `right`/`bottom` offsets
// instead of CSS flex-wrap. Must be called after any mutation that adds,
// removes, or resizes a card (new card inserted, a card removed, or the
// primary bubble's items list changed height) — see call sites. Packs cards
// into columns bottom-up, working backward from the LAST DOM child (which
// is always the primary bubble when one exists, or the most-recently-queued
// catch-up card otherwise) so whatever is nearest the figure never gets
// pushed into an overflow column; only the OLDEST cards (earliest in DOM
// order) spill into an additional column further left once a column's
// height budget (same vh-based budget the old CSS used) is exhausted.
//
// This exists because `flex-direction:column; flex-wrap:wrap-reverse` (the
// original approach) renders correctly in Chromium but not Firefox: a
// wrapped multi-line flex container's intrinsic "auto" width is
// underspecified across engines, and Firefox's version left overflow cards
// positioned outside the container's own box — past the viewport edge and
// unclickable. Plain arithmetic can't diverge between browsers the way a
// browser's own layout algorithm can.
function layoutStack(root: HTMLElement): void {
  const stack = root.querySelector<HTMLElement>(':scope > .mascot-stack-cards');
  if (!stack) return;
  const cards = Array.from(stack.children) as HTMLElement[];
  if (cards.length === 0) return;

  const figure = root.querySelector<HTMLElement>(':scope > .mascot-figure');
  const figureReserve = figure ? figure.offsetHeight + STACK_GAP_PX : 0;
  const maxColumnHeight = window.innerHeight - 180; // matches the old CSS's calc(100vh - 180px)

  // Walk DOM order back-to-front, grouping into columns; unshift keeps each
  // column's own array in original (top-to-bottom) order once built.
  const columns: HTMLElement[][] = [[]];
  let runningHeight = 0;
  for (let i = cards.length - 1; i >= 0; i--) {
    const card = cards[i]!;
    const column = columns[columns.length - 1]!;
    const h = card.offsetHeight;
    const withGap = h + (column.length > 0 ? STACK_GAP_PX : 0);
    if (column.length > 0 && runningHeight + withGap > maxColumnHeight) {
      columns.push([card]);
      runningHeight = h;
    } else {
      column.unshift(card);
      runningHeight += withGap;
    }
  }

  // columns[0] is nearest the figure (rightmost); each subsequent column
  // stacks further left.
  let right = 0;
  for (const column of columns) {
    let bottom = figureReserve;
    let columnWidth = 0;
    for (let i = column.length - 1; i >= 0; i--) {
      const card = column[i]!;
      card.style.right = `${right}px`;
      card.style.bottom = `${bottom}px`;
      bottom += card.offsetHeight + STACK_GAP_PX;
      columnWidth = Math.max(columnWidth, card.offsetWidth);
    }
    right += columnWidth + STACK_GAP_PX;
  }
}

// Removes the primary (briefing/greeting/tip/etc.) bubble, if any, and tears
// down the whole shared root only once nothing else — including any pending
// catch-up/alert cards — remains in the stack.
function dismissPrimary(root: HTMLElement): void {
  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }

  const stack = root.querySelector<HTMLElement>(':scope > .mascot-stack-cards');
  const primary = stack?.querySelector<HTMLElement>(':scope > .mascot-bubble');
  primary?.remove();

  const figure = root.querySelector<HTMLElement>(':scope > .mascot-figure');
  if (figure) figure.style.pointerEvents = '';

  isBusy = false;
  layoutStack(root);
  collapseIfEmpty(root);
}

// Tears down the shared figure (with its mosey-out exit animation) once the
// stack holds no more cards of any kind — primary or catch-up/alert — and
// leaves the door behind so the mascot can be brought back without a reload.
function collapseIfEmpty(root: HTMLElement): void {
  const stack = root.querySelector<HTMLElement>(':scope > .mascot-stack-cards');
  if (stack && stack.children.length > 0) return;

  const figure = root.querySelector<HTMLElement>(':scope > .mascot-figure');
  if (!figure) { showDoor(root); return; }

  figure.classList.remove('idle', 'react');
  figure.classList.add('leaving');
  figure.addEventListener('animationend', () => { showDoor(root); }, { once: true });
}

// Called from the router's route-change hook in main.ts. Two cleanups, both
// for the same reason: the door (and, transitively, a bare bubble that would
// otherwise auto-dismiss into one later) is a real, clickable, fixed-position
// element — left in place across navigation it follows the user onto other
// pages and risks sitting on top of unrelated page controls in that same
// corner.
//
// 1. Remove an existing door outright — it has nothing to do with whatever
//    page the user is navigating to.
// 2. A bare greeting/tip bubble (no items) has nothing tied to the page the
//    user is leaving either, so let it go silently rather than risk ITS OWN
//    auto-dismiss timer firing later, on some other page, and leaving a
//    fresh door there instead (this is exactly how Break Glass's "Edit
//    Fields" button got blocked in testing: a stale greeting's 6s
//    auto-dismiss fired while the user had already moved two pages on).
//    Item-bearing bubbles (the daily briefing, catch-up queue) are left
//    untouched — those are explicitly meant to persist across navigation so
//    the user can act on an item from a different page; only the bubble
//    itself is removed if present, any catch-up cards stay and get
//    repositioned.
export function dismissDoor(): void {
  const root = document.getElementById('mascot-root');
  if (!root) return;
  root.querySelector(':scope > .mascot-door')?.remove();

  const stack = root.querySelector<HTMLElement>(':scope > .mascot-stack-cards');
  const primary = stack?.querySelector<HTMLElement>(':scope > .mascot-bubble');
  if (!primary || primary.querySelector('.mascot-items-list')) return;

  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
  primary.remove();
  isBusy = false;
  const figure = root.querySelector<HTMLElement>(':scope > .mascot-figure');
  if (figure) figure.style.pointerEvents = '';

  if (stack && stack.children.length === 0) {
    root.innerHTML = ''; // no door — this was stale, unseen content, not an explicit dismissal
  } else {
    layoutStack(root);
  }
}

// Brings the mascot back out from behind the door. If there's still an
// outstanding, unresolved payment alert (a past-due/due-soon bill or debt
// that was showing in the briefing bubble when it got dismissed — dismissing
// the bubble doesn't resolve what it was warning about), re-shows that same
// briefing with whatever is currently outstanding rather than a blank
// greeting, so dismissing the mascot was never a way to make a real warning
// disappear. Falls through to a plain greeting when nothing is outstanding.
async function reopen(): Promise<void> {
  const { getCurrentAlerts } = await import('@/utils/notifier');
  const alerts = getCurrentAlerts();
  if (alerts.length > 0) {
    await showMascot('briefing', {}, 0, alerts);
  } else {
    await greet();
  }
}

// Replaces the dismissed mascot with a small closed-door button in the same
// corner. Clicking it plays a brief door-open animation, then calls reopen()
// — the only way back in previously was a full page reload, since dismissal
// wiped #mascot-root entirely.
function showDoor(root: HTMLElement): void {
  root.innerHTML = '';

  const door = document.createElement('button');
  door.type = 'button';
  door.className = 'mascot-door';
  door.setAttribute('data-testid', 'mascot-door');
  door.setAttribute('aria-label', 'Bring the mascot back');
  door.title = "Knock, knock — click to bring 'em back out";
  door.innerHTML = DOOR_SVG;

  door.addEventListener('click', () => {
    if (door.classList.contains('opening')) return;
    door.classList.add('opening');
    door.addEventListener('animationend', () => {
      door.remove();
      void reopen();
    }, { once: true });
  });

  root.appendChild(door);
}

function buildFigure(gender: MascotGender, onDismiss: () => void): HTMLElement {
  const fig = document.createElement('div');
  fig.className = 'mascot-figure';
  fig.setAttribute('aria-hidden', 'true');
  fig.innerHTML = gender === 'buck' ? BUCK_SVG : PENNY_SVG;
  fig.addEventListener('click', () => {
    // Click on idle mascot plays react animation then dismisses
    if (fig.classList.contains('idle')) {
      fig.classList.remove('idle');
      fig.classList.add('react');
      fig.addEventListener('animationend', () => onDismiss(), { once: true });
    } else {
      onDismiss();
    }
  });
  return fig;
}

function renderItemsIntoList(list: HTMLElement, items: NotifierItem[]): void {
  list.innerHTML = '';
  items.forEach((item) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = `mascot-item-btn mascot-item-btn--${item.severity}`;
    btn.title = `Go to ${item.label}`;

    const icon = document.createElement('span');
    icon.className = 'mascot-item-icon';
    icon.textContent = [...item.text][0] ?? '';

    const name = document.createElement('span');
    name.className = 'mascot-item-name';
    name.textContent = item.label;

    const statusBadge = document.createElement('span');
    statusBadge.className = `mascot-item-status mascot-item-status--${item.severity}`;
    statusBadge.textContent = item.statusLabel;

    btn.appendChild(icon);
    btn.appendChild(name);
    btn.appendChild(statusBadge);

    if (item.dueDate) {
      const dateEl = document.createElement('span');
      dateEl.className = 'mascot-item-date';
      dateEl.textContent = item.dueDate.toLocaleDateString(userLocale, { month: 'short', day: 'numeric' });
      btn.appendChild(dateEl);
    }

    btn.addEventListener('click', () => {
      if (item.focus) sessionStorage.setItem(item.focus.key, item.focus.id);
      navigate(item.route);
      // Mascot stays visible — user must explicitly dismiss via the "Git along" button.
      // Items auto-remove via updateMascotItems() as alerts are resolved.
    });

    li.appendChild(btn);
    list.appendChild(li);
  });
}

function buildBubble(
  name: string,
  gender: MascotGender,
  lines: string[],
  onClose: () => void,
  items?: NotifierItem[],
): HTMLElement {
  const bubble = document.createElement('div');
  bubble.className = 'mascot-bubble';
  bubble.setAttribute('role', 'status');

  const nameEl = document.createElement('div');
  nameEl.className = 'mascot-bubble-name';
  nameEl.textContent = name;

  const textEl = document.createElement('div');
  textEl.className = 'mascot-bubble-text';
  lines.forEach((l) => {
    const p = document.createElement('p');
    p.textContent = l;
    textEl.appendChild(p);
  });

  bubble.appendChild(nameEl);
  bubble.appendChild(textEl);

  if (items && items.length > 0) {
    const list = document.createElement('ul');
    list.className = 'mascot-items-list';
    renderItemsIntoList(list, items);
    bubble.appendChild(list);
  }

  const gitBtn = document.createElement('button');
  gitBtn.className = 'mascot-git-btn';
  gitBtn.setAttribute('aria-label', 'Dismiss');
  gitBtn.setAttribute('data-testid', 'mascot-git-btn');
  gitBtn.textContent = gender === 'buck' ? 'Git along now! 🤠' : 'Shoo now, sugar! 🌻';
  gitBtn.addEventListener('click', onClose);
  bubble.appendChild(gitBtn);

  return bubble;
}

/** Updates the live mascot bubble's items list in-place without re-animating.
 *  If items is empty, dismisses the mascot (all alerts resolved). */
export function updateMascotItems(items: NotifierItem[]): void {
  const root = document.getElementById('mascot-root');
  if (!root) return;

  const bubble = root.querySelector<HTMLElement>('.mascot-bubble');
  if (!bubble) return;

  if (items.length === 0) {
    dismissPrimary(root);
    return;
  }

  let list = bubble.querySelector<HTMLElement>('.mascot-items-list');
  if (!list) {
    list = document.createElement('ul');
    list.className = 'mascot-items-list';
    const gitBtn = bubble.querySelector('.mascot-git-btn');
    if (gitBtn) bubble.insertBefore(list, gitBtn);
    else bubble.appendChild(list);
  }
  renderItemsIntoList(list, items);
  layoutStack(root);

  const fig = root.querySelector<HTMLElement>('.mascot-figure');
  if (fig) fig.style.pointerEvents = 'none';
}

// ── Bell Notification Overlay ─────────────────────────────────────────────────

const BELL_CANNED: Record<MascotGender, string> = {
  buck: "Pardon the interruption, partner — I've got a note here with your name on it.",
  penny: "A moment of your time, dear — I've been keeping this reminder safe just for you.",
};

const BELL_DISMISS: Record<MascotGender, string> = {
  buck: 'Much obliged — got it! 🤠',
  penny: 'Thank you, sugar — got it! 🌻',
};

export async function showBellNotification(notif: CustomNotification): Promise<void> {
  return new Promise<void>(async (resolve) => {
    try {
      await loadConfig();
      const gender: MascotGender = activeConfig?.mascotGender ?? 'buck';

      playCowbell();

      // Hide the regular mascot root while the toast is visible so they don't overlap
      const mascotRoot = document.getElementById('mascot-root');
      if (mascotRoot) mascotRoot.style.visibility = 'hidden';

      const toast = document.createElement('div');
      toast.className = 'bell-notif-toast';

      // Speech bubble (above the mascot figure, matching the regular mascot layout)
      const bubble = document.createElement('div');
      bubble.className = 'bell-notif-toast-bubble';

      const header = document.createElement('div');
      header.className = 'bell-notif-toast-header';
      const bellEl = document.createElement('span');
      bellEl.className = 'bell-notif-toast-bell';
      bellEl.setAttribute('aria-hidden', 'true');
      bellEl.textContent = '🔔';
      const titleEl = document.createElement('span');
      titleEl.className = 'bell-notif-toast-title';
      titleEl.textContent = notif.label;
      header.appendChild(bellEl);
      header.appendChild(titleEl);
      bubble.appendChild(header);

      const cannedEl = document.createElement('p');
      cannedEl.className = 'bell-notif-toast-canned';
      cannedEl.textContent = BELL_CANNED[gender];
      bubble.appendChild(cannedEl);

      if (notif.customMessage) {
        const customEl = document.createElement('blockquote');
        customEl.className = 'bell-notif-toast-custom';
        customEl.textContent = notif.customMessage;
        bubble.appendChild(customEl);
      }

      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'btn btn-primary bell-notif-toast-btn';
      dismissBtn.textContent = BELL_DISMISS[gender];
      bubble.appendChild(dismissBtn);

      // Mascot figure (below the bubble, matching the regular mascot corner layout)
      const figEl = document.createElement('div');
      figEl.className = 'bell-notif-toast-figure';
      figEl.setAttribute('aria-hidden', 'true');
      figEl.innerHTML = gender === 'buck' ? BUCK_SVG : PENNY_SVG;

      toast.appendChild(bubble);
      toast.appendChild(figEl);
      document.body.appendChild(toast);

      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        if (document.body.contains(toast)) toast.remove();
        if (mascotRoot) mascotRoot.style.visibility = '';
        resolve();
      };

      const dismiss = () => {
        toast.classList.add('bell-notif-out');
        // Use setTimeout instead of animationend to avoid race with bubbled
        // animationend events from child animations (e.g. mascot-idle fires every 3.5s)
        setTimeout(finish, 380);
      };

      dismissBtn.addEventListener('click', dismiss);
    } catch (err) {
      console.error('[FinancialFinger] showBellNotification error:', err);
      resolve(); // Always resolve so the notification queue never stalls
    }
  });
}

// ── Catch-Up Prompts (missed paydays, lapsed debt payments, lapsed bills) ──────

const MISSED_PAYDAY_INTRO: Record<MascotGender, string> = {
  buck:  "Whoa there, partner! Looks like a paycheck slipped through the fence while you were away.",
  penny: "Oh sugar, it seems a payday deposit got away from us while the app was closed!",
};
const MISSED_PAYDAY_YES: Record<MascotGender, string> = {
  buck:  "Round it up! 🤠",
  penny: "Yes, record it! 🌻",
};
const MISSED_PAYDAY_NO: Record<MascotGender, string> = {
  buck:  "Leave it be",
  penny: "No thanks",
};

const LAPSED_DEBT_INTRO: Record<MascotGender, string> = {
  buck:  "Hold on now — looks like a debt payment might've slipped by while the gate was closed.",
  penny: "Oh dear, it seems a debt payment may have gotten away from us while the app was closed!",
};
const LAPSED_DEBT_YES: Record<MascotGender, string> = {
  buck:  "Yep, log it 🤠",
  penny: "Yes, log it 🌻",
};
const LAPSED_DEBT_NO: Record<MascotGender, string> = {
  buck:  "Not yet",
  penny: "Not yet",
};

const LAPSED_EXPENSE_INTRO: Record<MascotGender, string> = {
  buck:  "Whoa there — a bill might've come due while you were away from the ranch.",
  penny: "Oh sugar, it looks like a bill may have come due while the app was closed!",
};
const LAPSED_EXPENSE_YES: Record<MascotGender, string> = {
  buck:  "Yep, log it 🤠",
  penny: "Yes, log it 🌻",
};
const LAPSED_EXPENSE_NO: Record<MascotGender, string> = {
  buck:  "Not yet",
  penny: "Not yet",
};

export type CatchUpItem =
  | { kind: 'payday'; data: MissedPayday }
  | { kind: 'debt-cycle'; data: LapsedDebtCycle }
  | { kind: 'expense-cycle'; data: LapsedExpenseCycle };

export interface CatchUpHandlers {
  recordPayday: (m: MissedPayday) => Promise<void>;
  /** Resolves once the user has finished with the debt payment modal (submit or cancel). */
  confirmDebtCycle: (c: LapsedDebtCycle) => Promise<void>;
  /** Resolves once the user has finished with the expense payment modal (submit or cancel). */
  confirmExpenseCycle: (c: LapsedExpenseCycle) => Promise<void>;
  declineDebtCycle: (c: LapsedDebtCycle) => Promise<void>;
  declineExpenseCycle: (c: LapsedExpenseCycle) => Promise<void>;
}

// Shows every catch-up item as a stacked set of cards above the single
// shared mascot figure (`ensureShell`) — the same root the daily/briefing
// bubble lives in, rather than a competing overlay of its own at the same
// fixed screen position. Catch-up/alert cards are inserted above (never
// below) any already-showing primary bubble, so the daily reminders stay
// nearest the mascot and the lapsed-item cards stack on top of them. Every
// card is independently interactive from the moment it appears — the user
// can work through them in any order, not just nearest-to-mascot first.
// When the stack grows taller than the viewport has room for, `.mascot-stack-cards`
// wraps overflow cards into an additional column to the left (CSS, see
// mascot.css) rather than letting them run off the top of the screen.
// Paydays dismissed this session are stored in sessionStorage (unchanged
// legacy behavior); debt/expense declines are the caller's responsibility to
// persist (via declineDebtCycle/declineExpenseCycle) so they don't resurface
// before the next cycle.
export async function showCatchUpQueue(items: CatchUpItem[], handlers: CatchUpHandlers): Promise<void> {
  const queue = items.filter(
    (item) => item.kind !== 'payday' || !sessionStorage.getItem(`ff-payday-skip-${item.data.correlationId}`),
  );
  if (queue.length === 0) return;

  await loadConfig();
  const gender: MascotGender = activeConfig?.mascotGender ?? 'buck';

  const rootEl = document.getElementById('mascot-root');
  if (!rootEl) return;
  const { root, stack } = ensureShell(gender);

  const primary = stack.querySelector<HTMLElement>(':scope > .mascot-bubble');
  const cards = queue.map((item) => buildCatchUpCard(item, gender));
  cards.forEach(({ el }) => {
    if (primary) stack.insertBefore(el, primary);
    else stack.appendChild(el);
  });
  layoutStack(root);

  await Promise.all(queue.map((item, i) => runCatchUpCard(item, cards[i]!, handlers, root)));
}

interface CatchUpCard {
  el: HTMLElement;
  yesBtn: HTMLButtonElement;
  noBtn: HTMLButtonElement;
}

function buildCatchUpCard(item: CatchUpItem, gender: MascotGender): CatchUpCard {
  const bubble = document.createElement('div');
  bubble.className = 'bell-notif-toast-bubble';
  bubble.setAttribute('data-testid', 'catchup-toast');
  bubble.setAttribute('data-catchup-kind', item.kind);

  const header = document.createElement('div');
  header.className = 'bell-notif-toast-header';
  const iconEl = document.createElement('span');
  iconEl.className = 'bell-notif-toast-bell';
  iconEl.setAttribute('aria-hidden', 'true');
  const titleEl = document.createElement('span');
  titleEl.className = 'bell-notif-toast-title';
  titleEl.setAttribute('data-testid', 'catchup-toast-title');
  header.appendChild(iconEl);
  header.appendChild(titleEl);
  bubble.appendChild(header);

  let introText: string;
  let yesText: string;
  let noText: string;
  let detailText: string;

  if (item.kind === 'payday') {
    iconEl.textContent = '💰';
    titleEl.textContent = 'Missed Payday';
    introText = MISSED_PAYDAY_INTRO[gender];
    yesText = MISSED_PAYDAY_YES[gender];
    noText = MISSED_PAYDAY_NO[gender];
    const dateStr = new Date(item.data.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: 'numeric' });
    detailText = `${item.data.sourceName} — ${fmtCents.format(item.data.amount)} on ${dateStr}`;
  } else if (item.kind === 'debt-cycle') {
    iconEl.textContent = '💳';
    titleEl.textContent = 'Lapsed Debt Payment';
    introText = LAPSED_DEBT_INTRO[gender];
    yesText = LAPSED_DEBT_YES[gender];
    noText = LAPSED_DEBT_NO[gender];
    const dateStr = new Date(item.data.dueDate).toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: 'numeric' });
    detailText = `${item.data.accountName} — due ${dateStr}`;
  } else {
    iconEl.textContent = '🧾';
    titleEl.textContent = 'Lapsed Bill';
    introText = LAPSED_EXPENSE_INTRO[gender];
    yesText = LAPSED_EXPENSE_YES[gender];
    noText = LAPSED_EXPENSE_NO[gender];
    const dateStr = new Date(item.data.dueDate).toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: 'numeric' });
    detailText = `${item.data.description} — due ${dateStr}`;
  }

  const introEl = document.createElement('p');
  introEl.className = 'bell-notif-toast-canned';
  introEl.textContent = introText;
  bubble.appendChild(introEl);

  const detailEl = document.createElement('blockquote');
  detailEl.className = 'bell-notif-toast-custom';
  detailEl.setAttribute('data-testid', 'catchup-toast-detail');
  detailEl.textContent = detailText;
  bubble.appendChild(detailEl);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:var(--space-3);margin-top:var(--space-2)';

  const yesBtn = document.createElement('button');
  yesBtn.className = 'btn btn-primary bell-notif-toast-btn';
  yesBtn.style.flex = '1';
  yesBtn.textContent = yesText;
  yesBtn.setAttribute('data-testid', 'catchup-toast-yes');

  const noBtn = document.createElement('button');
  noBtn.className = 'btn btn-secondary bell-notif-toast-btn';
  noBtn.style.flex = '1';
  noBtn.textContent = noText;
  noBtn.setAttribute('data-testid', 'catchup-toast-no');

  btnRow.appendChild(yesBtn);
  btnRow.appendChild(noBtn);
  bubble.appendChild(btnRow);

  return { el: bubble, yesBtn, noBtn };
}

function runCatchUpCard(item: CatchUpItem, card: CatchUpCard, handlers: CatchUpHandlers, root: HTMLElement): Promise<void> {
  const { el, yesBtn, noBtn } = card;
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      el.classList.add('bell-notif-card--out');
      setTimeout(() => {
        el.remove();
        layoutStack(root);
        collapseIfEmpty(root);
        resolve();
      }, 300);
    };

    yesBtn.addEventListener('click', async () => {
      yesBtn.disabled = true;
      noBtn.disabled  = true;
      try {
        if (item.kind === 'payday') await handlers.recordPayday(item.data);
        else if (item.kind === 'debt-cycle') await handlers.confirmDebtCycle(item.data);
        else await handlers.confirmExpenseCycle(item.data);
      } catch (err) {
        showToast('Something went wrong recording that — you can still log it manually from its page.', 'error', 8000);
        console.error('[FinancialFinger] catch-up record failed:', err);
      }
      finish();
    });

    noBtn.addEventListener('click', async () => {
      noBtn.disabled  = true;
      yesBtn.disabled = true;
      if (item.kind === 'payday') {
        sessionStorage.setItem(`ff-payday-skip-${item.data.correlationId}`, '1');
      } else if (item.kind === 'debt-cycle') {
        await handlers.declineDebtCycle(item.data);
      } else {
        await handlers.declineExpenseCycle(item.data);
      }
      finish();
    });
  });
}

