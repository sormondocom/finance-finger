import './errorUI.css';

export function showPageError(
  container: HTMLElement,
  message: string,
  onRetry: () => void,
): void {
  const card = document.createElement('div');
  card.className = 'ff-error-card';
  card.innerHTML = `
    <div class="ff-error-icon">⚠</div>
    <div class="ff-error-body">
      <p class="ff-error-msg">${escapeHtml(message)}</p>
      <button class="btn btn-secondary ff-error-retry" data-testid="error-retry-btn">Try again</button>
    </div>
  `;
  card.querySelector('.ff-error-retry')!.addEventListener('click', () => {
    card.remove();
    onRetry();
  });
  container.innerHTML = '';
  container.appendChild(card);
}

type ToastType = 'success' | 'info' | 'warning' | 'error';

let toastContainer: HTMLElement | null = null;

function getToastContainer(): HTMLElement {
  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'ff-toast-container';
    toastContainer.setAttribute('aria-live', 'polite');
    toastContainer.setAttribute('aria-atomic', 'false');
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast(
  message: string,
  type: ToastType = 'info',
  durationMs = 4000,
): void {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `ff-toast ff-toast--${type}`;
  toast.setAttribute('role', 'status');

  const ICONS: Record<ToastType, string> = { success: '✓', info: 'ℹ', warning: '⚠', error: '✕' };
  toast.innerHTML = `
    <span class="ff-toast-icon" aria-hidden="true">${ICONS[type]}</span>
    <span class="ff-toast-msg">${escapeHtml(message)}</span>
    <button class="ff-toast-close" aria-label="Dismiss">✕</button>
  `;

  const dismiss = () => {
    toast.classList.add('ff-toast--out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  toast.querySelector('.ff-toast-close')!.addEventListener('click', dismiss);
  container.appendChild(toast);
  const timer = setTimeout(dismiss, durationMs);

  toast.addEventListener('mouseenter', () => clearTimeout(timer));
  toast.addEventListener('mouseleave', () => setTimeout(dismiss, 1000));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

// A toast with a list of clickable follow-up actions (e.g. "go to this bill")
// below the message. Unlike showToast(), this never auto-dismisses — it sits
// in the same document.body-level container that survives SPA route changes
// (the router only swaps #app-content), so it persists across navigation
// until the user clicks the close button or one of the action links.
export function showActionableToast(
  message: string,
  type: ToastType,
  actions: ToastAction[],
): void {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `ff-toast ff-toast--${type} ff-toast--actionable`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('data-testid', 'toast-actionable');

  const ICONS: Record<ToastType, string> = { success: '✓', info: 'ℹ', warning: '⚠', error: '✕' };

  const dismiss = (): void => {
    toast.classList.add('ff-toast--out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  const header = document.createElement('div');
  header.className = 'ff-toast-header';

  const icon = document.createElement('span');
  icon.className = 'ff-toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = ICONS[type];

  const msg = document.createElement('span');
  msg.className = 'ff-toast-msg';
  msg.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ff-toast-close';
  closeBtn.setAttribute('aria-label', 'Dismiss');
  closeBtn.setAttribute('data-testid', 'toast-actionable-close');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', dismiss);

  header.appendChild(icon);
  header.appendChild(msg);
  header.appendChild(closeBtn);
  toast.appendChild(header);

  if (actions.length > 0) {
    const list = document.createElement('ul');
    list.className = 'ff-toast-actions';
    actions.forEach((action) => {
      const li = document.createElement('li');
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'ff-toast-action-link';
      link.setAttribute('data-testid', 'toast-actionable-link');
      link.textContent = action.label;
      // Clicking navigates but does NOT dismiss the toast — there may be
      // several items to visit in turn, and the toast is meant to stay put
      // until the user is done with it.
      link.addEventListener('click', () => action.onClick());
      li.appendChild(link);
      list.appendChild(li);
    });
    toast.appendChild(list);
  }

  container.appendChild(toast);
  // Deliberately no setTimeout — this toast only closes via explicit dismissal.
}
