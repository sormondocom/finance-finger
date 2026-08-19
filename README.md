# Financial Finger

<p align="center">
  <img src="public/mascots.svg" alt="Buck and Penny on the Dollar Farm" width="420" />
</p>

<p align="center">
  <a href="https://github.com/sormondocom/finance-finger/actions/workflows/ci.yml">
    <img src="https://github.com/sormondocom/finance-finger/actions/workflows/ci.yml/badge.svg" alt="CI" />
  </a>
  &nbsp;
  <a href="https://buymeacoffee.com/sormondocom">
    <img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-%23FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy me a coffee" />
  </a>
</p>

> *Figurin' out your finances — offline, encrypted, and yours.*

A fully offline browser extension for household budgeting, debt management, and financial planning. Every byte of your financial data is encrypted at rest with your own PGP key. Nothing ever leaves your device unencrypted.

---

## Why it exists

Most budgeting tools are cloud services. Your income, debts, and spending habits live on someone else's servers — paid for with advertising or subscription revenue and potentially exposed in breaches. Financial Finger flips that model: your data stays in your browser's local storage, encrypted to a key that only you hold. The extension is the only reader.

---

## Browser support

Financial Finger targets both **Chromium** (Chrome, Edge, Brave, Arc) and **Firefox** as equally supported primary browsers. Both use the MV3 extension format. The `webextension-polyfill` library normalizes the `browser.*` API namespace so the same TypeScript source produces both targets from a single build.

| Browser | Minimum version | Extension format |
|---|---|---|
| Chrome / Chromium | 109+ | MV3 |
| Edge | 109+ | MV3 |
| Firefox | 109+ | MV3 |

Firefox notes: the Firefox build sets `browser_specific_settings.gecko.id` in the manifest. Use `npm run build:firefox` to produce the Firefox-specific output in `dist/firefox/`. The `web-ext` CLI supports live-reload development against Firefox Desktop.

---

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm 9 or later
- Chrome/Chromium 109+ or Firefox 109+

### Install and build

```bash
git clone <repo-url>
cd finance-finger
npm install
npm run build          # builds both Chromium (dist/chrome/) and Firefox (dist/firefox/)
```

Build targets separately:

```bash
npm run build:chrome   # → dist/chrome/
npm run build:firefox  # → dist/firefox/
```

### Load in Chrome / Chromium

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/chrome/` folder

Click the Financial Finger icon in your toolbar to open the app in a dedicated tab.

### Load in Firefox

1. Run `npm run build:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select `dist/firefox/manifest.json`

Or use `web-ext` for live reload during development:

```bash
npm run build:firefox
npx web-ext run -s dist/firefox --target firefox-desktop
```

### Development workflow

Vite's dev server doesn't integrate with the extension loader, so development is a build-and-reload cycle:

```bash
npm run build:chrome -- --watch   # rebuilds on every file save
```

Reload the extension manually in `chrome://extensions` after each build (the Reload button on the extension card). Firefox with `web-ext run` reloads automatically.

---

## First-run setup

The **six-step setup wizard** runs automatically on first launch:

| Step | What happens |
|---|---|
| **Welcome** | Overview of the privacy model |
| **Mascot** | Choose Buck (male pig, cowboy) or Penny (female pig, sunflower hat); optionally rename them |
| **Keys** | Generate a new ECC curve25519 PGP keypair (name, email, passphrase) — or paste an existing armored private key |
| **Save your key** | The private key is shown once; copy it to a password manager or print it for offsite storage. *It is never stored by the extension.* |
| **Profile** | Name your household |
| **Done** | Vault is created; you land on the dashboard |

On subsequent launches the **vault unlock screen** appears. Paste your private key and enter your passphrase to decrypt the session vault key and access your data. The vault stays unlocked for the full browser session; closing all extension tabs re-locks it.

---

## Features

### Household & income

**Household members** — Add named members to your household. Each member can have an avatar type (adult male, adult female, baby, child, teen). Members are used to assign income sources so you can see each person's contribution to household income.

