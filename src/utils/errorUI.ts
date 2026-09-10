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
