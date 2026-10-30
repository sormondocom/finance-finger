import { openModal } from '@/components/Modal';

export interface ConfirmDialogOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When false, styles the confirm button as primary instead of danger. Default: true. */
  danger?: boolean;
}

/**
 * Promise-based in-extension confirm dialog. Resolves `true` when the user
 * clicks confirm, `false` when they cancel or close.
 */
export function openConfirmDialog(opts: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const content = document.createElement('div');
    content.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-5)';

    const msg = document.createElement('p');
    msg.className = 'text-sm';
    // pre-line (not the default normal): a multi-line message built with
    // embedded '\n's — e.g. a bulleted account list — otherwise collapses
    // to one long line, since HTML whitespace collapsing doesn't care that
    // the newlines are really there in the text content.
    msg.style.cssText = 'margin:0;white-space:pre-line';
    msg.textContent = opts.message;
    content.appendChild(msg);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.setAttribute('data-testid', 'confirm-cancel');
    cancelBtn.textContent = opts.cancelLabel ?? 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = `btn ${opts.danger !== false ? 'btn-danger' : 'btn-primary'}`;
    confirmBtn.setAttribute('data-testid', 'confirm-ok');
    confirmBtn.textContent = opts.confirmLabel ?? 'Delete';

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    content.appendChild(footer);

    const { close } = openModal({
      title: opts.title ?? 'Confirm',
      content,
      backdropClose: false,
    });

    cancelBtn.addEventListener('click', () => { close(); resolve(false); });
    confirmBtn.addEventListener('click', () => { close(); resolve(true); });
  });
}
