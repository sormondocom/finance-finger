# Finance Finger — Claude Code Guide

## Project overview

Finance Finger is a MV3 browser extension (Chrome + Firefox) for offline household budgeting with per-record AES-256-GCM encryption. No server, no account, no telemetry. The user holds the only key.

Stack: Vanilla TypeScript · Vite/esbuild · IndexedDB via `idb` · OpenPGP.js v6 · Playwright E2E · Vitest unit tests.

## Commands

```bash
npm run setup          # full pipeline: lint → typecheck → unit tests → Chrome build + E2E → Firefox build + E2E → refresh docs/screenshots
npm run build          # Chrome + Firefox builds (no tests)
npm run test           # unit tests only (Vitest)
npm run coverage       # unit tests with coverage report → coverage/index.html
npm run test:e2e       # Chrome E2E (Playwright)
npm run test:e2e:firefox   # Firefox E2E
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit (strict mode enforcement — CI-gated separately from build, since Vite/esbuild don't type-check)
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

- `schema.ts` — IndexedDB schema (currently v15) and upgrade migrations. All stores hold `EncryptedRecord` values.
- `index.ts` — typed get/save/delete functions for every store. All reads decrypt; all writes encrypt.
- Never call IDB directly from pages — always go through `src/db/index.ts`.

### Page conventions

- Each page lives in `src/pages/<name>/`. The main class implements `render(): HTMLElement`.
- Pages are lazy-loaded via dynamic `import()` in `src/app/main.ts`'s `register()` calls.
- Error states: use `showPageError(container, message, onRetry?)` from `src/utils/errorUI.ts`.
- Toast notifications: use `showToast(message, type?, durationMs?)` from the same file. For a toast that needs a list of clickable follow-up links (e.g. "go to this item") and must persist until explicitly dismissed (no auto-dismiss timer), use `showActionableToast(message, type, actions)` instead — both live in a `document.body`-level container the router never touches, so either survives SPA navigation.
- Forms open in modals: use `openFormModal({ title, body, onSubmit, onCancel })` from `src/components/Modal.ts`.
- User content injected into `innerHTML` must be escaped with `escapeHtml()` from `src/utils/escapeHtml.ts`. Never interpolate user strings raw into template literals that are assigned to `.innerHTML`.

### Mascot (`src/mascot/`)

- Buck (cowboy pig) or Penny (sunflower pig). Appears bottom-right as a fixed overlay with alert badges.
- `showMascot(alertType)` triggers a specific alert. Per-session suppression uses `sessionStorage` so the mascot doesn't repeat across client-side navigations.
- **One shared stack, not competing overlays.** `#mascot-root` holds exactly one `.mascot-figure` plus a single `.mascot-stack-cards` container (`ensureShell()` in `Mascot.ts`, created lazily and reused). The daily/briefing bubble (`showMascot`/`showTip`) is always the "primary" card — at most one at a time, appended last so it stays nearest the figure. `showCatchUpQueue`'s payday/debt-cycle/expense-cycle cards are inserted *above* the primary card (closer to the top of the stack), and every card is independently interactive from the moment it's added — there is no "only the nearest card is clickable" ordering requirement; the user can confirm/decline any of them in any order. `dismissPrimary()` removes just the primary card; `collapseIfEmpty()` tears down the shared figure only once the stack holds nothing at all. When the stack grows taller than the viewport allows, `.mascot-stack-cards` (`flex-wrap: wrap-reverse`) spills overflow cards into an additional column to the left instead of running off the top of the screen. `showBellNotification` (custom user reminders) is intentionally the exception — it's a one-off modal-like overlay that still hides `#mascot-root` while shown, unrelated to this stack.

### Background service worker (`src/background/index.ts`)

