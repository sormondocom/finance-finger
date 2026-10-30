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
- "Reset All to $0" bulk button in Settings → Reconciliation — resets every debt or bank account in a group to $0 in one confirmation, instead of one account at a time, via the same reconciliation mechanism (and same required-memo audit trail) as the existing per-account control
- "Reset All" bulk button in Settings → Danger Zone → Reset Account History — wipes transaction history for every debt or bank account in a group at once, restarting each at a $0 balance, guarded by an in-app modal requiring a typed confirmation phrase naming the whole group

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
- Mascot door now persists across every page instead of being cleared on each navigation — it had only ever offered re-summon on the single page it first appeared on. The one deliberate exception is Settings → Break Glass, whose own controls share the mascot's fixed bottom-right corner (the door is hidden there instead of lost, and reappears exactly as it was on leaving)
- Settings → Danger Zone → Reset Account History confirmation no longer uses a native browser `prompt()` (which visually truncates/collapses long multi-line text) — replaced with an in-app modal, consistent with the rest of the app's confirmations, listing every affected account as a real list
- `ConfirmDialog`'s message text now preserves line breaks (`white-space: pre-line`) — a multi-line message built from several lines (e.g. a bulleted account list) previously collapsed into one run-on line, since HTML's default whitespace handling doesn't care that the newlines are really there in the text
- Dark theme: status colors (paid / past-due / due-soon / payday), the Accounts page's ownership/type badges, the Ledger's "good" amount color, and several headings previously colored with the raw brand navy now each have a dark-mode-specific value — only the surface tokens (`--color-bg`, `--color-text`, etc.) had dark-mode overrides before, so these either blended into the dark background or were only a few points above transparent

### Fixed
- Floating promise warnings across `main.ts`, `router.ts`, `background/index.ts`, and all page files — fire-and-forget async calls now use the `void` operator
- Removed unused imports (`navigate` in Setup.ts, `fmtCents` in ExpensePaymentModal.ts, `toMonthly` in Income.ts, type imports in ImportWizard.ts)
- Snapshot restore could leave the database in a partially-restored state if the extension was interrupted between clearing one store and clearing the next
- `transaction_rules` store was missing from `SNAPSHOT_STORES` — restoring a snapshot silently wiped all auto-import rules
- Dead IDB indexes (`by_member`, `by_category`, `by_date`) were created on stores whose records only hold `{iv, data}` — the indexed fields never existed, so the indexes wasted space and confused schema inspection
- Break Glass page had two `innerHTML` assignments using user-controlled content (replaced with `textContent` / `replaceChildren`)
- Debt `dueDay` was clamped to 28 at write time, silently corrupting day-29, -30, and -31 entries
- A dismissed mascot bubble caught mid-navigation (e.g. the once-per-session daily greeting, clicked away from before its 6s auto-dismiss) was silently cleared with no door left behind — since the greeting is marked "shown" in session storage before it even renders, it never retried, so the mascot was simply gone for the rest of the session on whatever page the user landed on
- `.account-income-item` (the income-source row inside an Accounts card) rendered its label in black regardless of theme — it's a `<button>` with no explicit `color` set anywhere, and browsers don't give buttons the page's text color by default
- `--color-accent`, `--color-success`, and `--color-warning` CSS custom properties wrapped a brand color directly and never got a dark-mode value, the same root cause as several of the dark-theme items above — affected the "Learn" tab/card titles, the unlock screen's greeting, several Debt/Help headings, and Ledger's "good" amounts and dots

---

## [0.7.5] — 2026-10-23

### Added
- **Reopen catch-up** — reopening the extension after any gap now surfaces a single, unified mascot checklist covering missed paydays, lapsed debt payments, and lapsed recurring bills, replacing four previously siloed/narrow mechanisms. Same-day paydays and fixed-amount auto-pay bills are recorded automatically as real ledger entries; debt payments and variable-amount bills are confirmed one at a time (confirming opens the real payment modal, pre-filled with the lapsed cycle's due date)
- One shared `catchUpWindowDays` setting (Settings, default 90 days) covering paydays, auto-pay, debt payments, and bills — replaces the old separate `missedPaydayPromptDays` / `autoPayPromptDays` settings (migrated automatically)
- Declining a lapsed debt/bill cycle persists (`catchUpDeclinedCycles`) so it doesn't re-prompt until a later cycle comes due
- Background stale-reminder notification — a `browser.notifications` nudge once `staleReminderDays` (Settings, default 7) have passed since the extension was last opened, re-nudging periodically while still stale
- Auto-pay recording toast is now persistent and actionable — lists every bill that was recorded with a clickable link to it, instead of a plain count that auto-dismissed after 5 seconds
- **Household pets** — dog (pug) and cat avatar types, addable as household members the same way as a person (Setup wizard or Settings → Members) and assignable to expenses just like a person, so vet bills, food, and grooming show up attributed to them
- **Mascot door** — dismissing the mascot leaves a small closed door behind in the same corner instead of disappearing entirely; clicking it brings the mascot back without a page reload. If a payment alert was still unresolved when the briefing was dismissed, the door restores that same briefing rather than a blank greeting
- Sidebar family logo updated to include the household pug, composed in three rows by depth (parents in back, kids in front of them, the pug in front of the kids)
- README: Cross-Store Search (Query tab), import duplicate-detection warning, setup wizard Keys step, and a Ledger charge example now have screenshots; household pets documented
- In-app Help: new "Bringing the Mascot Back" card on the Dashboard section

### Changed
- Mascot catch-up/alert card stack is now positioned with plain JS arithmetic (`layoutStack()`) instead of CSS `flex-wrap` — see Fixed
- A dismissed mascot's door (and a bare, item-less greeting bubble that hasn't been explicitly dismissed yet) is now cleared on every page navigation, rather than persisting indefinitely — see Fixed. Item-bearing bubbles (the daily briefing, the catch-up queue) are untouched by this and still persist across navigation as before, so the user can act on an alert from a different page
- CLAUDE.md Mascot section rewritten to describe the current stack-positioning and door/navigation-cleanup logic

