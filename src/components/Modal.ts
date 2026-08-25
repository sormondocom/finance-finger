import './modal.css';

export interface ModalOptions {
  title: string;
  content: HTMLElement;
  onClose?: () => void;
}

export function openModal(opts: ModalOptions): { close: () => void } {
  const dialog = document.createElement('dialog');
  dialog.className = 'ff-modal';
  dialog.setAttribute('data-testid', 'modal-dialog');

  const header = document.createElement('div');
  header.className = 'modal-header';

  const h2 = document.createElement('h2');
  h2.textContent = opts.title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.setAttribute('data-testid', 'modal-close');
  closeBtn.textContent = '✕';

  header.appendChild(h2);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'modal-body';
  body.appendChild(opts.content);

  dialog.appendChild(header);
  dialog.appendChild(body);
  document.body.appendChild(dialog);
  dialog.showModal();

  const close = () => {
    dialog.close();
    dialog.remove();
    opts.onClose?.();
  };

  closeBtn.addEventListener('click', close);
  dialog.addEventListener('cancel', close);
  dialog.addEventListener('click', (e) => {
    // click on backdrop (dialog element itself, not its children)
    if (e.target === dialog) close();
  });

  return { close };
}

/** Convenience wrapper: modal with a pre-built footer row */
export function openFormModal(opts: {
  title: string;
  body: HTMLElement;
  submitLabel: string;
  onSubmit: (close: () => void) => void | Promise<void>;
  onClose?: () => void;
}): { close: () => void } {
  const wrapper = document.createElement('div');

  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.setAttribute('data-testid', 'modal-cancel');
  cancelBtn.textContent = 'Cancel';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn btn-primary';
  submitBtn.setAttribute('data-testid', 'modal-submit');
  submitBtn.textContent = opts.submitLabel;

  footer.appendChild(cancelBtn);
  footer.appendChild(submitBtn);

  wrapper.appendChild(opts.body);
  wrapper.appendChild(footer);

  const { close } = openModal({ title: opts.title, content: wrapper, ...(opts.onClose ? { onClose: opts.onClose } : {}) });

  // Enter on the last visible text-type input triggers submit
  const TEXT_TYPES = new Set(['text', 'email', 'password', 'search', 'number']);
  function isFieldVisible(el: HTMLElement): boolean {
    let node: HTMLElement | null = el;
    while (node && node !== wrapper) {
      if (node.style.display === 'none') return false;
      node = node.parentElement;
    }
    return true;
  }
  wrapper.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLInputElement;
    if (!TEXT_TYPES.has(target.type)) return;
    const visible = Array.from(wrapper.querySelectorAll<HTMLInputElement>('input'))
      .filter(el => TEXT_TYPES.has(el.type) && isFieldVisible(el));
    if (visible.length > 0 && target === visible[visible.length - 1]) {
      e.preventDefault();
      if (!submitBtn.disabled) submitBtn.click();
    }
  });

  cancelBtn.addEventListener('click', close);
  submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    const original = submitBtn.textContent;
    submitBtn.innerHTML = '<span class="spinner"></span>';
    try {
      await opts.onSubmit(close);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = original;
    }
  });

  return { close };
}
