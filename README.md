# Financial Finger

<p align="center">
  <img src="public/mascots.svg" alt="Buck and Penny on the Dollar Farm" width="420" />
</p>

<p align="center">
  <a href="https://buymeacoffee.com/sormondocom">
    <img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-%23FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy me a coffee" />
  </a>
</p>

> *Figurin' out your finances — offline, encrypted, and yours.*

A fully offline browser extension for household budgeting, debt management, and financial education. Every byte of your financial data is encrypted at rest with your own PGP key. Nothing ever leaves your device unencrypted.

---

## Why it exists

Most budgeting tools are cloud services. That means your income, debts, and spending habits live on someone else's servers, paid for with advertising or subscription revenue — and potentially exposed in breaches. Financial Finger flips that model: your data stays in your browser's local storage, encrypted to a key that only you hold. The extension is the only reader.

---

## Features

### Privacy & security
- **Fully offline** — no accounts, no sync, no telemetry, no network calls for your data
- **Encrypted at rest** — all financial records stored as AES-256-GCM ciphertext in IndexedDB; the symmetric vault key itself is encrypted to your PGP public key so it can never be recovered without your private key and passphrase
- **You own the keys** — private key is generated once during setup and handed to you; store it wherever you like (printed, offsite backup, password manager). Financial Finger never stores it
- **Session-scoped unlock** — vault decrypts on unlock and stays open until you close all extension tabs; service worker restart automatically re-locks

### Budget management
- **Household profiles** — one vault supports multiple named members, each with their own income sources
- **Income sources** — any frequency (hourly, weekly, biweekly, semi-monthly, monthly, annual), auto-normalized to monthly for all calculations; sources can be toggled active/inactive
- **Expenses** — categorized, color-coded; one-time or recurring (with independent frequency); filterable by category, type, and member
- **Budget view** — spending-by-category donut chart, category breakdown bars, cash flow horizontal bars; mascot fires when you're running a deficit

### Debt & credit cards
- **Card management** — balance, APR, credit limit, minimum payment (fixed dollar or percentage), payment cycle (weekly through monthly)
- **Full amortization schedules** — per-card, date-stamped, scrollable table with a summary footer
- **Payoff strategies** — Avalanche (highest APR first), Snowball (smallest balance first), Custom (drag to reorder)
- **Payment rollover** — when a card is paid off, its freed-up minimum automatically rolls into the next focus card
- **What-if grid** — enter any extra monthly payment and see interest saved and months cut instantly
- **Minimum-payment trap detector** — flags any card where paying minimums-only takes more than 3 years or costs more than 50% of the original balance in interest
- **Utilization bars** — visual color gradient from gold (healthy) through rust (warning) to red (over-limit)

### Financial education
Four topic tabs — Debt Basics, Budgeting, Credit, Saving & Investing — with 10 illustrated cards written in the voice of the mascots:

| Card | Interactive? |
|---|---|
| What is APR? | No |
| The Minimum Payment Trap | Yes — live calculator powered by the amortization engine |
| Avalanche vs. Snowball | No |
| The 50/30/20 Rule | Yes — uses your real income/expense data |
| Emergency Fund | Yes — month-target calculator |
| Zero-Based Budgeting | No |
| Credit Utilization | Yes — rating + paydown targets |
| What Makes a Credit Score? | No |
| Balance Transfers | No |
| Compound Interest | Yes — Chart.js line chart with year slider, debt vs. investment |

