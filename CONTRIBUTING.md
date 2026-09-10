# Contributing to Financial Finger

Thanks for wanting to contribute. This doc covers everything a developer needs: environment setup, build commands, test conventions, CI pipeline, and architecture. For AI-assisted development context, see [CLAUDE.md](CLAUDE.md).

---

## Environment setup

```bash
git clone <repo-url>
cd finance-finger
npm install                               # installs deps + wires Husky pre-commit hooks
npx playwright install chromium firefox   # one-time: managed browser binaries for E2E
npm run build                             # verify the build works before making changes
```

**Node version:** `.nvmrc` pins Node 20 (LTS). Run `nvm use` or `fnm use` if you have a version manager.

**Pre-commit hooks:** `npm install` triggers the `prepare` script which calls Husky. After that, `git commit` automatically runs `npx lint-staged` → ESLint over staged `src/**/*.ts`. If ESLint fails, the commit is rejected — fix the lint error, or use `--no-verify` only when you have a good reason and intend to let CI enforce it instead. The hook lives in `.husky/pre-commit`.

**Without `npm install`:** Contributors who only have Git (no Node/npm) will not have Husky activated. CI still enforces lint and tests on every push/PR.

---

## Commands

```bash
npm run setup              # full pipeline: lint → unit → Chrome build + E2E → Firefox build + E2E → screenshot refresh
npm run build              # Chrome + Firefox builds (no tests)
npm run build:chrome       # → dist/chrome/
npm run build:firefox      # → dist/firefox/
npm run lint               # ESLint over src/
npm run test               # Vitest unit tests (run once)
npm run test:watch         # Vitest in watch mode
npm run coverage           # unit tests with V8 coverage report → coverage/index.html
npm run test:e2e           # Playwright E2E — Chrome (requires dist/chrome/ build)
npm run test:e2e:firefox   # Playwright E2E — Firefox (requires dist/firefox/ build)
npm run test:e2e:ui        # Playwright interactive UI mode (time-travel debugger)
npm run test:e2e:report    # Open HTML report from last run
npm run docs               # regenerate docs/data-model.md from src/types/index.ts
npm run docs:screenshots   # copy curated E2E screenshots → docs/screenshots/
npm run changelog          # draft CHANGELOG entry from git log → stdout
```

---

## Loading the extension locally

**Chrome / Chromium:**

1. `npm run build:chrome`
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select `dist/chrome/`

Reload the extension manually in `chrome://extensions` after each build. Or use watch mode:

```bash
npm run build:chrome -- --watch   # rebuilds on every file save
```

**Firefox:**

1. `npm run build:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** → select `dist/firefox/manifest.json`

Or use `web-ext` for live reload:

```bash
npm run build:firefox
npx web-ext run -s dist/firefox --target firefox-desktop
```

---

## Testing

### E2E tests (Playwright)

Financial Finger uses Playwright for end-to-end tests that load the **actual built extension** into a real Chromium or Firefox process. There is no mocking — tests interact with the live UI from the outside.

Each spec file gets its own isolated extension context (fresh Chromium process, temporary user data directory). Tests run sequentially with one worker because they are **cumulative within a file** — each test builds on state left by the previous. Do not reorder tests within a file. Do not run a single test in isolation without reading the setup context above it.

Every meaningful step takes a screenshot saved to `tests/screenshots/`. Video and traces are retained on failure.

> **Always build before running E2E tests.** Tests load from `dist/chrome/` or `dist/firefox/`.

```bash
npm run build:chrome
npm run test:e2e

# Single spec:
npx playwright test tests/e2e/09-expense-thresholds.spec.ts

