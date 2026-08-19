import './mascot.css';
import browser from 'webextension-polyfill';
import { BUCK_SVG, PENNY_SVG } from './svgs';
import { getLines, getDailyTip } from './messages';
import { navigate } from '@/app/router';
import type { NotifierItem } from '@/utils/notifier';
import type { MascotGender, MascotTrigger, VaultConfig } from '@/types';

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

  const root = document.getElementById('mascot-root');
  if (!root) { isBusy = false; return; }

  root.innerHTML = '';

  const bubble = buildBubble(name, gender, lines, () => dismiss(root), items);
  const figure = buildFigure(gender, () => dismiss(root));

  root.appendChild(bubble);
  root.appendChild(figure);

  // Switch to idle bob after mosey-in completes
  figure.addEventListener('animationend', () => {
    if (!figure.classList.contains('leaving')) {
      figure.classList.add('idle');
    }
  }, { once: true });

  if (autoDismissMs > 0) {
    dismissTimer = setTimeout(() => dismiss(root), autoDismissMs);
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

  const root = document.getElementById('mascot-root');
  if (!root) { isBusy = false; return; }

  root.innerHTML = '';

  const bubble = buildBubble(name, gender, lines, () => dismiss(root));
  const figure = buildFigure(gender, () => dismiss(root));

  root.appendChild(bubble);
  root.appendChild(figure);

  figure.addEventListener('animationend', () => {
    if (!figure.classList.contains('leaving')) figure.classList.add('idle');
  }, { once: true });

  // Tips auto-dismiss after 12 seconds
  dismissTimer = setTimeout(() => dismiss(root), 12000);
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
    btn.className = `mascot-item-link mascot-item-link--${item.severity}`;
    btn.textContent = item.text;
    btn.addEventListener('click', () => navigate(item.route));
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
  textEl.innerHTML = lines.map((l) => `<p>${l}</p>`).join('');

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
    dismiss(root);
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
}

function dismiss(root: HTMLElement): void {
  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }

  const fig = root.querySelector<HTMLElement>('.mascot-figure');
  if (fig) {
    fig.classList.remove('idle', 'react');
    fig.classList.add('leaving');
    fig.addEventListener('animationend', () => { root.innerHTML = ''; isBusy = false; }, { once: true });
  } else {
    root.innerHTML = '';
    isBusy = false;
  }
}
