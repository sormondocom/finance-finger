export interface FormErrorHandle {
  element: HTMLElement;
  show(msg: string): void;
  hide(): void;
  showMissing(fields: string[]): void;
}

/**
 * Creates a hidden error element. Call `.show(msg)` to display it and `.hide()` to clear it.
 * Use `.showMissing(fields)` for the standard "Field X is required" / "Fill in: X, Y" pattern.
 */
export function createFormError(): FormErrorHandle {
  const el = document.createElement('div');
  el.className = 'form-error';
  el.style.display = 'none';

  return {
    element: el,
    show(msg: string) { el.textContent = msg; el.style.display = 'block'; },
    hide()            { el.style.display = 'none'; el.textContent = ''; },
    showMissing(fields: string[]) {
      if (fields.length === 0) return;
      const msg = fields.length === 1
        ? `${fields[0]} is required.`
        : `Fill in all required fields: ${fields.join(', ')}.`;
      el.textContent = msg;
      el.style.display = 'block';
    },
  };
}