### Fixed
- `autoRecordAutoPay` only ever checked the *current* billing cycle — a fixed-amount auto-pay bill closed for 3 weeks got exactly one ledger entry instead of three
- `resolveCatchUpWindowStart` used fractional elapsed milliseconds instead of whole calendar days — reopening a few hours after a same-day close could silently exclude anything due "yesterday"
- Missing `javascript:` scheme guard on user-supplied URLs (`isSafeHttpUrl`) before assigning them to anchor `href`s, and a UTC-vs-local date bug in date-input construction (`new Date().toISOString().split('T')[0]` is wrong in the evening west of UTC)
- **Firefox:** catch-up/alert cards could render completely outside the viewport and be unclickable once more than one card needed to overflow into a second column — a wrapped multi-line flex container's intrinsic width is underspecified across engines; Chromium sized the box to fit every column, Firefox sized it to fit only the first and rendered the rest outside it
- A dismissed mascot greeting's own auto-dismiss timer could fire *after* the user had already navigated to a different page, leaving an orphaned re-summon door that could overlap unrelated page controls (observed blocking Break Glass's "Edit Fields" toggle)

---

## [0.6.0] — 2026-09

### Added
- **Double-entry accounting ledger** — every financial mutation (debt payment, card charge, bank debit/credit, transfer, reconciliation) now writes a signed `LedgerEntry` in a dedicated `ledger` IDB store; balances are derived by replaying entries rather than stored directly
- **Ledger page** — money-flow feed grouped by day; shows running balance per account; accessible from the nav
- **Reconciliation** — Settings section with per-account reconciliation; writes a hard-reset `reconciliation` entry that anchors `deriveBalance` to a known figure
- **Payday auto-record** — on each app open, `autoRecordPaydays` auto-records same-day paydays as `bank-credit` ledger entries using a stable `payday-<sourceId>-YYYY-MM-DD` correlation ID (prevents double-posting); missed paydays surface as a pending-prompt list in the dashboard
- **`IAccountingService`** — service interface consolidating all financial mutation methods; pages must route mutations through `accounting.*` rather than calling DB functions directly
- **`deleteDebtAccount`** service method — moves the full cascade (charges, payments, ledger entries, FK unlinks) out of the page layer and into the service
- **`deleteMemberWithCleanup`** utility — consolidates the household-member removal cascade (income sources, bank account unlinks, expense unlinks) used in Income page and Settings
- **`freqInterval`** exported from `src/utils/finance.ts` — eliminates the previously copy-pasted helper in three expense files
- **`ResetAccountParams`**, **`RecordExpensePaymentParams`**, **`UpdateExpensePaymentParams`** added to `src/accounting/index.ts` re-exports
- Unit tests for `paydayDeposits` (14 tests), `pruneSnapshots` (5 tests), and `getOverageTrend` notifier (6 tests)
- Ledger entries included in PGP export/import bundle (`EXPORT_VERSION` bumped to 6)

### Changed
- Bank account deletion now includes `deleteLedgerEntriesForAccount` — ledger history is cleaned up alongside transaction records
- `updateDebtPayment` now writes a matching `bank-debit` delta entry when a payment's bank account side changes — prevents bank balance divergence on edits
- Mascot missed-payday notification uses `fmtCents.format()` (respects user locale/currency) instead of hard-coded `en-US` / `USD`
- `_locale` in `finance.ts` now imports from `locale.ts` instead of re-deriving the same value
- `AffordPage.load()` and `InsightsPage.load()` now catch errors and show `showPageError` rather than silently failing
- README data-sharing export section corrected — exports include the full database (all 20 stores), not just structural records
- SECURITY.md `browser.storage.local` table updated with all current keys: `theme`, `currency`, `pendingPaydayCheck`, `missedPaydayPromptDays`, `accountResetTimestamps`, `breakGlassLog`

### Fixed
- `escapeHtml` applied to user-supplied strings in `DebtCharges.ts`, `DashboardPanels.ts`, `ReportsTrends.ts`, `ImportWizard.ts`, and `BreakGlassPage.ts`
- Ledger entry `createdAt` guard in `Ledger.ts` prevented charge absorptions from appearing until the next page load (sorted by `createdAt`, fallback to `date`)
- Projected balance on Accounts page double-counted income when ledger balance was used instead of `account.balance`
- Past-month projected balance was absent due to an `isPastMonth` gate that should not have applied to the projection calculation
- Zero-balance clean-break entries for debt accounts now correctly clear the displayed balance
- Void event grouping in Ledger feed now handles all reversal entry types
- `deleteExpensePayment` now calls `deleteCharge` (soft-delete) for card-funded expenses, consistent with the debt page

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

[Unreleased]: https://github.com/sormond/finance-finger/compare/v0.7.5...HEAD
[0.7.5]: https://github.com/sormond/finance-finger/compare/v0.6.0...v0.7.5
[0.6.0]: https://github.com/sormond/finance-finger/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/sormond/finance-finger/releases/tag/v0.5.0
[0.2.0]: https://github.com/sormond/finance-finger/releases/tag/v0.2.0
[0.1.0]: https://github.com/sormond/finance-finger/releases/tag/v0.1.0