### Mascots: Buck & Penny
Two animated SVG pig mascots — Buck (male, navy overalls, miner's headlamp, straw hat, wheat straw) and Penny (female, green overalls, sunflower hat) — appear with southern-charm dialogue at financial trigger points. Both are renameable. The tip-of-the-day rotates through an 8-tip bank keyed to day-of-year so the same tip shows all day but changes daily.

### Settings
- Mascot gender picker and nickname rename
- Household profile name
- Light / Dark / Auto theme toggle (persisted to `chrome.storage.local`)
- PGP fingerprint display and public-key export
- Vault lock status
- Danger zone: full vault + IndexedDB reset

---

## Architecture

### Extension structure

```
Financial Finger
├── Background service worker    (MV3, handles toolbar click → open app tab)
└── Full-page app                (extension:// tab, hash router, no popup)
```

The extension has no popup. Clicking the toolbar icon opens `src/app/index.html` as a new tab. This allows a full-page layout while keeping all data access inside the extension's secure context.

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
IndexedDB: "financial-finger" (v1)
  ├─ members              (key: id)
  ├─ income_sources       (key: id, index: by_member)
  ├─ expense_categories   (key: id)
  ├─ expenses             (key: id, indexes: by_category, by_date)
  ├─ credit_cards         (key: id)
  └─ settings             (key: string)
```

Non-sensitive configuration (vault key ciphertext, public key, mascot settings, theme) is stored in **`chrome.storage.local`** unencrypted — this data is either public (PGP public key) or non-sensitive (theme preference).

### Frontend

- **Vanilla TypeScript** — no framework
- **Hash-based router** (`#/dashboard`, `#/income`, etc.) — all page modules are lazy-loaded on first navigation
- **CSS custom properties** — full design token system (`variables.css`); theme switching is a single `data-theme` attribute toggle; `prefers-color-scheme` auto mode with manual light/dark override
- **Chart.js (tree-shaken)** — only the controllers needed per page are registered; Budget and Debt share a single lazy `chart.js` chunk (~171 KB, ~60 KB gzip)
- **Native `<dialog>`** — modals use the browser's built-in `dialog` element for focus trapping, backdrop click, and Escape handling with no library

### Amortization engine

`src/engine/amortize.ts` is pure TypeScript with no DOM dependencies — suitable for testing in isolation.

| Function | Purpose |
|---|---|
| `amortizeSingleCard(card, extra, startDate)` | Full schedule for one card using its own payment cycle |
| `amortizeMultiCard(cards, strategy, extra, startDate)` | Multi-card normalized to monthly; payment rollover on payoff |
| `sortByStrategy(cards, strategy)` | Avalanche / Snowball / Custom ordering |
| `comparePayoffScenarios(cards, strategy, extra)` | Runs both min-only and with-extra, returns diff |
| `detectMinimumPaymentTrap(card)` | Flags if >3 years or interest ratio >50% |

Edge cases handled: payment capped at `balance + interest` (no overpayment), percentage-minimum floor of $25, 1,200-period safety cap, floating-point zero threshold of $0.005.

### Directory layout

```
src/
├─ app/
│   ├─ index.html          Entry point
│   ├─ main.ts             Boot sequence, theme, nav, route registration
│   ├─ router.ts           Hash router
│   └─ styles/             variables.css, base.css, nav.css
├─ background/
│   └─ index.ts            Service worker — opens app tab on toolbar click
├─ components/
│   └─ Modal.ts            openModal / openFormModal (native <dialog>)
├─ crypto/
│   ├─ pgp.ts              generateKeyPair, encrypt, decrypt, readKeyInfo
│   └─ vault.ts            AES-GCM session key, encryptRecord, decryptRecord
├─ db/
│   ├─ schema.ts           idb typed schema
│   └─ index.ts            CRUD functions for all entities
├─ engine/
│   └─ amortize.ts         Pure amortization and trap-detection functions
├─ mascot/
│   ├─ svgs.ts             Inline SVG for Buck and Penny
│   ├─ mascot.css          mosey-in / idle / react / leaving animations
│   ├─ messages.ts         Dialogue banks, tip banks, getDailyTip, getLines
│   └─ Mascot.ts           showMascot, showTip, greet, invalidateConfig
├─ pages/
│   ├─ setup/              6-step onboarding wizard
│   ├─ unlock/             Vault unlock screen
│   ├─ dashboard/          Summary stats, income/debt panels, tip widget
│   ├─ income/             Member chips, income sources CRUD
│   ├─ expenses/           Categories, expense list, filters
│   ├─ budget/             Charts, category bars, cash flow
│   ├─ debt/               Card list, strategy tabs, amortization table
│   ├─ insights/           10-card financial education with live calculators
│   └─ settings/           Mascot, household, theme, security, danger zone
├─ types/
│   └─ index.ts            All domain types (no runtime code)
└─ utils/
    └─ finance.ts          toMonthly, fmt, fmtCents, CATEGORY_COLORS
```

### Build targets

| Command | Output |
|---|---|
| `npm run build` | Chromium MV3 extension → `dist/` |
| `npm run build:firefox` | Firefox MV3 extension → `dist/` |
| `npm run zip` | Packages `dist/` into a `.zip` in `artifacts/` via `web-ext` |

Both targets share the same codebase. `webextension-polyfill` normalizes the `browser.*` API namespace across browsers. The Firefox target sets `browser_specific_settings.gecko.id` in the manifest and requires Firefox 109+.

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
npm run build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder

Click the Financial Finger icon in your toolbar to open the app.

### Load in Firefox

```bash
npm run build:firefox
```

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `dist/manifest.json`

Or use the `web-ext` dev server for live reload:

```bash
npm run build:firefox
npx web-ext run -s dist --target firefox-desktop
```

### First-run setup

The six-step setup wizard runs automatically on first launch:

1. **Welcome** — overview of the privacy model
2. **Mascot** — choose Buck or Penny; optionally rename them
3. **Keys** — generate a new ECC curve25519 PGP keypair (name, email, passphrase), or import an existing armored private key
4. **Save your key** — copy the private key to clipboard; store it somewhere safe offsite. *This is the only time it is shown.*
5. **Profile** — name your household
6. **Done** — vault is created and you land on the dashboard

On subsequent launches the vault unlock screen appears. Paste your private key and enter your passphrase to decrypt the session key and access your data.

### Development mode

Vite's dev server doesn't integrate with the extension loader, so development is a build-and-reload workflow:

```bash
npm run build -- --watch   # rebuilds on file save
```

Then reload the extension manually in `chrome://extensions` after each build. The `web-ext run` command handles auto-reload for Firefox.

### Tests

```bash
npm test          # run once
npm run test:watch  # watch mode
```

Tests are written with [Vitest](https://vitest.dev/). The amortization engine (`src/engine/amortize.ts`) is the primary test target as it is pure TypeScript with no browser dependencies.

---

## Dependencies

| Package | Purpose |
|---|---|
| `openpgp ^6.1.0` | ECC key generation, PGP encrypt/decrypt |
| `idb ^8.0.0` | Typed IndexedDB wrapper |
| `chart.js ^4.4.4` | Budget donut, debt line chart, compound interest visualizer |
| `webextension-polyfill ^0.12.0` | Cross-browser `browser.*` API namespace |

All dependencies are auditable, actively maintained open-source libraries with no telemetry.

---

## License

See [LICENSE](LICENSE).