- Runs auto-snapshots on a browser alarm every 30 minutes (hard-coded; not user-configurable).
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
| `account-` | Accounts page (bank account rows, balance, edit/delete buttons) |
| `ledger-` | Ledger page (search input, entry rows, account filter) |
| `reports-` | Reports page (preset selectors, KPI cards, range label) |
| `scenario-` | Afford / What-If page (scenario cards, toggle) |
| `insights-` | Insights / Learn page (tab selectors) |
| `help-` | Help page (grid, tab selectors) |
| `setup-` | Setup wizard (next/back/enter-app buttons) |
| `unlock-` | Unlock page (key textarea, passphrase input, submit button) |
| `settings-recon-` | Settings – Reconciliation section |
| `catchup-` | Reopen catch-up mascot toast (`src/mascot/Mascot.ts`'s `showCatchUpQueue`) |
| `toast-actionable` | Persistent toast with clickable follow-up links (`src/utils/errorUI.ts`'s `showActionableToast`) |

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
- The current version is 15. Bump to 16 for your next migration.
- Within `upgrade()`, use `transaction.objectStore(name)` to access existing stores (not `database.createObjectStore()`).
- Cast to `any` only when the TypeScript schema types don't expose what you need (e.g., deleting an index that's no longer in the type).

### Reopen catch-up (`src/utils/catchUp.ts`)

`runCatchUp()` runs once per real launch (triggered from `launchApp()` in `src/app/main.ts`, after `getAndStampLastOpenedAt()` reads the *previous* `lastOpenedAt` value and overwrites it). Goal: the ledger ends up complete regardless of how long the extension was closed, not just "an hour or two."

1. **Window resolution** (`src/utils/catchUpWindow.ts`): `resolveCatchUpWindowStart(prevOpenedAt, now, catchUpWindowDays)` computes `min(daysSinceLastOpen, catchUpWindowDays)` in **whole calendar days** (midnight to midnight) — never raw elapsed milliseconds, since a fractional-day gap would mean reopening even a few hours after a same-day close could land the window's lower bound after midnight of "yesterday," silently excluding anything due yesterday. A same-day reopen (0 calendar days apart) still returns today's midnight, not `null` — there's still "today" to check. Returns `null` only on a fresh install or when `catchUpWindowDays` is 0 (catch-up disabled). `catchUpWindowDays` (default 90) is a single shared setting covering paydays, auto-pay, debt payments, and bills — not tunable per-category.
2. **Paydays** (`src/utils/paydayDeposits.ts`, unchanged logic, now parameterized by `windowStart` instead of reading its own setting): same-day paydays auto-record silently; older-but-in-window ones go to the catch-up queue.
3. **Fixed-amount auto-pay bills** (`src/utils/autoPayRecords.ts`): the single most recent overdue cycle is **always** recorded regardless of `windowStart` — this matches the original, pre-catch-up behavior of checking on every launch independent of how long the extension was closed, and must never regress (a `windowStart` that happens to be narrow, e.g. a same-day reopen, must not silently stop a currently-overdue bill from being recorded). `windowStart` only extends how far back *additional older* missed cycles are also backfilled (this used to silently lose history for anything but the single most recent cycle). Each recorded cycle calls `accounting.recordExpensePayment()` with a `correlationId` of the form `expense-cycle-<expenseId>-YYYY-MM-DD`; the anchor is saved once at the end, advanced to the most recent cycle regardless of how many were actually recorded vs. skipped as too old. Variable-amount auto-pay bills are no longer this function's job (see next point).
4. **Debt payments and all other recurring bills** (variable-amount auto-pay *and* plain manually-paid bills): `enumerateLapsedDebtCycles`/`enumerateLapsedExpenseCycles` (`src/utils/debtCatchUp.ts`/`expenseCatchUp.ts`) are pure functions that walk forward cycle-by-cycle (`advanceByCycle`/`computeNextDue`) from the account's/expense's last-known-paid anchor, returning every lapsed cycle in `[windowStart, now)` with no qualifying payment. These are **not** auto-recorded — the amount isn't knowable in advance.
5. **Unified mascot queue** (`src/mascot/Mascot.ts`'s `showCatchUpQueue`/`CatchUpItem`): merges payday + debt-cycle + expense-cycle items into one sequential, one-at-a-time toast queue. "Yes" on a payday records directly; "Yes" on a debt/expense cycle opens the real `openDebtPaymentModal`/`openExpensePaymentModal` (pre-filled via their `defaultDate` option with the cycle's due date, not today) and waits for it to close (`onClose`) before advancing. "Not now" on a debt/expense cycle persists a decline (see below); payday's "No" stays session-only (`sessionStorage`, unchanged).
6. **Decline persistence**: `catchUpDeclinedCycles` (`browser.storage.local`, `Record<correlationId, declinedAt>`) suppresses a specific declined cycle until its due date changes (a later cycle has a different `correlationId`, so it isn't suppressed) — pruned of entries older than 180 days on each write.

The separate "stays continuously open" path (the 60-second poll + day-rollover recheck further down in `main.ts`) intentionally does **not** run the debt/expense enumeration — only the same-day payday/auto-pay recheck, via the same (now bug-fixed) functions. Re-litigating that path's behavior is out of scope for catch-up; the live status badges on the Debt/Expenses pages already cover that case passively while a tab stays open.

A background nudge (`src/background/index.ts`'s `maybeNudgeStaleUser`, piggybacked on the existing 30-min `ff-auto-snapshot` alarm) fires a `browser.notifications` reminder once `staleReminderDays` (default 7) have passed since `lastOpenedAt`, re-nudging every `staleReminderDays` while still stale. Requires the `notifications` manifest permission.

### browser.storage.local key inventory

| Key | Written by | Read by | Purpose |
|---|---|---|---|
| `vaultConfig` | Setup wizard | Unlock page, app boot | Vault setup state and PGP public key |
| `theme` | Settings page | App boot | Quick-access theme color scheme (avoids IDB on startup) |
| `currency` | Settings page | App boot | Quick-access currency code |
| `lastSnapshotError` | Background worker | App open (main.ts) | `{ message, time }` — surfaced as a toast if set |
| `lastOpenedAt` | `main.ts` (`getAndStampLastOpenedAt`) | `catchUp.ts`, background worker | Timestamp of the last real launch — drives the catch-up window and the stale-reminder nudge |
| `catchUpWindowDays` | Settings page | `catchUp.ts` | Max days to look back for missed paydays/bills/debt payments (default 90) — replaces the old `missedPaydayPromptDays`/`autoPayPromptDays` (migrated once, see `catchUp.ts`) |
| `catchUpDeclinedCycles` | `catchUp.ts` (on "Not now") | `catchUp.ts` | `Record<correlationId, declinedAt>` — suppresses a specific declined debt/bill cycle until a later cycle comes due |
| `staleReminderDays` | Settings page | Background worker | Days of inactivity before the "come back" notification fires (default 7) |
| `lastStaleNudgeAt` | Background worker | Background worker | Dedup for the stale-reminder notification — at most one per `staleReminderDays` |
| `accountResetTimestamps` | `resetAccount()` | `paydayDeposits.ts` | `Record<accountId, timestamp>` — gates same-day auto-recording after a history reset |

### Snapshot store list

`SNAPSHOT_STORES` in `src/utils/snapshot.ts` must include every store whose data should survive a snapshot/restore. When you add a new store in a migration, add it here too.

## Build system

- `vite.config.ts` — two build modes: `chrome` (MV3 manifest) and `firefox` (MV3 manifest). Source maps only in development.
- `scripts/setup.js` — the canonical full-build script. Runs: icons → lint → typecheck → unit tests → Chrome build + E2E → Firefox build + E2E → screenshot refresh.
- TypeScript strict mode is on, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

## What NOT to do

- Don't store the vault session key anywhere persistent. It must die when all extension tabs close.
- Don't write unencrypted financial data to IndexedDB. Every record goes through `encryptRecord()`.
- Don't use `innerHTML` with user-supplied strings. Use `escapeHtml()` or DOM methods.
- Don't assign a user-supplied URL (e.g. `account.url`, `expense.url`) to an anchor's `href` without checking `isSafeHttpUrl()` from `src/utils/escapeHtml.ts` first — otherwise a `javascript:` scheme can execute in the extension's context.
- Don't add stores to the DB without also adding them to `SNAPSHOT_STORES`.
- Don't hardcode rounded frequency multipliers — use the exact fractions in `MONTHLY_FACTORS`.
- Don't build a "today"/date-input string with `new Date().toISOString().split('T')[0]` — it converts to UTC and is wrong in the evening for anyone west of UTC. Use `todayDateInput()` / `timestampToDateInput()` from `src/utils/dateInput.ts`.