**Income sources** — Each member can have multiple income sources at any frequency: hourly, weekly, biweekly, semi-monthly, monthly, annual, or one-time. Every source is normalized to monthly for all calculations. Sources can be toggled active/inactive without deleting them.

---

### Expenses

**Categories** — Create color-coded expense categories (Housing, Food, Utilities, etc.) to organize your spending. The category color flows through every chart that references it.

**One-time expenses** — Record any single transaction: a new appliance, a vet bill, a vacation. Assigned to a category and optionally to a specific member.

**Recurring expenses** — Mark any expense as recurring and set its frequency. These feed the monthly total calculation and the Budget page. Recurring expenses can optionally carry a **due day** to become tracked bills.

---

### Bill tracking

A recurring expense becomes a **tracked bill** when you set a due day (1–28). Once a bill has a due day, the extension monitors its payment status each month:

| Status | When it shows | Visual |
|---|---|---|
| **Due Soon** | Due day is within 7 days | Amber left border, ⏰ badge |
| **Past Due** | Due day has passed without payment | Red left border, ⚠ badge, pulsing animation |
| **Paid** | Marked paid this calendar month | Green left border, ✓ badge |

**Mark Paid** — The Mark Paid button on a due or overdue bill opens a dialog asking for the **actual amount paid** (pre-filled with the bill's usual amount). This lets variable bills — electricity, water, gas — record what the bill actually was, not just what you expected. Submitting saves a payment record and resets the bill's paid status for the month.

---

### Bill cost thresholds

Any recurring expense can have a **monthly threshold** — the maximum you expect the bill to cost. Set one when you add or edit a recurring expense (the Threshold field appears after checking "recurring").

**When thresholds kick in:**

- **⚡ badge on the expense row** — shows your target amount at a glance alongside the frequency chip
- **Inline overage warning in the Mark Paid dialog** — if you enter an amount above your threshold, the dialog immediately shows "⚠ Over target by $X.XX" so you know before you confirm
- **Common Overage Offenders report** — historical view in the Reports page (see below)
- **Daily briefing** — if a bill has exceeded its threshold 3 or more times in the last 6 months, it surfaces in the mascot's daily briefing as a persistent warning
- **Mascot trend alert** — after you mark a bill paid with an over-threshold amount for the second consecutive time, Buck or Penny pops up with a pointed comment about adjusting your expectations

---

### Budget

The Budget page shows a real-time picture of where your money goes:

- **Summary bar** — total income, total recurring expenses, and surplus/deficit for the month
- **Donut chart** — spending share by category; click a slice to filter the breakdown
- **Category breakdown** — horizontal bars showing each category's monthly total
- **Cash flow bar** — single bar comparing income to total spending

The mascot fires automatically on the Budget page if you are running a deficit (spending exceeds income in the current scenario).

---

### Debt & credit cards

**Card management** — Track any debt account type: credit card, mortgage, medical debt, or personal loan. For each account you can set:
- Current balance, APR, credit limit (cards), original principal and term (mortgages/loans)
- Minimum payment — fixed dollar amount or percentage of balance (with a $25 floor)
- Payment cycle — weekly, biweekly, semi-monthly, or monthly
- Due day — same tracking logic as bill tracking (past-due, due-soon badges)
- Introductory 0% APR end date

**Amortization schedule** — Each card shows a full date-stamped schedule: period, payment, principal, interest split, and remaining balance. The footer summarizes total paid and total interest.

**Payoff strategies** — Three modes:

| Strategy | How it works |
|---|---|
| **Avalanche** | Highest APR first — mathematically fastest and cheapest |
| **Snowball** | Smallest balance first — fastest psychological wins |
| **Custom** | Drag cards into any order |

When a card is paid off, its full minimum payment **rolls over** to the next focus card automatically — no money leaves your budget, it just accelerates the next debt.

**What-if grid** — Enter any extra monthly payment and instantly see months saved and interest avoided across your entire debt stack, compared to paying minimums only.

**Minimum payment trap detector** — Flags any card where paying minimums only would take more than 3 years to pay off, or where interest would exceed 50% of the original balance. When triggered, Buck or Penny slides in with a pointed comment about the math.

**Utilization bars** — Visual color gradient on each card from gold (healthy, under 30%) through rust (warning, 30–89%) to red (over-limit or above 90%).

**Card charges** — Log individual purchases against any card account to track spending at the merchant level. Charges appear in the Reports page as a separate spending category.

**Payment history** — Every payment you record is stored with a date, amount, and type (regular or extra). The Reports page uses this history to reconstruct balance trends over time.

**Debt payoff celebration** — When a card reaches a zero balance, a full-screen overlay triggers with dancing mascots, confetti, and a congratulatory message. Both Buck and Penny dance if you have a household.

---

### Reports

The Reports page provides date-range analytics across your full financial history. Use the preset buttons (This Month, Last 3 Mo., This Year, All Time, etc.) or set a custom date range.

| Report card | What it shows |
|---|---|
| **KPI chips** | Total spending, total income, net cash flow, savings rate (or top spending category if no income is entered) |
| **Spending Over Time** | Stacked bar chart — expenses and card charges by month |
| **By Category** | Donut chart with a ranked table — spending share per category |
| **Top Merchants** | Horizontal bar chart of your biggest card charge destinations |
| **Income vs Spending** | Side-by-side bars per month with net cash flow chips below |
| **Spending by Day** | Which day of the week sees the most spending |
| **Biggest Transactions** | Top 12 individual expenses and card charges |
| **Card Balance Trend** | Reconstructed balance history from your payment records — a rising line signals balance creep |
| **Spending by Week of Month** | Which week of the month costs the most |
| **Recurring vs One-time** | What share of your spending is predictable each month |
| **Common Overage Offenders** | Bills with a cost threshold set — month-by-month actual vs target, seasonal pattern detection |

**Common Overage Offenders** is always all-time data (independent of the date range picker), because seasonal trends need multiple months to be meaningful. Each bill shows a grid of colored month cells: green with ✓ when under target, red with the overage amount when over. Bills with 3+ overages get a 🔥 marker. If a bill has 2+ overages clustering in the same season (summer, winter, spring, or fall), a seasonal pattern callout appears: "☀️ tends to spike in summer — plan ahead."

---

### Mascots: Buck & Penny

Buck (male pig, cowboy aesthetic) and Penny (female pig, sunflower hat) are animated SVG mascots with southern-charm dialogue. They "mosey in" from the right with a bobbing CSS animation and require a **manual dismissal** via the "Git along now! 🤠" / "Shoo now, sugar! 🌻" button at the bottom of their speech bubble. Critical financial alerts never auto-dismiss.

**When the mascots appear:**

| Trigger | When it fires |
|---|---|
| **Greeting** | First time you open the dashboard after setup |
| **Daily tip** | Dashboard — one tip per day, rotating through an 8-tip bank keyed to the day of year |
| **Daily briefing** | Dashboard on load when any debt payment or bill alert exists — shows an itemized, clickable list of everything that needs attention |
| **Payment due** | Any debt account or bill is due within 7 days |
| **Payment overdue** | Any debt payment or bill is past its due date |
| **Expense trend** | You mark a recurring bill paid above its cost threshold for the second consecutive time — the mascot names the bill, the target, and how many times it has gone over |
| **Minimum payment trap** | Opening the Debt page when any card triggers the trap detector |
| **Negative cash flow** | Budget page when total spending exceeds income |
| **Debt-free improvement** | Insights page when the what-if calculator shows meaningful savings from an extra payment |
| **Budget milestone** | Adding a recurring expense of $500 or more |
| **Debt payoff celebration** | Recording a payment that brings a card balance to zero (full-screen overlay) |

**Briefing items are clickable** — each alert in the daily briefing list is a navigation link that takes you directly to the relevant page (Debt or Expenses) while keeping the mascot visible. The left navigation updates immediately on click.

**Live update** — when you pay a bill or record a debt payment, the mascot's item list refreshes automatically. If you clear all outstanding alerts, the mascot dismisses itself.

---

### Settings

- **Mascot** — switch between Buck and Penny; rename your mascot
- **Household name** — updates the dashboard title
- **Members** — add or remove household members; each shows an initial avatar; removing a member also removes their assigned income sources
- **Theme** — Light, Dark, or Auto (follows `prefers-color-scheme`)
- **Security** — PGP fingerprint display and public key export
- **Sharing keys** — store contacts' public keys for future data-sharing features (portability, planned)
- **Export / Import** — back up and restore your encrypted vault data
- **Danger zone** — full vault wipe and IndexedDB reset

---

## Testing

### Approach

Financial Finger uses **Playwright** for end-to-end tests that load the actual built Chromium extension into a real browser. There is no mocking — tests interact with the live extension UI from the outside, the same way a user would.

Each spec file gets its own **isolated extension context**: a fresh Chromium process with a temporary user data directory. This means every file starts from a clean vault with no prior data, and test files cannot interfere with each other. The user data directory is deleted after each suite completes.

Tests run **sequentially within each file** (one worker, `fullyParallel: false`) because they build on each other — you must set up a category before you can add an expense to it, for example. Test files themselves run sequentially as well to avoid resource contention.

Every meaningful step takes a **screenshot**, stored in `tests/screenshots/`. Screenshots are always captured (not just on failure). Video and traces are retained on failure for post-mortem debugging. An HTML report is generated at `tests/playwright-report/` after every run.

### What is covered

| Spec file | Coverage |
|---|---|
| `01-setup.spec.ts` | Six-step setup wizard, key generation, vault creation |
| `02-income.spec.ts` | Members add/remove, income source add/edit/delete, frequency options |
| `03-expenses.spec.ts` | Category CRUD, expense add/edit/delete, filters, monthly total |
| `03b-expense-bills.spec.ts` | Recurring bills with due days, payment status badges (past-due, due-soon, paid), Mark Paid modal, date label, dashboard reminders card |
| `04-debt.spec.ts` | Debt account CRUD, amortization, strategy tabs, what-if grid, utilization bars, celebration overlay |
| `04b-debt-payments.spec.ts` | Payment recording, payment history display, balance updates |
| `04c-debt-charges.spec.ts` | Card charge add/edit/delete, charge list |
| `04d-debt-payment-status.spec.ts` | Due-soon and past-due badge logic on debt accounts |
| `05-dashboard.spec.ts` | Summary stats, income panel, reminders card, mascot greeting and briefing |
| `06-export-import.spec.ts` | Encrypted vault export and import round-trip |
| `07-settings.spec.ts` | Household name update, member add/remove with confirm dialog |
| `08-budget.spec.ts` | Empty state, income stat, expense stat, surplus math, chart cards |
| `09-expense-thresholds.spec.ts` | Threshold field visibility, threshold badge on row, threshold persists through edit, Mark Paid modal flow, inline overage warning, mascot expense-trend alert after repeated overages |

### Running the tests

> **Important:** Tests load the **built** extension from `dist/chrome/`. Always build before running.

```bash
# 1. Build the extension
npm run build:chrome

# 2. Run all E2E tests
npm run test:e2e

# 3. Run a single spec file
npx playwright test tests/e2e/09-expense-thresholds.spec.ts

# 4. Open the interactive UI mode (time-travel debugger)
npm run test:e2e:ui

# 5. View the HTML report from the last run
npm run test:e2e:report
```

On CI, `--headless=new` is applied automatically via the `CI` environment variable. The config also enables one retry per test on CI to handle transient timing issues.

### Unit tests

The amortization engine (`src/engine/amortize.ts`) has **Vitest** unit tests covering the core math in isolation (no browser, no IndexedDB):

```bash
npm test           # run once
npm run test:watch # watch mode
```

---

## CI / CD

### Pipeline overview

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push to `main`, on every pull request, and on version tags (`v*.*.*`). It has six jobs:

```
build ─────────────────┬─────────────── e2e ──┐
                       │                      ├── package ── attest ── release
unit (no browser) ─────┘                      │    (push)   (tags)    (tags)
```

| Job | Trigger | What it does |
|---|---|---|
| **build** | always | `npm run build:chrome` + `npm run build:firefox`; uploads `dist-chrome` and `dist-firefox` artifacts |
| **unit** | always | `npm test` (Vitest); passes when no unit test files exist yet |
| **e2e** | always (needs build) | Downloads `dist-chrome`, installs Playwright + Chromium, runs `npm run test:e2e` with `CI=true` |
| **package** | push to `main` or tag | Downloads both dist artifacts, runs `npm run zip`, renames zips to `financial-finger-{version}-chrome.zip` / `…-firefox.zip` |
| **attest** | tags only (needs package) | Creates SLSA Build Level 2 provenance attestations via `actions/attest-build-provenance@v2` for both zips |
| **release** | tags only (needs attest) | Creates a GitHub Release with the attested zips as downloadable assets; marks pre-release if the tag contains a hyphen (e.g. `v1.0.0-beta.1`) |

### Creating a release

```bash
git tag v1.0.0
git push origin v1.0.0
```

This triggers the full pipeline. After `attest` completes, the release job publishes a GitHub Release with auto-generated release notes and both zip files as assets.

### Verifying build attestations

Each release asset has a corresponding SLSA provenance attestation that proves the zip was built from a specific commit via the Actions workflow — not tampered with outside CI. To verify after downloading:

```bash
gh attestation verify financial-finger-1.0.0-chrome.zip \
  --repo sormondocom/finance-finger
```

The attestation records the exact workflow run, the Git commit SHA, and the build inputs. Anyone who downloads a release zip can independently verify its provenance.

### Test artifacts on failure

When E2E tests fail, the workflow uploads:
- **`playwright-report`** — full HTML report with timeline, errors, and steps (retained 30 days)
- **`playwright-screenshots`** — screenshots from every test step (retained 14 days)

Download these from the **Artifacts** section of the failed workflow run to diagnose the failure.

---

## Architecture

### Extension structure

```
Financial Finger
├── Background service worker    (MV3 — handles toolbar click → opens app tab)
└── Full-page app                (chrome-extension:// tab, hash router, no popup)
```

Clicking the toolbar icon opens `src/app/index.html` as a dedicated full-page tab. This allows a proper layout while keeping all data access inside the extension's secure context. There is no popup.

### Crypto layer

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

The vault key is a random 32-byte `CryptoKey` generated at setup, encrypted to the PGP public key, and stored as an OpenPGP armored message in `VaultConfig.encryptedVaultKey`. The raw key is never persisted — it only exists in memory while the vault is unlocked.

### Data layer

All financial records are stored in **IndexedDB** via [`idb`](https://github.com/jakearchibald/idb) with a typed schema. Every value is an `EncryptedRecord` — the raw domain object is never written to disk.

```
IndexedDB: "financial-finger" (v5)
  ├─ members                (key: id)
  ├─ income_sources         (key: id, index: by_member)
  ├─ expense_categories     (key: id)
  ├─ expenses               (key: id, indexes: by_category, by_date)
  ├─ credit_cards           (key: id)      ← stores all debt account types
  ├─ debt_payments          (key: id)
  ├─ card_charges           (key: id)
  ├─ scenarios              (key: id)
  ├─ expense_paid_records   (key: id)      ← actual paid amounts per bill per month
  └─ settings               (key: string)
```

Non-sensitive configuration (vault key ciphertext, public key, mascot settings, theme preference) lives in **`chrome.storage.local`** — either public by nature (PGP public key) or non-sensitive (theme choice).

### Notifier module

`src/utils/notifier.ts` is a singleton that centralizes alert computation and badge updates. It queries the DB for payment status and bill status on demand, maintains a current alert list, and notifies any subscriber (the mascot briefing system) via callback.

- `refreshNotifier()` — re-queries DB, updates the badge text/color, fires the callback
- `subscribeToAlerts(cb)` — registers a single callback (replaces the previous one)
- `getCurrentAlerts()` — returns the last computed alert list synchronously
- `getOverageTrend(expenseId, threshold)` — counts how many of the last 6 paid records for a bill exceeded the threshold; used by the Mark Paid flow to decide whether to fire the expense-trend mascot

The extension icon badge shows `!` when any alert exists — red (`#dc2626`) for critical alerts (past-due), amber (`#f59e0b`) for warnings only.

### Amortization engine

`src/engine/amortize.ts` is pure TypeScript with no DOM dependencies.

| Function | Purpose |
|---|---|
| `amortizeSingleCard(card, extra, startDate)` | Full schedule for one card using its own payment cycle |
| `amortizeMultiCard(cards, strategy, extra, startDate)` | Multi-card normalized to monthly; payment rollover on payoff |
| `sortByStrategy(cards, strategy)` | Avalanche / Snowball / Custom ordering |
| `comparePayoffScenarios(cards, strategy, extra)` | Runs both min-only and with-extra, returns the diff |
| `detectMinimumPaymentTrap(card)` | Flags if >3 years or interest ratio >50% |

Edge cases handled: payment capped at `balance + interest`, percentage-minimum floor of $25, 1,200-period safety cap, floating-point zero threshold of $0.005.

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
│   ├─ schema.ts           idb typed schema (v5)
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
│   ├─ income/             Member chips, income source CRUD
│   ├─ expenses/           Categories, expense list, bill tracking, threshold entry
│   ├─ budget/             Donut chart, category bars, cash flow chart
│   ├─ debt/               Card CRUD, strategy tabs, amortization, what-if grid
│   ├─ reports/            Date-range analytics, overage offenders
│   ├─ insights/           10-card financial education with live calculators
│   ├─ afford/             Affordability calculator
│   └─ settings/           Mascot, household, theme, security, export/import
├─ types/
│   └─ index.ts            All domain types (no runtime code)
└─ utils/
    ├─ finance.ts          toMonthly, fmt, fmtCents, CATEGORY_COLORS
    ├─ billStatus.ts       computeBillStatus — paid / due-soon / past-due logic
    ├─ paymentStatus.ts    computePaymentStatus — debt payment tracking
    └─ notifier.ts         Alert computation, badge updates, mascot callback
tests/
├─ e2e/                    Playwright spec files (13 files)
└─ helpers/
    ├─ extension.ts        launchExtensionContext — isolated Chromium + extension
    └─ setup-wizard.ts     completeSetupWizard, navigateTo helpers
```

### Build targets

| Command | Output |
|---|---|
| `npm run build:chrome` | Chromium MV3 extension → `dist/chrome/` |
| `npm run build:firefox` | Firefox MV3 extension → `dist/firefox/` |
| `npm run build` | Both targets |
| `npm run zip:chrome` | Packages `dist/chrome/` → `artifacts/chrome/` |
| `npm run zip:firefox` | Packages `dist/firefox/` → `artifacts/firefox/` |
| `npm run zip` | Both zips |

---

## Dependencies

| Package | Purpose |
|---|---|
| `openpgp ^6.1.0` | ECC key generation, PGP encrypt/decrypt |
| `idb ^8.0.0` | Typed IndexedDB wrapper |
| `chart.js ^4.4.4` | Budget donut, spending charts, compound interest visualizer |
| `webextension-polyfill ^0.12.0` | Cross-browser `browser.*` API namespace |

All dependencies are auditable, actively maintained open-source libraries with no telemetry. Dev dependencies include `@playwright/test`, `vitest`, `vite`, `vite-plugin-web-extension`, and `web-ext`.

---

## License

See [LICENSE](LICENSE).
