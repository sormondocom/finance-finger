# Finance Finger — Claude Code Guide

## Project overview

Finance Finger is a MV3 browser extension (Chrome + Firefox) for offline household budgeting with per-record AES-256-GCM encryption. No server, no account, no telemetry. The user holds the only key.

Stack: Vanilla TypeScript · Vite/esbuild · IndexedDB via `idb` · OpenPGP.js v6 · Playwright E2E · Vitest unit tests.

## Commands

```bash
npm run setup          # full pipeline: lint → unit tests → Chrome build + E2E → Firefox build + E2E → refresh docs/screenshots
npm run build          # Chrome + Firefox builds (no tests)
npm run test           # unit tests only (Vitest)
npm run coverage       # unit tests with coverage report → coverage/index.html
npm run test:e2e       # Chrome E2E (Playwright)
npm run test:e2e:firefox   # Firefox E2E
npm run lint           # ESLint
npm run docs           # regenerate docs/data-model.md from src/types/index.ts
npm run docs:screenshots   # copy curated E2E screenshots → docs/screenshots/
npm run changelog      # draft CHANGELOG entry from git log
```

## Dev environment setup

```bash
git clone <repo-url>
cd finance-finger
npm install                          # installs deps + wires Husky pre-commit hooks
npx playwright install chromium firefox   # one-time: managed browser binaries for E2E
npm run build                        # verify build works before making changes
```

**Node version:** `.nvmrc` pins Node 20. Use `nvm use` or `fnm use` if you have a version manager.

**Pre-commit hooks:** `npm install` triggers the `prepare` script which calls `husky`. After that, `git commit` automatically runs `npx lint-staged` → ESLint over staged `src/**/*.ts` files. The hooks live in `.husky/pre-commit`. If ESLint fails, the commit is rejected — fix the lint error or use `--no-verify` only when you have a good reason and intend to let CI catch it.

**Without `npm install`:** If someone only has Git (no Node/npm), Husky is never activated and pre-commit hooks are silently skipped. CI still enforces lint/tests.

## Architecture

### Crypto layer (`src/crypto/vault.ts`)

- At setup, a random 32-byte AES-256-GCM `CryptoKey` is generated (`extractable: false`) and encrypted to the user's ECC/curve25519 PGP public key via OpenPGP.js. The ciphertext (`encryptedVaultKey`) lives in `browser.storage.local`.
- The private key is **never stored** — the user keeps it in a password manager.
- On unlock: user pastes their private key + passphrase → OpenPGP decrypts the vault key → CryptoKey lives in module-level memory for the session.
- Every IndexedDB record is individually encrypted: `encryptRecord<T>(obj)` → `{iv: number[], data: number[]}`. Each write generates a fresh 12-byte random IV.
- The `snapshots` store outer envelope (id, label, takenAt) is unencrypted; inner record blobs are the same ciphertext as the main stores.

### Data layer (`src/db/`)

- `schema.ts` — IndexedDB schema (currently v14) and upgrade migrations. All stores hold `EncryptedRecord` values.
- `index.ts` — typed get/save/delete functions for every store. All reads decrypt; all writes encrypt.
- Never call IDB directly from pages — always go through `src/db/index.ts`.

### Page conventions

- Each page lives in `src/pages/<name>/`. The main class implements `render(): HTMLElement`.
- Pages are lazy-loaded via dynamic `import()` in `src/app/main.ts`'s `register()` calls.
- Error states: use `showPageError(container, message, onRetry?)` from `src/utils/errorUI.ts`.
- Toast notifications: use `showToast(message, type?, durationMs?)` from the same file.
- Forms open in modals: use `openFormModal({ title, body, onSubmit, onCancel })` from `src/components/Modal.ts`.
- User content injected into `innerHTML` must be escaped with `escapeHtml()` from `src/utils/escapeHtml.ts`. Never interpolate user strings raw into template literals that are assigned to `.innerHTML`.

### Mascot (`src/mascot/`)

