# Changelog

All notable changes to Finance Finger are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions correspond to `manifest.json` / `package.json` version fields.

---

## [Unreleased]

### Added
- ESLint with TypeScript-aware rules (`@typescript-eslint/no-floating-promises`, `no-unused-vars`, `no-explicit-any`, `prefer-const`) — runs in `npm run setup` and CI
- `npm audit --audit-level=high` dependency security check in CI
- Node.js version pinned via `.nvmrc` (Node 20); CI now uses `node-version-file` to prevent silent upgrades
- In-app Help page refactored into 12 section components under `src/pages/help/sections/` — each section is independently editable
- `escapeHtml` utility — all user-controlled strings in `innerHTML` templates are now HTML-escaped (XSS prevention across income, calendar, accounts, expenses, dashboard, and break-glass pages)
- Break Glass audit log — append-only log in `browser.storage.local` (capped at 200 entries) recording every edit and delete with store name, record ID, action, and timestamp
- Break Glass type-to-confirm gate — must type `break glass` before the admin panel unlocks; confirm button is disabled until the exact phrase is entered
- Husky v9 + lint-staged pre-commit hook — ESLint runs on staged `src/**/*.ts` before every commit
- Dependabot weekly npm update configuration — grouped by tool (playwright, vite, eslint, vitest)
- Global `QuotaExceededError` handler — user-facing toast when IndexedDB storage is full
- Vitest coverage thresholds — lines 70%, functions 70%, branches 60% (enforced for `src/engine/**` and `src/utils/**`)
- CLAUDE.md contributor guide — architecture overview, testid prefix table, E2E test structure, migration instructions, financial calculation conventions, "What NOT to do" section
- README: "What is and isn't encrypted" table; FAQ entry for key/passphrase recovery

### Changed
- README data model section updated to reflect schema v13 with all 19 IndexedDB stores (was v5 / 10 stores)
- CI pipeline: lint job added as gate before builds; `package` job depends on lint, unit, e2e, and docs
- CI pipeline: Firefox build now runs in parallel with Chrome build (was gated behind Chrome E2E); `package` job now requires both browser E2E jobs
- Biweekly and weekly monthly frequency factors use exact annual fractions (`26/12` and `52/12`) — eliminates rounding error in budget projections
- Snapshot restore wraps all store operations in a single IDB transaction — eliminates partial-restore state if the browser kills the extension mid-operation
- DB schema bumped to v14 — migration removes dead `by_member`, `by_category`, and `by_date` indexes from existing databases (those fields were never present on encrypted records)
- Debt `dueDay` stored as the day entered (1–31); clamping to the month's last day moved to read time in `billStatus.ts`
- Budget surplus sub-label reads "% of income · recurring expenses only" to clarify the denominator
- README: private key loss warning bolded; Break Glass steps updated for type-to-confirm flow; schema diagram updated to v14

### Fixed
- Floating promise warnings across `main.ts`, `router.ts`, `background/index.ts`, and all page files — fire-and-forget async calls now use the `void` operator
- Removed unused imports (`navigate` in Setup.ts, `fmtCents` in ExpensePaymentModal.ts, `toMonthly` in Income.ts, type imports in ImportWizard.ts)
- Snapshot restore could leave the database in a partially-restored state if the extension was interrupted between clearing one store and clearing the next
- `transaction_rules` store was missing from `SNAPSHOT_STORES` — restoring a snapshot silently wiped all auto-import rules
- Dead IDB indexes (`by_member`, `by_category`, `by_date`) were created on stores whose records only hold `{iv, data}` — the indexed fields never existed, so the indexes wasted space and confused schema inspection
- Break Glass page had two `innerHTML` assignments using user-controlled content (replaced with `textContent` / `replaceChildren`)
- Debt `dueDay` was clamped to 28 at write time, silently corrupting day-29, -30, and -31 entries

---

## [0.5.0] — 2026-08

### Added
- Mass CSV import wizard (Import Wizard) — 4-step flow with row-by-row review, skip/keep controls, and repeat-transaction detection with configurable auto-manage rules
- Configurable bill and payment reminders with notification scheduling
- Data Remedy tools: orphan record scanner with FK navigation links, Break Glass admin panel (full CRUD over all stores)
- Accounts page: bank accounts, balance projection, and transaction history

### Changed
- Calendar cards are clickable — clicking navigates focus to the linked item (debt payment, expense, etc.)
- Dashboard income sources shown with individual breakdowns
- Editable expense categories with expanded color palette
- Budget page bucket chart: categorical expenses shown as filling pails

### Fixed
- Notification badge logic corrected
- Calendar edge cases around payday chips and memo ordering
- Mascot messages for budget overage triggers

---

## [0.2.0] — 2025

### Added
- Calendar view with payday chips and memos
- Debt-to-income ratio display
- Bucket/pail view of categorical expenses on Budget page
- Playwright E2E tests for calendar and new features
- Firefox E2E tests — both Chromium and Firefox run in `npm run setup`

---

## [0.1.0] — 2025

### Added
- Initial release: setup wizard, PGP keypair generation, AES-encrypted IndexedDB vault
- Dashboard with health chips, activity feed, and mascot (Buck / Penny)
- Income page: household members, income sources, frequency and month navigation
- Budget page: summary bar, ledger, charts
- Debt page: debt accounts, payoff strategies (avalanche / snowball), payment tracking, what-if scenarios
- Expenses page: categories, bill tracking, mark-paid flow
- Reports page: date-range charts and debt trend
- Settings: mascot/theme, data sharing (public key exchange), snapshots, vault reset
- GitHub Actions CI pipeline: unit tests, Chrome and Firefox builds, E2E tests, SLSA attestation

[Unreleased]: https://github.com/sormond/finance-finger/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/sormond/finance-finger/releases/tag/v0.5.0
[0.2.0]: https://github.com/sormond/finance-finger/releases/tag/v0.2.0
[0.1.0]: https://github.com/sormond/finance-finger/releases/tag/v0.1.0