# Firefox:
npm run build:firefox
npm run test:e2e:firefox
```

On Windows (PowerShell), set env vars inline:

```powershell
$env:BROWSER='firefox'; npm run test:e2e
```

**Spec coverage:**

| Spec | Coverage |
|---|---|
| `01-setup.spec.ts` | Six-step setup wizard, key generation, vault creation |
| `02-income.spec.ts` | Members add/remove, income source add/edit/delete, frequency options |
| `03-expenses.spec.ts` | Category CRUD, expense add/edit/delete, filters, monthly total |
| `03b-expense-bills.spec.ts` | Recurring bills with due days, payment status badges, Mark Paid modal, dashboard reminders card |
| `04-debt.spec.ts` | Debt account CRUD, amortization, strategy tabs, what-if grid, celebration overlay |
| `04b-debt-payments.spec.ts` | Payment recording, history display, balance updates |
| `04c-debt-charges.spec.ts` | Card charge add/edit/delete, charge list |
| `04d-debt-payment-status.spec.ts` | Due-soon and past-due badge logic on debt accounts |
| `05-dashboard.spec.ts` | Summary stats, income panel, reminders card, mascot greeting and briefing |
| `06-export-import.spec.ts` | Encrypted vault export and import round-trip |
| `07-settings.spec.ts` | Household name update, member add/remove |
| `08-budget.spec.ts` | Empty state, income stat, expense stat, surplus math, chart cards |
| `09-expense-thresholds.spec.ts` | Threshold field, badge, overage warning, mascot expense-trend alert |
| `10-bill-calendar.spec.ts` | Bill chips on correct day, status colors, month navigation, summary bar |
| `10b-calendar-paydays.spec.ts` | Payday reference date, 💰 chips at correct frequency |
| `11-budget-buckets.spec.ts` | Bucket fill %, to-assign counter, unbudgeted pills, bucket editor |
| `12-debt-milestones.spec.ts` | Milestone timeline, payoff dates, debt-freedom banner, DTI chip |
| `13-settings-currency.spec.ts` | Currency picker, symbol persists across navigation |
| `14-dashboard-reminders.spec.ts` | Sort order, row-click navigation |
| `15-reports.spec.ts` | Reports page, Leaky Bucket chart, scrubber, day label |
| `16-form-validation.spec.ts` | Enter key submit, multi-field error list |
| `17-expense-card-link.spec.ts` | Expense-to-card charge linking, auto-charge creation, sync on edit/delete |
| `18-category-edit.spec.ts` | Category rename, color change, budget clear, duplicate name validation |
| `19-expense-payments.spec.ts` | Fixed-amount pre-fill, auto-pay badge, variable bill flow |
| `20-accounts.spec.ts` | Bank accounts CRUD, balance projection, month navigation, Income by Account card |
| `21-no-accounts-hints.spec.ts` | Inline "no bank accounts / no credit cards" hints with nav links |
| `22-dashboard-card-conditions.spec.ts` | Income by Account card conditional rendering |
| `23-income-pay-type.spec.ts` | Salary vs. hourly inputs, rate × hours preview, semi-monthly schedule |
| `24-calendar-income.spec.ts` | One-time income chips, semi-monthly unequal paychecks |
| `25-accounts-balance.spec.ts` | Starting balance, derived balance, month navigation |
| `26-expense-payment-display.spec.ts` | Actual-amount row, under/over threshold sub-labels, edit payment flow |
| `27-break-glass.spec.ts` | Warning overlay, data browser, FK navigation, orphan scanner, delete, refresh |
| `28-custom-reminders.spec.ts` | Reminders section in create/edit forms, reminders in Settings |
| `29-bill-ledger-and-stale.spec.ts` | Billing cycle pills, catch-up checkbox, ledger edit/delete cascade, stale status, Break Glass scanner auto-run |

### Unit tests (Vitest)

Pure business-logic modules have Vitest unit tests that run in Node — no browser, no IndexedDB, no extension context:

| File | What's tested |
|---|---|
| `src/engine/amortize.test.ts` | `amortizeSingleCard`, `amortizeMultiCard` (avalanche/snowball/rollover), `detectMinimumPaymentTrap`, `comparePayoffScenarios` |
| `src/utils/billStatus.test.ts` | `computeBillStatus` (paid/due-soon/past-due/ok), `computeNextDue` |
| `src/utils/paymentStatus.test.ts` | `computeMinPayment` (fixed/percentage/floor), `computePaymentStatus` |
| `src/utils/paydays.test.ts` | `getPaydaysInMonth` (monthly/biweekly/weekly/semimonthly) |
| `src/utils/finance.test.ts` | `toMonthly`, `sourceMonthly`, `MONTHLY_FACTORS` exact fractions |
| `src/utils/escapeHtml.test.ts` | XSS escape characters, payload, empty string, double-encoding prevention |
| `src/utils/csvParser.test.ts` | CSV parsing, delimiter detection, quote handling, amount/date formats |
| `src/utils/importManager.test.ts` | Import deduplication, transaction matching |
| `src/utils/importRules.test.ts` | Auto-manage rule application |
| `src/utils/importSuggest.test.ts` | Keyword inference, existing-record match scoring |

```bash
npm run test          # run once
npm run test:watch    # watch mode
npm run coverage      # coverage report → coverage/index.html
```

Coverage thresholds (enforced for `src/engine/**` and `src/utils/**`): lines 70%, functions 70%, branches 60%.

---

## CI / CD

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push to `main`, every pull request, and version tags (`v*.*.*`).

```
lint ──────────────────────────────────────────────────────────────────────────┐
unit ──────────────────────────────────────────────────────────────────────────┤
build-chrome ──────────────────────────────────────────────────────────────────┤
build-firefox ─────────────────────────────────────────────────────────────────┤  → e2e-chrome → package
e2e-chrome ────────────────────────────────────────────────────────────────────┤  → e2e-firefox → package
e2e-firefox ───────────────────────────────────────────────────────────────────┘
docs ──────────────────────────────────────────────────────────────────────────→ package
                                                                                   ↓
                                                                              attest (tags)
                                                                                   ↓
                                                                              release (tags)
```

| Job | Needs | What it does |
|---|---|---|
| **lint** | — | `npm run lint` |
| **unit** | — | `npm test` (Vitest) |
| **build-chrome** | lint | `npm run build:chrome`; uploads `dist-chrome` artifact |
| **build-firefox** | lint | `npm run build:firefox`; uploads `dist-firefox` artifact |
| **e2e-chrome** | build-chrome | Downloads `dist-chrome`, installs Playwright Chromium, runs `npm run test:e2e` |
| **e2e-firefox** | build-firefox | Downloads `dist-firefox`, installs Playwright Firefox, runs `npm run test:e2e:firefox` |
| **docs** | — | Runs `npm run docs` and fails if `docs/data-model.md` is stale |
| **package** | lint + unit + e2e-chrome + e2e-firefox + docs | Zips both dist artifacts; names them `financial-finger-{version}-chrome.zip` / `…-firefox.zip` |
| **attest** | package (tags only) | SLSA Build Level 2 provenance via `actions/attest-build-provenance@v2` |
| **release** | attest (tags only) | Creates a GitHub Release; marks pre-release if tag contains a hyphen |

**Creating a release:**

```bash
git tag v1.0.0
git push origin v1.0.0
```

**Verifying a release zip's provenance:**

```bash
gh attestation verify financial-finger-1.0.0-chrome.zip \
  --repo sormondocom/finance-finger
```

**Test artifacts on failure:** the workflow uploads `playwright-report-chrome` / `playwright-report-firefox` (HTML report, 30 days) and `playwright-screenshots-chrome` / `playwright-screenshots-firefox` (14 days) — download these from the workflow run's Artifacts section.

**Dependabot** runs weekly npm updates grouped by tool (playwright, vite, eslint, vitest).

---

## Architecture

### Why a browser extension?

The browser is the most widely deployed cross-platform runtime available. A browser extension runs identically on Windows, macOS, Linux, and ChromeOS with no separate OS builds, no platform-specific installers, and no code-signing required for local development. It is also the only platform choice that provides:

- **Structural sandboxing** — permissions declared in `manifest.json` are enforced by the browser, not the application code. Financial Finger declares `storage` and nothing else. It cannot make arbitrary network requests, cannot access other tabs, cannot read the filesystem.
- **Local persistence without a server** — IndexedDB is a full-featured transactional database built into every browser, never transmitted to a network unless application code explicitly does so.
- **A known, auditable stack** — TypeScript, Vite, and the WebExtension API are widely understood. No Electron (~150 MB runtime), no Rust toolchain, no platform-specific webview integration.

### Extension structure

```
Financial Finger
├── Background service worker    (MV3 — handles toolbar click → opens app tab)
└── Full-page app                (chrome-extension:// tab, hash router, no popup)
```

Clicking the toolbar icon opens `src/app/index.html` as a full-page tab. There is no popup.

### Crypto layer

See [SECURITY.md](SECURITY.md) for the complete crypto model, threat model, and "what is and isn't encrypted" table.

**Quick summary:**

```
Setup wizard
  └─ generateKeyPair()          ECC curve25519 via OpenPGP.js v6
       ├─ publicKeyArmored  →   stored in chrome.storage.local (VaultConfig)
       └─ privateKeyArmored →   shown once; user stores offsite

On unlock
  └─ openVault(encryptedVaultKey, privateKey, passphrase)
       └─ decryptWithPrivateKey()   OpenPGP.js decrypts the armored vault key
            └─ AES-256-GCM CryptoKey   held in module-level memory only

Every DB write
  └─ encryptRecord(plaintext)   → EncryptedRecord { iv: number[], data: number[] }

Every DB read
  └─ decryptRecord<T>(record)   → typed domain object
```

The vault key is a random 32-byte `CryptoKey` (`extractable: false`) generated at setup, encrypted to the user's PGP public key, stored as `VaultConfig.encryptedVaultKey`. It is never persisted in plaintext — it only exists in memory while the vault is unlocked.

### Data layer

All financial records are stored in IndexedDB via [`idb`](https://github.com/jakearchibald/idb) with a typed schema. Every value is an `EncryptedRecord` — the raw domain object is never written to disk. See the auto-generated [Data Model](docs/data-model.md) for the full field reference.

```
IndexedDB: "financial-finger" (v14)
  ├─ members                (key: id)
  ├─ income_sources         (key: id)
  ├─ expense_categories     (key: id)
  ├─ expenses               (key: id)
  ├─ expense_paid_records   (key: id)
  ├─ credit_cards           (key: id)      ← stores all debt account types
  ├─ debt_payments          (key: id)
  ├─ card_charges           (key: id)
  ├─ bank_accounts          (key: id)
  ├─ bank_transactions      (key: id)
  ├─ account_transfers      (key: id)
  ├─ import_records         (key: id)      ← CSV import history for deduplication
  ├─ transaction_rules      (key: id)      ← auto-match rules for repeat imports
  ├─ scenarios              (key: id)
  ├─ calendar_marks         (key: YYYY-MM-DD)
  ├─ calendar_memos         (key: id)
  ├─ notifications          (key: id)
  ├─ snapshots              (key: id, value: RawSnapshot — unencrypted envelope)
  └─ settings               (key: string)
```

Non-sensitive configuration (vault key ciphertext, public key, mascot/theme settings) lives in `chrome.storage.local`.

**Schema migrations** live in `src/db/schema.ts` as cumulative `if (oldVersion < N)` blocks. Current version: **14**. Bump to 15 for the next migration. When adding a new store, also add it to `SNAPSHOT_STORES` in `src/utils/snapshot.ts`.

### Notifier module

`src/utils/notifier.ts` centralizes alert computation and badge updates. It queries the DB for payment and bill status on demand and notifies the mascot system via callback.

- `refreshNotifier()` — re-queries DB, updates the extension icon badge, fires the callback
- `subscribeToAlerts(cb)` — registers a single callback (replaces the previous one)
- `getCurrentAlerts()` — returns the last computed alert list synchronously
- `getOverageTrend(expenseId, threshold)` — counts overages in the last 6 paid records; used to decide whether to fire the expense-trend mascot alert

Icon badge: `!` when any alert exists — red (`#dc2626`) for past-due, amber (`#f59e0b`) for warnings only.

### Amortization engine

`src/engine/amortize.ts` is pure TypeScript with no DOM dependencies.

| Function | Purpose |
|---|---|
| `amortizeSingleCard(card, extra, startDate)` | Full period-by-period schedule for one card |
| `amortizeMultiCard(cards, strategy, extra, startDate)` | Multi-card normalised to monthly; payment rollover on payoff |
| `sortByStrategy(cards, strategy)` | Avalanche / Snowball / Custom ordering |
| `comparePayoffScenarios(cards, strategy, extra)` | Runs min-only vs. with-extra, returns the diff |
| `detectMinimumPaymentTrap(card)` | Flags if >3 years to payoff or interest ratio >50% |

#### Formulas

All calculations use **nominal APR** — the rate printed on the statement and required by disclosure law. This is *not* the Effective Annual Rate (EAR); we use nominal because it matches the rate on the debt agreement.

**Periodic interest rate (single-card)**

```
r = APR / 100 / N
```

where N = periods per year: weekly 52, biweekly 26, semimonthly 24, monthly 12.

**Interest accrued in one period**

```
I = B × r       (B = current balance)
```

**Minimum payment**

```
fixed type:       min(B, fixedAmount)
percentage type:  min(B, max($25 floor, B × pct%))
```

The $25 floor prevents a "always owe $0.37" scenario when percentage minimums drop below a useful amount on small balances.

**Payment per period**

```
payment = min(minPayment + extraPayment,  B + I)   ← capped so you never overpay
```

**Principal reduction**

```
Δ = payment − I
```

If APR is so high that `I > minPayment`, Δ is negative — the amortisation schedule shows this explicitly so the user can see the debt-trap condition rather than hiding it.

**Balance update**

```
B′ = max(0, B − Δ)
```

**Multi-card (`amortizeMultiCard`) — always monthly**

```
r_m = APR / 100 / 12
```

For nominal APR, `(APR/52) × (52/12) = (APR/26) × (26/12) = APR/12`, so the monthly rate is the same regardless of the card's stated payment cycle. No conversion is needed.

Payment rollover: when a card reaches zero its minimum payment is added to the focus card's payment every subsequent month (the avalanche/snowball acceleration effect).

**Minimum-payment trap detection**

A card is flagged as a trap if paying the minimum only results in either:
- more than 3 years to payoff, **or**
- total interest exceeds 50% of the original balance

**Edge-case constants**

| Constant | Value | Purpose |
|---|---|---|
| `MIN_PAYMENT_FLOOR` | $25 | Percentage-minimum floor |
| `MAX_PERIODS` | 1 200 | 100-year safety cap on schedule loops |
| `ZERO_THRESHOLD` | $0.005 | Floating-point "paid off" threshold |

#### Formula change policy

**If you change any formula, you must also:**

1. Update the `// ── Formulas ──` comment block at the top of `src/engine/amortize.ts`
2. Update the "Formulas" section you are reading now in `CONTRIBUTING.md`
3. Update or add unit tests in `src/engine/amortize.test.ts` that cover the changed behaviour

The engine must never be a black box. Every number it produces should be traceable to a formula documented in the source.

### Directory layout

```
src/
├─ app/
│   ├─ index.html          Entry point
│   ├─ main.ts             Boot, theme, nav registration, route wiring
│   ├─ router.ts           Hash router with route-change callback
│   └─ styles/             variables.css, base.css, nav.css
├─ background/
│   └─ index.ts            Service worker — opens app tab on toolbar click
├─ components/
│   └─ Modal.ts            openModal / openFormModal (native <dialog>)
├─ crypto/
│   ├─ pgp.ts              generateKeyPair, encrypt, decrypt, readKeyInfo
│   └─ vault.ts            AES-GCM session key, encryptRecord, decryptRecord
├─ db/
│   ├─ schema.ts           idb typed schema + migrations (v14)
│   └─ index.ts            CRUD functions for all entities
├─ engine/
│   └─ amortize.ts         Pure amortization and trap-detection functions
├─ mascot/
│   ├─ svgs.ts             Inline SVG for Buck and Penny
│   ├─ mascot.css          Mosey-in, idle, react, leaving, celebration animations
│   ├─ messages.ts         Dialogue banks, tip banks, getDailyTip, getLines
│   └─ Mascot.ts           showMascot, updateMascotItems, greet, celebration overlay
├─ pages/
│   ├─ setup/              6-step onboarding wizard
│   ├─ unlock/             Vault unlock screen
│   ├─ dashboard/          Summary stats, reminders card, mascot briefing
│   ├─ income/             Member chips, income source CRUD, pay type, hourly rate
│   ├─ accounts/           Bank account CRUD, balance projection, balance chart
│   ├─ expenses/           Categories, expense list, bill tracking, threshold entry
│   ├─ budget/             Donut chart, category bars, cash flow chart
│   ├─ debt/               Debt CRUD, strategy tabs, amortization, what-if grid
│   ├─ reports/            Date-range analytics, overage offenders
│   ├─ insights/           Financial education with live calculators
│   ├─ afford/             Scenario films — what-if budget overlays
│   ├─ break-glass/        Emergency raw data editor and orphan scanner
│   └─ settings/           Mascot, household, theme, security, export/import
├─ types/
│   └─ index.ts            All domain types (no runtime code)
└─ utils/
    ├─ finance.ts          toMonthly, fmt, fmtCents, CATEGORY_COLORS, MONTHLY_FACTORS
    ├─ billStatus.ts       computeBillStatus — paid / due-soon / past-due logic
    ├─ paymentStatus.ts    computePaymentStatus — debt payment tracking
    ├─ snapshot.ts         restoreSnapshot, SNAPSHOT_STORES
    ├─ escapeHtml.ts       XSS-safe HTML escaping for user content in innerHTML
    ├─ notifier.ts         Alert computation, badge updates, mascot callback
    └─ notificationModal.ts  openAddNotificationModal, buildLinkedRemindersSection
tests/
├─ e2e/                    Playwright spec files (47 files)
└─ helpers/
    ├─ extension.ts        launchExtensionContext — isolated Chromium + extension
    └─ setup-wizard.ts     completeSetupWizard, navigateTo helpers
```

### Build system

| Command | Output |
|---|---|
| `npm run build:chrome` | Chromium MV3 extension → `dist/chrome/` |
| `npm run build:firefox` | Firefox MV3 extension → `dist/firefox/` |
| `npm run build` | Both targets |
| `npm run zip:chrome` | Packages `dist/chrome/` → `artifacts/chrome/` |
| `npm run zip:firefox` | Packages `dist/firefox/` → `artifacts/firefox/` |
| `npm run zip` | Both zips |

`vite.config.ts` handles two build modes (`chrome` / `firefox`). Source maps are development-only.

---

## Dependencies

**Runtime:**

| Package | Purpose |
|---|---|
| `openpgp ^6.1.0` | ECC key generation, PGP encrypt/decrypt |
| `idb ^8.0.0` | Typed IndexedDB wrapper |
| `chart.js ^4.4.4` | Budget donut, spending charts, compound interest visualizer |
| `webextension-polyfill ^0.12.0` | Cross-browser `browser.*` API namespace |

All runtime dependencies are auditable, actively maintained open-source libraries with no telemetry.

**Dev:**

| Package | Purpose |
|---|---|
| `@playwright/test` | E2E test runner |
| `vitest` + `@vitest/coverage-v8` | Unit tests + V8 coverage |
| `vite` + `vite-plugin-web-extension` | Build pipeline |
| `typescript` + `typescript-eslint` | Type checking + linting |
| `web-ext` | Firefox extension packaging and live reload |
| `sharp` | Icon generation |
| `cross-env` | Cross-platform env var setting |
| `husky` + `lint-staged` | Pre-commit hooks |

---

## AI development context

If you are working with Claude Code or another AI assistant, `CLAUDE.md` provides architecture overviews, key conventions, testid prefix tables, migration instructions, and explicit "What NOT to do" guidelines tailored for AI context windows. Read it alongside this document.