- Buck (cowboy pig) or Penny (sunflower pig). Appears bottom-right as a fixed overlay with alert badges.
- `showMascot(alertType)` triggers a specific alert. Per-session suppression uses `sessionStorage` so the mascot doesn't repeat across client-side navigations.

### Background service worker (`src/background/index.ts`)

- Runs auto-snapshots on a browser alarm (every N hours, configurable in Settings).
- Cannot access the vault session key (it lives in the popup's memory). Snapshots read raw encrypted blobs — it never sees plaintext.
- Snapshot failures are written to `browser.storage.local` as `lastSnapshotError` and surfaced as a toast on next app open.

## Key conventions

### testid prefix by page

Every interactive element in E2E tests is identified by `data-testid`. Prefixes are page-scoped:

| Prefix | Page |
|---|---|
| `income-` | Income page elements |
| `income-sf-` | Income source form fields |
| `expense-` | Expenses page |
| `debt-` | Debt page |
| `dp-` | Debt payments subpage |
| `dc-` | Debt card charges subpage |
| `dashboard-` | Dashboard |
| `budget-` | Budget page |
| `bg-` | Break Glass tool |
| `bg-warning-` | Break Glass warning overlay |
| `nav-` | Navigation sidebar links |
| `settings-` | Settings page |
| `modal-` | Shared modal component |
| `snap-` | Snapshots settings section |
| `bills-` | Bill tracking tests |
| `cal-` | Calendar page |

### E2E test structure

- Tests live in `tests/e2e/`. Files are numbered (`01-`, `02-`, …) and run sequentially with **1 worker** (`playwright.config.ts`).
- Tests are **cumulative within each file** — each test builds on state left by the previous. Do not reorder tests within a file.
- `tests/helpers/setup-wizard.ts` has `completeSetupWizard(page)` and `navigateTo(page, route)`.
- Screenshots saved to `tests/screenshots/` are the source for `docs/screenshots/` (curated by `scripts/update-screenshots.js`).

### Financial calculation conventions

- Monthly income factors live in `src/utils/finance.ts` `MONTHLY_FACTORS`. Use **exact fractions** (`26/12` for biweekly, `52/12` for weekly) — never hardcoded rounded decimals.
- `sourceMonthly(source)` handles the semi-monthly unequal-paycheck (`amount2`) case; use this instead of `toMonthly()` for `IncomeSource` objects.
- Budget surplus is calculated from **recurring expenses only**. One-time expenses are intentionally excluded and noted in the UI.
- Debt amortization is in `src/engine/amortize.ts`. APR uses nominal rate (APR/12) — correct for credit cards.
- Money is stored as `number` (float). Display formatting uses `Intl.NumberFormat` via `fmt` and `fmtCents` from `src/utils/finance.ts`.

### Schema migrations

- Migrations are cumulative `if (oldVersion < N)` blocks in `schema.ts`'s `upgrade()` callback.
- The current version is 14. Bump to 15 for your next migration.
- Within `upgrade()`, use `transaction.objectStore(name)` to access existing stores (not `database.createObjectStore()`).
- Cast to `any` only when the TypeScript schema types don't expose what you need (e.g., deleting an index that's no longer in the type).

### Snapshot store list

`SNAPSHOT_STORES` in `src/utils/snapshot.ts` must include every store whose data should survive a snapshot/restore. When you add a new store in a migration, add it here too.

## Build system

- `vite.config.ts` — two build modes: `chrome` (MV3 manifest) and `firefox` (MV2 manifest). Source maps only in development.
- `scripts/setup.js` — the canonical full-build script. Runs: icons → lint → unit tests → Chrome build + E2E → Firefox build + E2E → screenshot refresh.
- TypeScript strict mode is on, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

## What NOT to do

- Don't store the vault session key anywhere persistent. It must die when all extension tabs close.
- Don't write unencrypted financial data to IndexedDB. Every record goes through `encryptRecord()`.
- Don't use `innerHTML` with user-supplied strings. Use `escapeHtml()` or DOM methods.
- Don't add stores to the DB without also adding them to `SNAPSHOT_STORES`.
- Don't hardcode rounded frequency multipliers — use the exact fractions in `MONTHLY_FACTORS`.
