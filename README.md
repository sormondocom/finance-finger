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

<p align="center">
  <img src="docs/screenshots/03-dashboard.png" alt="Financial Finger dashboard" width="800" />
</p>

A fully offline browser extension for household budgeting, debt management, and financial planning. Every byte of your financial data is encrypted at rest with your own PGP key. Nothing ever leaves your device unencrypted.

---

## Table of Contents

- [Why it exists](#why-it-exists)
- [For contributors & security researchers](#for-contributors--security-researchers)
- [Browser support](#browser-support)
- [Quick start](#quick-start)
- [First-run setup](#first-run-setup)
- [Features](#features)
  - [Household & income](#household--income)
  - [Custom Reminders](#custom-reminders)
  - [Accounts](#accounts)
  - [Expenses](#expenses)
  - [Bill tracking](#bill-tracking)
  - [Bill cost thresholds](#bill-cost-thresholds)
  - [Budget](#budget)
  - [Debt](#debt)
  - [Reports](#reports)
  - [Mascots: Buck & Penny](#mascots-buck--penny)
  - [Settings](#settings)
- [Using Financial Finger](#using-financial-finger)
  - [Dashboard](#dashboard)
  - [Income](#income)
  - [Accounts](#accounts-1)
  - [Expenses](#expenses-1)
  - [Calendar](#calendar)
  - [Budget](#budget-1)
  - [Debt](#debt-1)
  - [Reports](#reports-1)
  - [What If? (Scenario Films)](#what-if-scenario-films)
  - [Learn (Financial Education)](#learn-financial-education)
  - [Settings](#settings-1)
  - [Data Sharing](#data-sharing)
  - [Help](#help)
- [Common Scenarios](#common-scenarios)
  - [Starting from scratch](#starting-from-scratch)
  - [Tracking a new credit card](#tracking-a-new-credit-card)
  - [Planning a big purchase](#planning-a-big-purchase)
  - [Monthly bill review](#monthly-bill-review)
  - [Linking expense payments to a credit card](#linking-expense-payments-to-a-credit-card)
  - [Syncing data with a household member on a separate computer](#syncing-data-with-a-household-member-on-a-separate-computer)
  - [Paying down debt aggressively](#paying-down-debt-aggressively)
- [Month in the Life](#month-in-the-life)
  - [One time: first-run setup](#one-time-first-run-setup)
  - [First week: build your baseline](#first-week-build-your-baseline)
  - [Every day: quick check](#every-day-quick-check)
  - [When a bill is due](#when-a-bill-is-due)
  - [When you make a debt payment](#when-you-make-a-debt-payment)
  - [Start of month (1st–5th)](#start-of-month-1st5th)
  - [End of month: review and plan](#end-of-month-review-and-plan)
  - [Quarterly: big-picture planning](#quarterly-big-picture-planning)
- [Importing transactions](#importing-transactions)
  - [Supported file formats](#supported-file-formats)
  - [The import wizard](#the-import-wizard)
  - [Column mapping](#column-mapping)
  - [Duplicate detection](#duplicate-detection)
  - [Snapshot and rollback](#snapshot-and-rollback)
- [Snapshots](#snapshots)
  - [How snapshots work](#how-snapshots-work)
  - [Taking a manual snapshot](#taking-a-manual-snapshot)
  - [Restoring from a snapshot](#restoring-from-a-snapshot)
- [Troubleshooting](#troubleshooting)
  - [Break Glass](#break-glass)
  - [Orphan Record Scanner](#orphan-record-scanner)
- [Help](#help)
- [FAQ](#faq)
  - [I lost my private key / forgot my passphrase. Can I recover my data?](#i-lost-my-private-key--forgot-my-passphrase-can-i-recover-my-data)
  - [Why can't I connect my bank or financial services directly via API?](#why-cant-i-connect-my-bank-or-financial-services-directly-via-api)
  - [Why can't Financial Finger email me or text my phone when a reminder fires?](#why-cant-financial-finger-email-me-or-text-my-phone-when-a-reminder-fires)
- [Financial Finger in the Classroom](#financial-finger-in-the-classroom)
  - [The Financial Universe model](#the-financial-universe-model)
  - [Teacher setup](#teacher-setup)
  - [Student onboarding](#student-onboarding)
  - [Classroom exercises](#classroom-exercises)
- [Dependencies](#dependencies)
- [License](#license)

---

## Why it exists

Most budgeting tools are cloud services. Your income, debts, and spending habits live on someone else's servers — paid for with advertising or subscription revenue and potentially exposed in breaches. Financial Finger flips that model: your data stays in your browser's local storage, encrypted to a key that only you hold. The extension is the only reader. Financial Finger is **free**.

If you're feeling generous you can throw a few bucks my way at [Buymeacoffee](https://buymeacoffee.com/sormondocom) — always appreciated but never required.

---

## For contributors & security researchers

This README is written for people who want to **use** Financial Finger. If you want to build, test, or contribute to the codebase, see **[CONTRIBUTING.md](CONTRIBUTING.md)** — it covers the full dev environment setup, build commands, E2E and unit test structure, CI/CD pipeline, and architecture.

For a detailed explanation of the cryptographic model, threat model, and how to report a vulnerability, see **[SECURITY.md](SECURITY.md)**.

---

## Browser support

Financial Finger targets both **Chromium** (Chrome, Edge, Brave, Arc) and **Firefox** as equally supported primary browsers.

| Browser | Minimum version | Extension format |
|---|---|---|
| Chrome / Chromium | 109+ | MV3 |
| Edge | 109+ | MV3 |
| Firefox | 109+ | MV3 |

---

## Quick start

Download the latest release from the [Releases page](https://github.com/sormondocom/finance-finger/releases). Each release includes two zip files: one for Chrome/Chromium and one for Firefox.

### Load in Chrome / Chromium

1. Unzip `financial-finger-*-chrome.zip`
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the unzipped folder

Click the Financial Finger icon in your toolbar to open the app.

### Load in Firefox

1. Unzip `financial-finger-*-firefox.zip`
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select `manifest.json` inside the unzipped folder

> **Note:** Firefox temporary add-ons are removed when the browser closes. For persistent installation, Firefox requires a signed extension. A signed release will be published to addons.mozilla.org when the extension reaches a stable release milestone.

→ **Building from source?** See [CONTRIBUTING.md](CONTRIBUTING.md) for the full developer setup.

---

## First-run setup

The **six-step setup wizard** runs automatically on first launch:

<p align="center">
  <img src="docs/screenshots/01-setup-welcome.png" alt="Setup welcome screen" width="49%" />
  <img src="docs/screenshots/02-setup-mascot.png" alt="Mascot selection step" width="49%" />
</p>

| Step | What happens |
|---|---|
| **Welcome** | Overview of the privacy model |
| **Mascot** | Choose Buck (male pig, cowboy) or Penny (female pig, sunflower hat); optionally rename them |
| **Keys** | Generate a new ECC curve25519 PGP keypair (name, email, passphrase) — or paste an existing armored private key |
| **Save your key** | The private key is shown once; copy it to a password manager or print it for offsite storage. *It is never stored by the extension.* **⚠️ If you lose your private key or forget your passphrase, your data cannot be recovered by anyone — there is no reset or recovery mechanism.**  Back it up to multiple locations if you can, print it out (*Really!*  If you have nothing but a piece of paper to enter in a long text string from, it is probably better than starting over.)|
| **Profile** | Name your household |
| **Done** | Vault is created; you land on the dashboard |

> **Not sure what a PGP key is?** That's okay — most people don't.
> [PGP (Pretty Good Privacy)](https://en.wikipedia.org/wiki/Pretty_Good_Privacy) is a public-key encryption standard used by security software worldwide.
> The short version: the setup wizard generates two linked keys — a **public key** (safe to share) and a **private key** (only you keep it).
> Data encrypted with your public key can only be decrypted with your private key.
> Financial Finger's **[Learn section](#learn-financial-education)** inside the app explains this in plain language and walks through exactly what happens at each step of setup.
> For the full cryptographic model and threat analysis, see **[SECURITY.md](SECURITY.md)**.

On subsequent launches the **vault unlock screen** appears. Paste your private key (or click **Load from file** to select a saved `.asc` key file) and enter your passphrase. The screen also shows your PGP key fingerprint in an expandable panel so you can confirm it is the correct key before unlocking. The vault stays unlocked for the full browser session; closing all extension tabs re-locks it. You can also lock the vault manually at any time from **Settings → Security → Lock vault**.

---

## Features

### Household & income

**Household members** — Add named members to your household. Each member has an avatar type that determines their icon throughout the app: **adult male**, **adult female**, **baby boy**, **baby girl**, **kid boy**, **kid girl**, **teen boy**, or **teen girl**. Members are used to assign income sources so you can see each person's contribution to household income.

**Income sources** — Each member can have multiple income sources. The pay type can be **salary** (enter the amount at any frequency) or **hourly** (enter an hourly rate and hours per period — the app computes the per-period pay and shows a preview). Frequencies: **hourly, weekly, biweekly, semi-monthly, monthly, quarterly, annual, or one-time**. Semi-monthly sources support two features: unequal paychecks (different amounts on the 1st-of-month and 15th-of-month paydays) and a **schedule variant** (choose whether paydays fall on the 1st and 15th, or on the 15th and end-of-month). Every source is normalized to monthly for all calculations. Sources can be toggled active/inactive without deleting them. Income sources can optionally be linked to a bank account to feed the Accounts page balance projection.

**Month navigation** — The Income page has **‹ / ›** arrows that let you browse any past month. The displayed income sources and totals adjust to the viewed month: recurring sources always appear (they apply to every month), while one-time sources only appear when their recorded date falls inside the viewed month. Navigating forward past the current month is disabled.

**Monthly total breakdown** — When one-time income is present in the viewed month, the header expands from a single "Monthly total" into a three-line breakdown: **Recurring** (the per-month recurring amount), **+ One-time** (the sum of one-time payments dated in the viewed month), and **Total** (the combined figure). When no one-time income exists for the viewed month, only the recurring monthly total is shown.

**Year-to-date and projected income** — When viewing the current month, a summary panel below the header shows two figures side by side: **Year-to-Date Income** (recurring sources pro-rated to today's date, plus any one-time payments already received this year) and **Projected [Year]** (recurring sources × 12 plus all one-time payments entered for the current year, whether past or future). This panel is hidden when browsing past months.

---

### Custom Reminders

Custom reminders let you schedule personal bell notifications for any item in your budget — a debt payment date, a monthly income day, a recurring expense, or an account transfer. They are separate from the built-in payment-due mascot alerts and deliver a full-screen overlay with your custom message.

**Trigger types:**

| Type | When it fires |
|---|---|
| **Days before a bill's due date** | N days before a specific recurring expense's due day (e.g. 7 days before the electric bill) |
| **Monthly on a specific day** | On the chosen day of each month (e.g. the 1st) |
| **One-time on a specific date** | Once, on or after a specific date; deactivates itself after firing |

**Time of day** — All reminders support an optional time field. If set, the reminder only fires when you open the app at or after that time on the trigger day. If left blank, it fires at the first app-open of that day.

**Linking reminders to items** — When you add or edit any income source, expense, debt account, or bank account, a **Reminders** subsection appears at the bottom of the form. Use **+ Add reminder** to attach a reminder directly to that item. The reminder is automatically linked so it appears both in the item's edit form and in the central Settings → Reminders panel.

**Create-form reminders** — Reminders can be added while creating a new item (before saving it). These are buffered and saved together with the item when you submit the form.

**Settings → Reminders** — The central management panel for all custom reminders. Add, edit, or delete any reminder regardless of which item it was created from. Each card shows the label, trigger description, active/inactive status, and a toggle and delete button.

**Custom message** — All reminders support an optional free-text message that appears in the notification overlay.

---

### Accounts

**Bank accounts** — Track every deposit account in your household: checking, savings, money market, cash, or other. Each account can be set as individual (assigned to one household member), joint, or household-level. The **Cash** type is useful for tracking physical currency you keep on hand — a petty-cash envelope, a cash wallet, or an allowance jar.

**Dual balance display** — Each account row shows two labeled balances side by side:
- **Actual** — computed from your recorded transactions (expense payments, income deposits, and debt payments actually logged against that account). This reflects what your records say you currently have.
- **Projected** — starting balance plus all linked recurring income minus recurring expenses and debt payments for the viewed month. This reflects what your budget plan predicts.

Both are visible at a glance on the account row. The Actual balance turns red when it goes negative.

**Running ledger** — Expand any account to reveal a chronological transaction ledger: every income deposit, expense payment, and debt payment recorded against that account, with a running balance column. The panel header shows your opening balance and current actual balance so you can spot discrepancies at a glance.

**Balance projection** — Use the **‹ / ›** arrows on the Accounts page to navigate forward and backward through months and see how the projected balance shifts. The stacked bar chart at the top shows all accounts side by side across recent months.

**Dashboard "Income by Account" card** — When at least one account has an active income source linked to it, the Dashboard shows a breakdown card listing each account alongside the income flowing into it. The card is hidden when no accounts have linked income.

**Cross-form hints** — The income source form and expense form both show a "No bank accounts" hint (with a direct link to the Accounts page) when no accounts exist yet, so you can add one without losing your place.

**Online banking link** — Each account can store an optional URL for the bank's online portal. Click the link icon on the account row to open it in a new tab — useful for quickly jumping to your bank while reviewing transactions.

**CSV import** — Download a statement from your bank as a CSV (or TSV / delimited text) file and import it directly into an account's transaction ledger. Click the **⬆** button on any account row to open the import wizard. See [Importing transactions](#importing-transactions) for the full workflow.

---

### Expenses

**Categories** — Create color-coded expense categories (Housing, Food, Utilities, etc.) to organize your spending. The category color flows through every chart that references it.

**One-time expenses** — Record any single transaction: a new appliance, a vet bill, a vacation. Assigned to a category and optionally to a specific member.

**Recurring expenses** — Mark any expense as recurring and set its frequency (weekly, biweekly, semi-monthly, monthly, quarterly, or annual). These feed the monthly total calculation and the Budget page. Recurring expenses can optionally carry a **due day** to become tracked bills.

**Billing portal link** — Any expense can store an optional URL for the biller's payment portal. The link icon on the expense row opens it directly so you can jump to the biller's site without leaving the app.

---

### Bill tracking

A recurring expense becomes a **tracked bill** when you set a due day (1–31). Once a bill has a due day, the extension monitors its payment status each month:

<p align="center">
  <img src="docs/screenshots/18-bills-status.png" alt="Bill status badges — Past Due and Due Soon" width="800" />
</p>

| Status | When it shows | Visual |
|---|---|---|
| **Due Soon** | Due day is within 7 days | Amber left border, ⏰ badge |
| **Past Due** | Due day has passed without payment | Red left border, ⚠ badge, pulsing animation |
| **Paid** | Marked paid this calendar month | Green left border, ✓ badge |

**Mark Paid** — The Mark Paid button on a due or overdue bill opens a dialog asking for the **actual amount paid** (pre-filled with the bill's usual amount). This lets variable bills — electricity, water, gas — record what the bill actually was, not just what you expected. Submitting saves a payment record and resets the bill's paid status for the month.

<p align="center">
  <img src="docs/screenshots/19-bills-mark-paid.png" alt="Record Payment dialog with billing cycle selector" width="800" />
</p>

**Billing cycle selector** — If you are recording a payment outside the normal 14-day window (for example, paying a bill a few days early or catching up on a missed month), the Mark Paid dialog shows a **billing cycle selector** — two pill buttons: this month's due date and last month's. Select the cycle the payment covers. If the selected cycle is already paid, an error shows before you can submit. Cycles already covered by an existing payment record are visually struck through to prevent accidental double-entry.

**Catch-up checkbox** — When the previous billing cycle was missed and is now overdue, a checkbox appears below the cycle pills: **"Covers additional billing cycle (date)"**. Checking it records an extra payment record for the missed cycle at the same amount and source, so both months show as covered in a single submission.

**Payment ledger** — Every bill has a payment history ledger accessible by clicking the 📋 icon on the expense row. The ledger lists every recorded payment with its date, amount, and source. Each row has:
- **✏️ Edit** — reopens the payment dialog pre-filled with the original amount, date, and source so you can correct any of them. The billing cycle selector appears in edit mode too, letting you move a payment to a different cycle if needed.
- **🗑️ Delete** — removes the payment record. The bill's paid status and `expense.date` roll back automatically to reflect only remaining records. If a card charge was created alongside the payment, it is also deleted.

**Stale payment status** — If a payment record is deleted but the bill's internal date was not rolled back (a data inconsistency that can arise from interrupted saves), the bill will show a gold **⚠ Sync issue** badge instead of the normal paid/due badge. A **↺ Reset Status** button appears on the row. Clicking it clears the stale date so the bill reflects its true payment state.

---

### Bill cost thresholds

Any recurring expense can have a **monthly threshold** — the maximum you expect the bill to cost. Set one when you add or edit a recurring expense (the Threshold field appears after checking "recurring").

**When thresholds kick in:**

- **⚡ badge on the expense row** — shows your target amount at a glance alongside the frequency chip
- **Inline overage warning in the Mark Paid dialog** — if you enter an amount above your threshold, the dialog immediately shows "⚠ Over target by $X.XX" so you know before you confirm
- **Common Overage Offenders report** — historical view in the Reports page (see below)
- **Daily briefing** — if a bill has exceeded its threshold 3 or more times in the last 6 months, it surfaces in the mascot's daily briefing as a persistent warning
- **Mascot trend alert** — after you mark a bill paid with an over-threshold amount for the second consecutive time, Buck or Penny pops up with a pointed comment about adjusting your expectations

<p align="center">
  <img src="docs/screenshots/20-threshold-overage.png" alt="Inline overage warning in the Record Payment dialog" width="800" />
</p>

---

### Budget

The Budget page shows a real-time picture of where your money goes:

- **Summary bar** — total income, total recurring expenses, and surplus/deficit for the month
- **Spending buckets** — wooden-bucket SVG icons representing each expense category, sized and colored by how full the budget is (sage → amber → rust → red as spending approaches the category limit); click any bucket to open the budget editor
- **Donut chart** — spending share by category; click a slice to filter the breakdown
- **Category breakdown** — horizontal bars showing each category's monthly total
- **Cash flow bar** — single bar comparing income to total spending

The mascot fires automatically on the Budget page if you are running a deficit (spending exceeds income in the current scenario).

**Spending category ledger** — When you open the budget editor for a category (by clicking a bucket or breakdown bar), a spending ledger appears below the category form if you have recorded payments for that category. The ledger is laid out in four columns: date, item name, source account/card, and amount. It has two groups:

| Group | What it contains |
|---|---|
| **Expenses** | Recurring expense payments recorded against this category and linked to a bank account |
| **Charges** | Card charges (from any debt account) categorized here |

**Clickable navigation from the ledger** — Both the item name and the source pill on each ledger row are interactive:

- **Click the item name** — closes the modal, navigates to the Accounts or Debt page, opens the ledger or charges panel for the relevant account, and highlights the specific transaction with a **golden pulse animation**
- **Click the source pill** — closes the modal, navigates to the Accounts or Debt page, and highlights just the account or card row with the same golden pulse

---

### Debt

**Card management** — Track any debt account type: credit card, mortgage, vehicle loan, medical debt, or personal/student loan. For each account you can set:
- Current balance, APR, credit limit (cards), original principal and term (mortgages/vehicle loans/personal loans)
- Minimum payment — fixed dollar amount or percentage of balance (with a $25 floor)
- Payment cycle — weekly, biweekly, semi-monthly, or monthly
- Due day — same tracking logic as bill tracking (past-due, due-soon badges)
- Introductory 0% APR end date — tracked separately so you know exactly when the promotional rate expires and the regular APR kicks in
- Billing portal link — optional URL to the card's payment portal for one-click access when making payments

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

**Card charges** — Log individual purchases against any card account to track spending at the merchant level. Charges appear in the Reports page as a separate spending category. You can also bulk-import charges from a credit card statement — click **⬆ Import CSV** in any card's charges panel. See [Importing transactions](#importing-transactions) for the full workflow.

**Payoff milestone timeline** — A timeline card below the strategy tabs shows the projected payoff date for every debt account under the current strategy, ending with a **debt-free date** when the last account reaches zero. The timeline updates live as you change strategy tabs or adjust the extra payment amount.

**Payoff horizon** — A 1–30 year slider on the balance projection chart lets you zoom in or out on the timeline. Compress it to see near-term payoff dates in detail; expand it to see a 10-year picture of how a strategy plays out.

**Payment history** — Every payment you record is stored with a date, amount, and type (regular or extra). The Reports page uses this history to reconstruct balance trends over time.

**Debt payoff celebrations** — When a single card reaches zero, a full-screen overlay plays with dancing mascots and confetti. When **every** debt account reaches zero, a second distinct celebration fires — Buck and Penny together, with a debt-freedom message.

---

### Reports

The Reports page provides date-range analytics across your full financial history. Use the preset buttons — **This Week, This Month, Last Month, Last 3 Mo., Last 6 Mo., This Year, Last Year, All Time** — or set a custom date range.

All spending figures count **every outflow**: one-time expenses, bill payments (Mark Paid), card charges, and debt payments — nothing is double-counted.

| Report card | What it shows |
|---|---|
| **KPI chips** | Total spending, total income, net cash flow, and savings rate. Click **Total Spending** to expand a transaction list (with type badges and dates); click **Total Income** to expand the per-month income payment schedule. Only the clicked chip expands. |
| **Leaky Bucket** | Day-by-day budget scrubber — the bucket drains as spending lands each day. A tear-off calendar in the top-right shows the current day (color-coded green/amber/red to match fill level). All outflows drain the bucket. |
| **Spending Over Time** | Stacked bar chart by month: Expenses & Bills (rust), Card Charges (navy), and Debt Payments (gold) as separate layers |
| **By Category** | Donut chart with a ranked table — spending share per category |
| **Top Merchants** | Horizontal bar chart of your biggest card charge destinations |
| **Income vs Spending** | Side-by-side bars per month. Below the chart: an **Income Payment Schedule** with per-month chips showing every payday event, amount, and frequency for each income source. |
| **Spending by Day** | Which day of the week sees the most spending |
| **Biggest Transactions** | Top 12 individual expenses and card charges |
| **Card Balance Trend** | Reconstructed balance history from payment records — a rising line signals balance creep |
| **Spending by Week of Month** | Which week of the month costs the most |
| **Recurring vs One-time** | What share of your spending is predictable each month |
| **Payee Schedule** | Every recurring obligation grouped by frequency (annual → weekly) — payee name, per-period amount, annual total, and due day. Debt minimum payments included. Independent of the date range. |
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
- **Members** — add or remove household members; each shows an avatar; removing a member also removes their assigned income sources
- **Theme** — Light, Dark, or Auto (follows `prefers-color-scheme`)
- **Currency** — choose your display currency (20 supported); the symbol, decimal precision, and formatting apply everywhere money is shown
- **Security** — PGP fingerprint display, public key export, and a **Lock vault** button to manually end the session without closing the browser
- **Data Sharing** — store household members' public keys and export your database encrypted to any recipient; import a `.ffx` file received from another installation
- **Export / Import** — back up your database encrypted to your own key, or receive a file from another household member and merge or replace your local data
- **Import Rules** — view and manage the auto-match rules created by the CSV import wizard; toggle or delete rules to control which patterns are applied on future imports
- **Reminders** — centralized view of all custom bell notifications (see [Custom Reminders](#custom-reminders))
- **Snapshots** — automatic point-in-time backups every 30 minutes; restore any snapshot from Settings to recover from accidental data changes (see [Snapshots](#snapshots))
- **Danger zone** — full vault wipe and IndexedDB reset
- **Break Glass** — emergency direct-access panel for reading, editing, and deleting raw database records; includes an Orphan Scanner for finding broken references (see [Troubleshooting → Break Glass](#break-glass))

---

## Using Financial Finger

Step-by-step instructions for every page in the app.

### Dashboard

The dashboard is your daily command center. It opens automatically after setup and every time you unlock the vault.

<p align="center">
  <img src="docs/screenshots/03-dashboard.png" alt="Dashboard" width="800" />
</p>

**Date navigation**

Use the **‹ / ›** arrows at the top right to step through months. The current month is the default; stepping forward past the current month is disabled. Click **Custom Range** to switch to a date-range view. Enter start and end dates, click **Apply**. Click **Clear** to return to single-month mode.

**Summary cards**

| Card | What it shows |
|---|---|
| **Income** | Recurring monthly income (prorated for partial months in custom-range mode) plus any one-time income logged in the period |
| **Expenses** | Recurring monthly expenses (prorated) plus one-time expenses in the period |
| **Net Cash Flow** | Income minus expenses; green when positive, red when negative |
| **Total Debt** | Point-in-time balance across all debt accounts (not date-sensitive) |

**Financial health chips**

These appear when you have both income and at least one debt account entered:

- **Debt-to-Income** — total monthly minimum payments ÷ monthly income. Under 36% is healthy; 43%+ is high. Hover the chip for the definition.
- **Credit Utilization** — total card balances ÷ total credit limits. Under 30% is good for your credit score.

**Income Sources card**

Below the summary cards, a panel lists each active income source with its name, member, frequency, and monthly amount. One-time income sources that fall within the currently-viewed month also appear here — so a bonus or freelance payment logged on the Income page shows up alongside your recurring paychecks for that month.

**Payment reminders card**

Appears when any debt account or tracked bill is past due or due within 7 days. Each row shows the account name, due date, and minimum payment. Click **View debt →** or **View bills →** to jump directly to the relevant page.

**Monthly activity widget**

The bottom section lets you log one-time income and expenses directly on the dashboard:

- Click **+ Log** under **One-time Income** to record a bonus, tax refund, side-gig payment, or any non-recurring income.
- Click **+ Log** under **One-time Expenses** to record a surprise cost (vet bill, car repair, etc.).

In custom-range mode the widget becomes a **Period Report**: a month-by-month table of income, expenses, and net cash flow. Click **▸** on any month row to expand it and see the individual one-time items logged that month.

**Tip widget**

Click the gold tip card at the bottom to have Buck or Penny deliver today's financial tip in full detail.

---

### Income

<p align="center">
  <img src="docs/screenshots/04-income.png" alt="Income page" width="800" />
</p>

**Adding household members**

1. Type a name into the **Add member** field at the top of the Income page and click **Add Member** (or press Enter).
2. The member appears as a chip. Repeat for every person in your household who has income.

**Adding income sources**

1. Click **+ Add Source** on a member's panel.
2. In the modal, enter a name (e.g. "Paycheck"), the gross amount, and the frequency — hourly, weekly, biweekly, semi-monthly, monthly, annual, or once.
3. Click **Save**. The source contributes immediately to all income calculations and the Budget page.

**Editing and deactivating**

- Click the pencil icon on a source to edit its name, amount, or frequency.
- Toggle **Active** to exclude a source from calculations without deleting it — useful for seasonal income or a job that has temporarily paused.

**Browsing past months**

Use the **‹ / ›** arrows in the top-right of the Income page to step through months. The source list and totals update to show only what is relevant to that month:

- **Recurring sources** — always visible, since they apply to every month. The recurring monthly total shown is the same regardless of which month you view.
- **One-time sources** — only appear when their recorded date falls within the viewed month. Navigating away from that month hides them; they reappear when you return to their month.
- **Member group totals** — the amount shown next to each member's name reflects their recurring monthly income plus any one-time income in the viewed month.

If you navigate to a month where no one-time income was recorded and no recurring sources exist, a note appears in the sources card.

**Monthly total breakdown**

When one-time income is present in the viewed month, the header shows a three-line breakdown instead of a single number:

| Line | What it shows |
|---|---|
| **Recurring** | Sum of all active recurring sources, normalized to monthly |
| **+ One-time** | Sum of one-time payments dated in the viewed month |
| **Total** | Combined figure for the month |

When there is no one-time income for the viewed month, only the recurring monthly total is shown (same as before).

**Year-to-date and projected income**

When viewing the current month, a panel below the header shows two year-level figures:

| Figure | How it is calculated |
|---|---|
| **Year-to-Date Income** | Recurring sources pro-rated to today's date + one-time payments already received this calendar year |
| **Projected [Year]** | Recurring sources × 12 + all one-time payments entered for this year (past or future dates) |

This panel is hidden when browsing past months — it is always a current-year view.

**One-time income**

Sources with frequency **once** also appear in the Monthly Activity widget on the Dashboard for the month matching their date. You can log one-time income directly from the Dashboard without going to the Income page.

**Reminders on income sources**

A **Reminders** section appears at the bottom of the Add and Edit income source forms. Click **+ Add reminder** to attach a custom notification — for example, a monthly reminder on your payday to review your budget. Reminders added during creation are saved together with the source. All linked reminders are also visible and manageable from **Settings → Reminders**.

---

### Accounts

<p align="center">
  <img src="docs/screenshots/05-accounts.png" alt="Accounts page" width="800" />
</p>

**Adding a bank account**

1. Click **+ Add Account** on the Accounts page.
2. Choose the account type: **Checking**, **Savings**, **Money Market**, **Cash**, or **Other**. Use **Cash** for physical currency you keep on hand — a petty-cash envelope, a wallet, or an allowance jar.
3. Choose ownership: **Individual** (select a household member), **Joint**, or **Household**.
4. Enter an optional starting balance — this is the known balance at a point in time that the projection builds forward from.
5. Optionally enter your bank's online portal URL. The link icon on the account row will open it directly.
6. Choose a chart color to identify this account in the balance chart.
7. Click **Save**.

**Linking income to an account**

Open any income source (Income page → pencil icon) and select the account from the **Deposit to** dropdown. Income linked this way is added to the account's projected balance each month.

**Reading the balances**

Each account row shows two labeled balances side by side:

| Balance | How it's calculated |
|---|---|
| **Actual** | Computed from your recorded transactions — expense payments, income deposits, and debt payments actually logged against this account |
| **Projected** | Starting balance + linked recurring income − linked recurring expenses and debt payments for the viewed month |

Use the **‹ / ›** arrows to step through months and see how the projected balance shifts over time. A negative Actual balance appears in red.

**Running ledger**

Click the expand toggle on any account row to open its **transaction ledger** — a chronological list of every recorded income deposit, expense payment, and debt payment against that account, with a running balance column on the right. The panel header shows your opening balance and current actual balance. This ledger is also the target when you click an item name in the Budget category ledger: the app navigates here and highlights the specific transaction with a golden pulse animation.

**Reminders on accounts**

A **Reminders** section appears at the bottom of the Add and Edit bank account forms. Use it to attach reminders such as a monthly prompt to reconcile the account or transfer to savings. All linked reminders are also manageable from **Settings → Reminders**.

**Balance chart**

The stacked bar chart at the top of the page shows all accounts side by side across recent months. Hover a bar segment to see the exact balance.

---

### Expenses

<p align="center">
  <img src="docs/screenshots/06-expenses.png" alt="Expenses page" width="800" />
</p>

**Creating categories**

1. Click **+ Add Category** at the top of the Expenses page.
2. Give it a name (e.g. Housing, Food, Utilities) and choose a color. That color flows through every chart in the app that references expenses.
3. Click **Save**. Categories appear as a colored chip row above the expense list.

**Filtering by category**

Click any category chip to filter the list to that category. Click it again to clear the filter. You can also filter by type using the **All / Recurring / One-time** toggle.

**Sorting**

Each expense group has a sort dropdown: **Due date, Name, Amount**, or **Pay Type**. Category groups can be sorted by **Name** or **Total**. The selected sort persists while the page is open.

**Editing a category**

Click any category pill in the management row to open the Edit Category modal. You can rename the category, choose a new color from the 32-color palette, or update its monthly budget. The pill, filter chip, and every chart referencing that category update immediately after saving.

**Adding an expense**

1. Click **+ Add Expense**.
2. Fill in a description, amount, category, and date.
3. Optionally enter a **billing portal URL** — the link icon on the expense row will open it directly.
4. Check **Recurring** to make it a recurring bill. This reveals:
   - **Frequency** — weekly through annual (including quarterly).
   - **Due day** (1–31) — turns the expense into a tracked bill monitored each month.
   - **Monthly threshold** — the maximum you expect the bill to cost. If an actual payment exceeds this, the app warns you.
   - **Fixed amount** — check this when the bill is always exactly the same (e.g. a streaming subscription). The payment dialog pre-fills the amount and makes it read-only.
   - **Auto-pay** — check this for bills paid automatically by your bank. Auto-pay bills show an Auto-pay badge instead of a Record Payment button and do not appear in payment reminders.
   - **Charge to card** — link the expense to a debt account so payments automatically create a charge entry on that card.
5. Click **Save**.

**Reminders on expenses**

A **Reminders** section appears at the bottom of the Add and Edit expense forms. Click **+ Add reminder** to attach a custom notification — for example, a reminder a few days before a bill's due date, or a monthly prompt for a variable expense. The trigger type defaults to "days before due date" for expenses that have a due day, or "monthly on a specific day" for others. All linked reminders are also manageable from **Settings → Reminders**.

**Marking a bill paid**

1. Find a bill showing the ⏰ (due soon) or ⚠ (past due) badge and click **Mark Paid**.
2. The dialog pre-fills the bill's usual amount. Change it to what you actually paid — important for variable bills like electricity or gas.
3. If the amount exceeds your threshold, an inline warning shows the overage immediately before you confirm.
4. For tracked bills, a **billing cycle selector** shows two pill buttons — this month and last month. Select the cycle the payment covers. If you're catching up on a missed previous cycle, check the **"Covers additional billing cycle"** checkbox to record both months in one submission.
5. Click **Mark as Paid**. The badge updates to ✓ Paid and the notifier refreshes automatically.

To correct a recorded payment, click the 📋 icon on the bill row to open the **payment ledger**, then click ✏️ on the entry. The same dialog opens pre-filled with the existing amount, date, and source — and with the billing cycle selector pre-set to the cycle the original payment covered. To remove a payment entirely, click 🗑️; the bill's paid status and linked card charge are rolled back automatically.

---

### Calendar

<p align="center">
  <img src="docs/screenshots/07-calendar.png" alt="Payment Calendar" width="800" />
</p>

The Calendar page shows your entire financial month at a glance: bill due dates, paydays, one-time income and expenses, and recorded debt payments, all laid out on a day-by-day grid.

**Navigating months**

Use the **‹ / ›** arrows at the top to browse past or future months. Today's date is highlighted in the grid. Bills with due days on days 29–31 clamp to the last day of shorter months.

**What appears on the grid**

Each day cell can show several types of chips:

| Chip type | Color | What it represents |
|---|---|---|
| 💰 **Payday** | Gold | An income source's pay date at the correct frequency (biweekly, semi-monthly, etc.) |
| 💵 **One-time income** | Gold | A one-time income payment recorded for this date |
| **Bill — Upcoming** | Sage | A tracked bill due later in the month |
| **Bill — Due Soon** | Amber | A tracked bill due within 7 days |
| **Bill — Past Due** | Red (pulsing) | A tracked bill whose due day has passed without payment |
| **Bill — Paid** | Green | A tracked bill marked paid this month |
| **Debt payment due** | Amber/red | A debt account due date (same due-soon / past-due logic as bills) |
| **Debt payment recorded** | Teal | A debt payment you have recorded, shown on its payment date |
| **One-time expense** | Muted | A one-time expense recorded for this date |

The summary bar above the grid shows a count of each status. Click a status chip in the bar to filter the grid to only that type.

**Marking a bill paid from the Calendar**

Click **✓ Mark Paid** below any unpaid bill chip. The same amount dialog as the Expenses page opens — enter the actual amount paid and confirm. The chip updates immediately.

**Paint tool**

The Calendar has a **paint toolbar** in the top-right corner. Choose one of five colors (green, blue, amber, red, purple) and click any day cell to color-code it with a personal marker — useful for flagging paydays, planned purchases, or anything else you want to track visually. Click the same cell again to clear it. Use **Clear month** to remove all marks for the current month at once.

**Day memos**

Click any day cell's **+ Memo** button (or the memo icon on a day that already has one) to add a freeform note. Memos can optionally be assigned to a household member. They appear as a small note card on the day cell and persist across sessions.

---

### Budget

<p align="center">
  <img src="docs/screenshots/08-budget.png" alt="Budget overview" width="800" />
</p>

The Budget page shows a real-time visual breakdown of your monthly spending.

**Summary bar**

The top bar shows total monthly income, total recurring expenses, and the surplus or deficit. These numbers match the Income and Expenses summary cards on the Dashboard.

**Spending buckets**

Wooden-bucket SVG icons represent each expense category. The fill level and color reflect how much of the category's monthly budget has been used: sage (under budget), amber (approaching the limit), rust (close to or at limit), and red (over). Click any bucket to open the **budget editor** for that category.

<p align="center">
  <img src="docs/screenshots/23-budget-bucket-editor.png" alt="Budget bucket editor showing this month's spending" width="800" />
</p>

**To-assign counter**

The header shows how much monthly income is still unbudgeted. Assign it to categories until the counter reaches zero for true zero-based budgeting. Categories with expenses but no budget set appear as dashed **unbudgeted pills** below the bucket grid.

**Donut chart**

Each slice represents a category. Click a slice to filter the category breakdown below it to that category only. Click the center or the same slice again to clear the filter.

**Category breakdown**

Horizontal bars showing each category's monthly total as a proportion of total spending, colored with each category's assigned color.

**Cash flow bar**

A single bar that compares total income to total spending at a glance.

If total spending exceeds income, your mascot slides in automatically with a heads-up about the deficit.

**Spending category ledger**

When you open the budget editor (by clicking a bucket or a breakdown bar), a **spending ledger** appears below the category's budget form if you have recorded payments in that category. The ledger is wider than the standard modal to comfortably display four columns:

| Column | Content |
|---|---|
| Date / freq | When the charge occurred or the expense frequency |
| Item name | The expense description or merchant name — **click to navigate to the transaction** |
| Source | The bank account or debt card it came from — **click to navigate to the account** |
| Amount | The dollar amount |

Rows are grouped into **Expenses** (recorded expense payments from bank accounts) and **Charges** (card charges from debt accounts).

**Navigating from the ledger to a transaction**

- **Click the item name** — the modal closes, the app navigates to the Accounts or Debt page, opens the ledger or charges panel for the relevant account, and highlights the exact transaction with a **golden pulse** (a glowing ring that fades over two seconds).
- **Click the source pill** — the modal closes, the app navigates to the account or debt page, and highlights the account or card row itself with the same golden pulse.

This makes it easy to cross-reference a budget total with its underlying transactions without manual searching.

---

### Debt

<p align="center">
  <img src="docs/screenshots/09-debt.png" alt="Debt page" width="800" />
</p>

**Adding a debt account**

1. Click **+ Add Account**.
2. Choose the account type: **Credit Card**, **Mortgage**, **Vehicle Loan**, **Medical**, or **Personal / Student Loan**.
3. Enter: name, current balance, APR, credit limit (for cards), original principal and term (for mortgages, vehicle loans, and personal loans).
4. Set the minimum payment: **fixed dollar amount** or **percentage of balance** (the app enforces a $25 floor on percentage minimums).
5. Choose a payment cycle (weekly, biweekly, semi-monthly, monthly) and an optional due day.
6. Optionally enter a **0% introductory APR end date** — the app tracks it separately so you know exactly when the promotional rate expires.
7. Optionally enter the card's **billing portal URL** — the link icon on the debt card row opens it directly.
8. Click **Save**.

**Amortization schedule**

Expand any debt card to see the full date-stamped payment schedule: period number, payment amount, principal applied, interest charged, and remaining balance. The footer shows the total amount paid and total interest over the payoff period.

**Payoff strategies**

Switch tabs above the card list to change the payoff order:

- **Avalanche** — targets the highest-APR balance first. Saves the most money overall.
- **Snowball** — targets the smallest balance first. Produces quick psychological wins.
- **Custom** — drag cards into any order you prefer.

When the current focus card reaches zero, its entire payment rolls over to the next card automatically — no money leaves your budget.

**What-if grid**

Enter an extra monthly payment in the grid field. The table instantly shows how many months sooner each card pays off and how much interest you avoid — compared to paying minimums only.

**Payoff milestone timeline**

Below the strategy tabs, a timeline shows the projected payoff date for every debt account under the current strategy, with a final **debt-free date** when the last account reaches zero. The timeline updates in real time as you switch strategies or change the extra payment amount. Use the **payoff horizon slider** (1–30 years) above the timeline to zoom in or out on the view.

**Recording a payment**

1. Click **Record Payment** on a debt card.
2. Enter the payment amount and date. Check **Extra payment** if this is beyond the minimum.
3. Click **Save**. The balance and amortization schedule update, and the notifier refreshes.

<p align="center">
  <img src="docs/screenshots/21-debt-pay-modal.png" alt="Make a Payment dialog" width="800" />
</p>

Payment history is stored per card and shown in a calendar-style grid — each month's payment tiles with the amount and a ✓ confirmation:

<p align="center">
  <img src="docs/screenshots/22-debt-pay-history.png" alt="Payment history expanded on a debt card" width="800" />
</p>

**Logging a card charge**

1. Click **+ Charge** on a credit card.
2. Enter the merchant name, amount, and date.
3. Charges appear in the **Top Merchants** chart on the Reports page.

**Reminders on debt accounts**

A **Reminders** section appears at the bottom of the Add and Edit debt account forms. Click **+ Add reminder** to attach a custom notification — for example, a monthly reminder on your payment due date, or a one-time reminder to call about an introductory APR expiry. All linked reminders are also manageable from **Settings → Reminders**.

**Debt payoff celebrations**

When you record a payment that brings a **single card** to zero, a full-screen overlay plays with dancing mascots and confetti. When **every debt account** reaches zero, a separate all-debt-free celebration fires — Buck and Penny together, with a debt-freedom message unique to the occasion.

---

### Reports

<p align="center">
  <img src="docs/screenshots/10-reports.png" alt="Reports page" width="800" />
</p>

**Setting the date range**

Use the preset buttons — **This Week, This Month, Last Month, Last 3 Mo., Last 6 Mo., This Year, Last Year, All Time** — or click **Custom** and enter start and end dates.

**Report cards at a glance**

| Card | Use it to |
|---|---|
| KPI chips | Get one-glance totals: spending, income, net cash flow, savings rate |
| Leaky Bucket | See spending as water draining from a bucket — scrub through months to see which categories and days are draining the most |
| Spending Over Time | See which months were expensive and which categories drove it |
| By Category | Find where your money actually went |
| Top Merchants | Identify your biggest card-charge destinations |
| Income vs Spending | Compare income and expenses side by side, month by month |
| Spending by Day | Find which day of the week costs you the most |
| Biggest Transactions | See your 12 largest individual expenses and charges |
| Card Balance Trend | Check whether your card balances are rising or falling |
| Spending by Week of Month | See if your paycheck timing is shaping your spending |
| Recurring vs One-time | See how predictable your monthly spending is |
| Common Overage Offenders | Audit bills that regularly exceed their monthly threshold |

**Common Overage Offenders**

This card is always all-time data regardless of the date range, because seasonal patterns need multiple months of history to be meaningful. Each bill shows a grid of colored month cells: green ✓ when under threshold, red with the overage amount when over. Bills with 3 or more overages get a 🔥 marker. If 2 or more overages cluster in the same season (summer, winter, spring, or fall), a callout appears: "☀️ tends to spike in summer — plan ahead."

---

### What If? (Scenario Films)

The What If? page lets you model hypothetical changes — a new job, a car payment, a cross-country move — and see the budget impact without touching your real data.

**Creating a scenario film**

1. Click **+ New Film**.
2. Give it a descriptive name (e.g. "Buy a house" or "Freelance side income") and an optional note. Choose a color to identify it.
3. Click **Create**. The film opens in expanded view.

**Adding items to a film**

Inside an expanded film card:

- Click **+ Income** to add a hypothetical income change. Enter a description, amount, and frequency (or one-time lump sum).
- Click **+ Expense** to add a hypothetical recurring or one-time expense.
- A **Net monthly effect** summary updates as you add items. One-time items are tracked separately.
- Click ✕ on any item row to remove it.

**Activating a film**

Toggle the switch on a film card to overlay it on your real budget. The **projection panel** appears at the top of the page showing:

- Adjusted income and expenses (with deltas vs. your baseline).
- Adjusted surplus.
- A verdict: **✅ Yes** (surplus ≥ $200/mo), **⚠️ Tight** ($0–$200 left), or **❌ This would put you in the red**.

**Layering multiple films**

Toggle several films active at once. The projection panel combines all active films and shows the aggregate effect. Each film's name and color appear in the panel header.

**Managing films**

- Click a card header to expand or collapse a film.
- Click **Rename** to change the film name.
- Click **Delete film** to remove it permanently. Your real data is never modified by films.

---

### Learn (Financial Education)

The Learn page provides plain-language financial education with interactive calculators that pull from your real budget data where available.

**Debt Basics tab**

- **What is APR?** — explains Annual Percentage Rate and how compounding works against you, with fixed examples ($1k and $5k at 22% APR).
- **The Minimum Payment Trap** — interactive calculator: enter any balance, APR, minimum payment percentage, and optional extra monthly payment. Instantly see payoff time and total interest, plus savings from the extra payment.
- **Avalanche vs. Snowball** — side-by-side comparison of both strategies, with a link to run your real numbers on the Debt page.

**Budgeting tab**

- **50/30/20 Rule** — explains the guideline (50% needs, 30% wants, 20% savings/debt). If you have income and expenses entered, a stacked bar shows your actual percentages alongside the guideline.
- **Emergency Fund** — explains the 3–6 month target. Interactive: choose the number of months and see the target dollar amount (pre-filled with your actual monthly expenses if available).
- **Zero-Based Budgeting** — explains the "give every dollar a job" approach.

**Credit tab**

- **Credit Utilization** — interactive: enter a balance and limit to see your utilization percentage and what it would take to reach 30% or 10%.
- **What Makes a Credit Score?** — FICO factor breakdown with percentage bars for each factor.
- **Balance Transfers** — explains 0% promo offers, transfer fees, go-to rates, and the balance-transfer trap.

**Saving & Investing tab**

- **Compound Interest** — a dual-line chart showing $5,000 growing at 8% (investment) vs. festering at 22% APR (unpaid debt). Drag the years slider (1–30) to see the divergence over time.
- **Why Your Savings Rate Matters More Than Returns** — explains why the amount you save each month has more leverage than chasing return percentages.
- **The Opportunity Cost of Debt** — explains why paying off high-interest debt is the best guaranteed return available.

**Privacy & Security tab**

- **Public & Private Keys Basics** — plain-language explanation of asymmetric cryptography: what a key pair is, why the public key is safe to share, and why the private key is the only thing that can unlock your data.
- **How Financial Finger Uses Your Keys** — step-by-step walkthrough of the 4-stage flow: key generation → vault key creation → session unlock → per-record encryption. Explains what is stored where and why the extension can never recover your data without the private key.
- **Passphrases vs. Passwords** — explains why a strong passphrase protects your private key, how to choose one, and why length beats complexity.
- **The Same Ideas Everywhere** — shows how the same public-key concepts underlie HTTPS, SSH, Signal, and code signing — so users who later encounter PGP elsewhere already understand the mental model.

---

### Settings

<p align="center">
  <img src="docs/screenshots/11-settings.png" alt="Settings page" width="800" />
</p>

| Setting | How to use it |
|---|---|
| **Mascot** | Click Buck or Penny to switch; type in the name field to rename your mascot (up to 24 characters). Changes apply immediately. |
| **Household name** | Edit the field and save. Updates the title on the Dashboard (up to 48 characters). |
| **Members** | Click **+ Add Member** to add a household member and choose their avatar type (adult male/female, baby boy/girl, kid boy/girl, teen boy/girl). Click the trash icon to remove a member — a confirmation dialog warns that all assigned income sources will also be removed. |
| **Theme** | Choose Light, Dark, or Auto (follows your OS preference). Applies immediately without a reload. |
| **Currency** | Choose your display currency from 20 options. The currency symbol, decimal precision, and formatting apply everywhere money is shown in the app. |
| **Reminders** | View, add, edit, and delete all custom bell notifications. Each card shows the label, when the reminder fires, and active/inactive status. Reminders can also be created and deleted from within the Add/Edit forms on the Income, Expenses, Debt, and Accounts pages — they all appear here for centralized management. |
| **Security & Keys** | View your PGP key fingerprint. Click **Export public key** to copy the armored public key to clipboard or save it as a `.asc` file. Click **Lock vault** to end the current session without closing the browser — useful when stepping away from a shared computer. |
| **Sharing keys** | Store a household member's or spouse's public key here so you can quickly encrypt exports to them without pasting their key every time. |
| **Export** | Encrypts your database and downloads a `.ffx` file. You choose a recipient: a saved sharing key, a one-time paste, or your own key (for a personal backup). Only the holder of the matching private key can open the file. |
| **Import** | Decrypts a `.ffx` file shared from another Financial Finger installation using your private key and passphrase. Choose **Merge** to add incoming records alongside your existing data, or **Replace** to wipe your database first. |
| **Import Rules** | View and manage the auto-match patterns that the CSV import wizard has learned. Toggle a rule off to stop auto-applying it on future imports, or delete it entirely. |
| **Snapshots** | Lists automatic and manual point-in-time snapshots of your data. Click **Snapshot now** to capture immediately. Click **Restore** on any row to roll back to that point — your current data is safety-snapshotted first, then the selected snapshot is applied, and the app reloads. See [Snapshots](#snapshots). |
| **Danger zone** | Wipes the vault completely. All data, settings, and the vault key are deleted. The extension returns to the first-run setup wizard. This is permanent and irreversible. |
| **Break Glass** | Emergency direct-access panel. Opens the Break Glass data browser where you can read, edit, or delete any raw record in the database. Also contains the Orphan Scanner for finding records with broken FK references. See [Troubleshooting → Break Glass](#break-glass) for full details. |

---

### Data Sharing

Financial Finger is built for households — and households don't always sit at the same computer. If you and a partner, spouse, or co-parent each have the extension installed on separate machines, data sharing lets you keep both installations in sync without ever uploading anything to a server.

#### What is a public key?

When you went through setup, Financial Finger generated a **PGP key pair** — two mathematically linked keys:

- **Public key** — safe to hand out to anyone. Think of it as a padlock: anyone can snap it shut to lock a message, but only you can open it.
- **Private key** — stays with you, stored in your password manager. It is the only key that can unlock something your public key locked.

When Person A wants to send their database to Person B, A encrypts the export with **B's public key**. The resulting `.ffx` file is unreadable to anyone in transit — even A cannot decrypt it. Only B's private key, combined with B's passphrase, can open it.

This is why Financial Finger asks for a recipient's public key before exporting, and asks for your own private key when importing — each step is exactly what the math requires.

#### One-time setup: exchanging public keys

Before the first sync, each person needs the other's public key.

**Person A** (sending machine):
1. Go to **Settings → Security & Keys**.
2. Click **Save file…** next to Export public key. This saves `finance-finger-public-key.asc` — a plain text file that is completely safe to share. Email it, send it over chat, copy it to a USB drive. It is not a secret.

**Person B** (receiving machine):
1. Go to **Settings → Data Sharing**.
2. Click **+ Add person**.
3. Paste Person A's public key (or click **Choose file…** to load the `.asc` file directly).
4. Give Person A a label (e.g. "Alex") and click **Add**. The key is now saved as a contact.

Repeat in the opposite direction so each person has the other's public key saved.

> If you use Financial Finger on two computers yourself (rather than two people), you only need to export to your own key for backup. When importing on the second machine you will still need your private key and passphrase — you must have moved those to the second machine beforehand.

#### Exporting your database to a household member

1. Go to **Settings → Data Sharing**.
2. Click **Export…**.
3. Select the household member from your saved sharing keys (e.g. "Alex") or choose **One-time key…** to paste a key without saving it.
4. Click **Export & Download**. A `.ffx` file is saved to your Downloads folder.
5. Send the file to the other person — email, shared cloud folder, USB drive, whatever you use. The file is fully encrypted; it does not need to travel over a secure channel.

The exported file includes: **members, income sources, expense categories, expenses, debt accounts, and scenarios**.

> Bank accounts, payment history, card charges, and individual expense payment records are **not included** in an export. These are transactional records tied to a specific installation. The export carries the structural and budget data — the things you set up once and want both people to agree on.

#### Importing a file from a household member

When you receive a `.ffx` file:

1. Go to **Settings → Data Sharing**.
2. Click **Import…**.
3. Click **Choose file…** and select the `.ffx` file, or paste its contents into the text area.
4. In **Your private key**, paste your own private key (the one you stored in your password manager during setup), or load it from a file.
5. Enter your **passphrase**.
6. Choose an import mode:
   - **Merge** *(default)* — Incoming records are added to or updated in your database. Records you have locally that aren't in the file are kept. This is the right choice for regular syncs.
   - **Replace** — Your entire database is wiped first, then the incoming records are written. Use this when you want to completely replace your local data with the sender's copy. There is no undo.
7. Click **Decrypt & Import**.

The app reloads after a successful import and shows a count of records written.

#### Recommended workflow for a shared household

Designate one installation as the **primary** and use it for day-to-day data entry — adding expenses, recording payments, logging income changes. The other installation stays current by periodically importing from the primary.

A practical cadence:

- **Weekly or monthly**: Primary exports → sends the `.ffx` to the other person → other person imports with **Merge**.
- **After a major setup change** (new household member, new debt account, category restructure): export immediately so both machines stay in agreement on structure.
- **Quarterly or annually**: Both people export to their own key as a personal backup, stored somewhere separate from the machine.

If both people enter data independently on their own machines, merge mode will combine records from both sides on import. Because records use unique IDs, merge will not create duplicates for records already shared. It will, however, bring in records the other person entered that you don't have yet — which is the point.

---

### Help

Financial Finger includes a built-in **Help** page accessible from the navigation sidebar. It covers every section of the app with plain-language explanations and examples — no internet connection required.

The Help page is organized into **12 topic tabs**:

| Tab | What it covers |
|---|---|
| **Setup & Security** | The setup wizard, key generation, vault unlock, and what to do if you lose access |
| **Dashboard** | Reading summary cards, financial health chips, payment reminders, and the activity widget |
| **Income** | Adding members and income sources, pay types, frequencies, and month navigation |
| **Accounts** | Bank account types, balance display, ledger, and balance projection |
| **Expenses & Bills** | Categories, recurring vs. one-time, bill tracking, thresholds, and the Mark Paid flow |
| **Calendar** | Grid layout, chip types, paint tool, memos, and marking payments |
| **Budget** | Spending buckets, to-assign counter, donut chart, and zero-based budgeting |
| **Debt** | Adding debt accounts, amortization, payoff strategies, what-if grid, and recording payments |
| **Reports** | Date range presets, all report cards, and Common Overage Offenders |
| **What If?** | Creating scenario films, adding items, activating films, and layering scenarios |
| **Learn** | Overview of the financial education tabs and interactive calculators |
| **Settings & Data** | Mascot, theme, currency, security, data sharing, import rules, snapshots, and Break Glass |

Help pages are context-sensitive — some pages in the app include a **?** icon that deep-links directly into the relevant Help tab so you can read the explanation without losing your place.

---

## Common Scenarios

### Starting from scratch

> *"I've just installed the extension and don't know where to begin."*

1. Complete the six-step setup wizard. Generate a PGP key pair, save the private key to a password manager or print it, name your household, and pick a mascot.
2. Go to **Income** — add each person in your household, then add their income sources with the exact frequency they're paid (biweekly if that's reality, not monthly).
3. Go to **Accounts** — add your checking and savings accounts. This lets you link income sources to the accounts they deposit into and see a projected balance for each account.
4. Go to **Expenses** — create categories (Housing, Food, Utilities, Transportation), then add every recurring bill with a due day so the extension can track payment status.
5. Go to **Debt** — add every credit card, vehicle loan, personal loan, and mortgage with current balance, APR, and minimum payment.
6. Open **Budget** — the donut and summary bar now reflect your full financial picture. If the surplus is negative, look for recurring expenses to cut or reclassify.
7. Come back to the Dashboard throughout the month to log one-time income and expenses as they happen.

---

### Tracking a new credit card

> *"I just opened a new credit card (or transferred a balance onto one)."*

1. Go to **Debt → + Add Account → Credit Card**.
2. Enter the current balance, APR, credit limit, minimum payment type, and due day.
3. Open the **Avalanche** or **Snowball** tab and review the payoff schedule.
4. Try the **What-if grid**: enter $50 extra per month. See how many months and how many dollars you save.
5. Return to the Dashboard — the credit utilization chip updates to reflect the new card.
6. Head to **Learn → Debt Basics → What is APR?** to see the exact math working against you if you carry the balance.

---

### Planning a big purchase

> *"I want to buy a car / take a vacation / renovate the kitchen — can I actually afford it?"*

1. Go to **What If? → + New Film**. Name it after the purchase (e.g. "New car").
2. Add the new recurring expense (monthly car payment) under **+ Expense**. Add any associated income change (e.g. selling the old car) under **+ Income** as a one-time amount.
3. Toggle the film **active**. The projection panel tells you immediately: surplus comfortable, tight, or in the red.
4. Create a second film — a "stretch" scenario — to model the same purchase plus a modest raise or a cut to another expense category. Layer both films active to see the combined effect.
5. When you've made the decision, delete the films. Your real budget data is never touched.

---

### Monthly bill review

> *"I want to make sure I haven't missed any payments this month."*

1. Open the **Calendar** page. Today is highlighted; any overdue bills show in red on the grid.
2. Check the summary bar chips at the top — address Past Due items first.
3. Click **Record Payment** on each bill as you take care of it. Enter the actual amount paid for variable bills.
4. Return to the **Dashboard** — the Payment Reminders card disappears (or shrinks) as you mark things paid.
5. At the end of the month, open **Reports → Common Overage Offenders** to see which bills regularly cost more than planned.

---

### Linking expense payments to a credit card

> *"I pay most of my bills with a credit card — how do I track that without double-counting?"*

1. Go to **Debt → + Add Account → Credit Card** and add the card if you haven't already. This is required before any expense can be assigned to it.
2. Head to **Expenses**. When adding or editing a recurring bill, choose the card from the **Charge to card** dropdown. The expense is now linked — future payments will automatically create a charge entry on that card.
3. When a bill is due, click **Record Payment** on the expense row. A dialog opens where you can enter the actual amount paid, the date, and confirm (or change) which card was charged.
4. Submitting the dialog marks the bill paid for the month and posts a charge to the card's ledger in **Debt**. No manual double-entry needed.
5. For expenses that are always the same amount (streaming subscriptions, cable), check **Fixed amount** in the expense form — the actual payment will pre-fill automatically and the amount field will be read-only in the payment dialog.
6. For bills charged by your bank automatically, check **Auto-pay** — Finance Finger will show an Auto-pay badge instead of a Record Payment button, and the bill won't appear in payment reminders.

> **Tip:** If you open Record Payment and there's no card dropdown, you haven't set up any credit cards yet. Click **Add one in the Debt section →** in the dialog to navigate there directly.

---

### Syncing data with a household member on a separate computer

> *"My partner and I both have Financial Finger installed but on different machines. How do we keep our data in sync?"*

**One-time setup (do this once per pair of computers):**

1. On each machine, go to **Settings → Security & Keys** and click **Save file…** next to Export public key. Email or share the resulting `.asc` file with the other person.
2. On each machine, go to **Settings → Data Sharing → + Add person** and load the other person's `.asc` file. Give them a label and click **Add**.

You now each have the other's public key saved as a contact. You will not need to repeat this step.

**Regular sync (whoever is most up-to-date sends to the other):**

1. The person with the more current data goes to **Settings → Data Sharing → Export…**.
2. Select the other person from the saved contacts list.
3. Click **Export & Download**. Send the `.ffx` file.
4. The recipient goes to **Settings → Data Sharing → Import…**, loads the `.ffx` file, pastes their private key and passphrase, leaves the mode on **Merge**, and clicks **Decrypt & Import**.

> **Merge is almost always the right choice.** Replace mode deletes everything on the receiving machine before writing the incoming data — use that only when you want a full mirror, not a sync.

> **Bank accounts, payment history, card charges, and individual expense payment records are not included in an export.** Those are transactional records specific to each machine. The export covers the structural data: members, income sources, expense categories, expenses, debt accounts, and scenarios.

---

### Paying down debt aggressively

> *"I have multiple credit cards and I want a coordinated payoff plan."*

1. Confirm all cards are entered in **Debt** with accurate balances, APRs, and minimums.
2. Switch to the **Avalanche** tab for the cheapest path, or **Snowball** for the fastest psychological wins.
3. Use the **What-if grid** — try $100, $200, and $300 in extra monthly payments to find the highest amount your budget can support.
4. Cross-check that amount against your **Budget** page surplus to confirm you actually have it available.
5. Open **What If?** to model "what if I cancel two streaming subscriptions and redirect $30/month to debt?" Add those expense cuts as a film and layer it onto your budget to see the compounded payoff acceleration.
6. Record each payment on the Debt page. When a card hits zero, enjoy the celebration — then watch the rolled-over payment start chewing through the next one.

---

## Month in the Life

A complete walkthrough using every feature of Financial Finger across a typical month.

### One time: first-run setup

1. Open the extension for the first time. The six-step setup wizard launches automatically.
2. **Welcome** — read the privacy overview: all data is encrypted at rest with your own PGP key; nothing leaves your device unencrypted.
3. **Mascot** — choose Buck (cowboy pig) or Penny (sunflower-hat pig). Optionally rename them.
4. **Keys** — click **Generate** to create an ECC curve25519 PGP key pair. Enter a name, email, and passphrase.
5. **Save your key** — copy the private key to your password manager and/or print it. It is shown exactly once and never stored by the extension.
6. **Profile** — enter your household name (this appears as the Dashboard title).
7. **Done** — the vault is created. You land on the Dashboard.

### First week: build your baseline

**Income**
Go to **Income** and add each household member. For each person, add their income sources at the frequency they actually get paid — biweekly if that's reality, not monthly. Toggle off any source that is currently inactive (seasonal job, parental leave).

**Accounts**
Go to **Accounts** and add your checking and savings accounts. Enter a starting balance if you know it. Then link each income source to the account it deposits into (edit the source on the Income page and select the account). The Accounts page will then project your running balance month by month.

**Expenses**
Go to **Expenses** and create your expense categories. Add every recurring bill with its due day. Set a monthly threshold on any bill that varies (electricity, water, gas) so the extension can warn you when an actual payment runs high.

**Debt**
Go to **Debt** and add every credit card, vehicle loan, personal loan, and mortgage. Enter the current balance, APR, minimum payment, and due day. Add your credit limit for cards so the utilization chip on the Dashboard works correctly.

**Budget check**
Open the **Budget** page. Review the summary bar surplus. If it's negative, identify the category or expense driving it in the donut chart. Decide whether to cut something or accept the shortfall this month.

**Settings**
Go to **Settings** and set your preferred theme. Confirm the mascot name. Export an initial encrypted vault backup and save it somewhere safe.

### Every day: quick check

1. Click the extension toolbar icon. If the badge shows **!**, open the Dashboard.
2. Read the **Payment Reminders card** — red rows are past due, amber rows are due soon. Click any row to jump to the debt or bill that needs attention.
3. If Buck or Penny mosey in with a **briefing**, read through the itemized alert list. Click any item to navigate directly to that page while the mascot stays visible.
4. Log any one-time expenses or windfall income in the **Monthly Activity** widget at the bottom of the Dashboard before you forget.
5. Click the gold **tip widget** at the bottom of the Dashboard to get today's financial tip from your mascot.

### When a bill is due

1. Find the bill on the **Calendar** or **Expenses** page — ⏰ due soon or ⚠ past due.
2. Click **Mark Paid**. Enter the actual amount paid.
3. Select the billing cycle the payment covers using the pill buttons. If you're catching up on a missed previous month, check **Covers additional billing cycle** to record both in one go.
4. If the amount is over your threshold, the inline overage warning shows immediately. Note it — if this is the second overrun in a row, the mascot will name the pattern and suggest adjusting the threshold.
5. The chip on the Calendar updates to ✓ Paid. The notifier refreshes. If that was the last open alert, the mascot dismisses itself automatically.

If a bill shows a gold **⚠ Sync issue** badge instead of a normal status, click **↺ Reset Status** on the row to clear the stale paid date. For a full audit, open **Break Glass → Orphan Scanner** — the scan runs automatically when you switch to the tab and will surface any orphaned card charges alongside the stale date.

### When you make a debt payment

1. Go to **Debt** and click **Record Payment** on the target account.
2. Enter the amount and date. Mark it as an extra payment if it's above the minimum.
3. Watch the amortization schedule update. Open the **Dashboard** — the credit utilization chip and DTI chip update to reflect the new balance.
4. Open **Reports → Card Balance Trend** to see your payoff trajectory.

### Start of month (1st–5th)

1. Open the **Calendar** to see which bills land early in the month.
2. Go to **Income** and confirm all sources are still accurate. Toggle off any that paused; add any new ones.
3. Check **What If?** — deactivate scenario films that no longer apply. Create a new film for any expected change this month (a planned purchase, a new subscription).

### End of month: review and plan

1. Open **Reports** and set the range to **This Month**.
2. Check the **KPI chips** — actual savings rate, total spending, net cash flow.
3. Look at **By Category** — which category ran high? Did anything surprise you?
4. Check **Common Overage Offenders** — any bills with a trend worth adjusting the threshold for?
5. Open **Insights → Budgeting → 50/30/20** — the bar chart now reflects your actual spending split. How close are you to the guideline?
6. Open **Debt → What-if grid** and add $25 to last month's extra payment target. See how much sooner the payoff date moves.
7. Go to **Settings → Export** and download an encrypted backup of this month's vault. Store it somewhere safe.

### Quarterly: big-picture planning

1. Open **What If?** and create films for any major changes in the next quarter — a raise, a planned vacation, a new recurring expense.
2. Layer all the relevant films active at once. Confirm the combined verdict is ✅ or ⚠️ (not ❌) before committing.
3. Open **Insights → Saving & Investing → Compound Interest** and drag the slider to 10 years. Look at the gap between what your debt is costing you and what the same money would earn invested. Use the visual as motivation to accelerate payoff.
4. Open **Reports → All Time** and look at the **Card Balance Trend**. If the slope is flat or rising, revisit the payoff strategy on the **Debt** page.

---

## Importing transactions

Financial Finger can import bank statements and credit card statements from any delimited text file (CSV, TSV, pipe-separated, etc.). All data stays local — no cloud upload, no third-party connection required.

### Supported file formats

| Format | Typical extension | Notes |
|---|---|---|
| Comma-separated | `.csv` | Most US banks |
| Semicolon-separated | `.csv` | Common in European bank exports |
| Tab-separated | `.tsv`, `.txt` | Some accounting software |
| Pipe-separated | `.txt`, `.dat` | Legacy bank formats |

Maximum file size: **20 MB**. Files above this limit should be split into smaller date ranges before importing.

The delimiter is auto-detected from the first few lines. You can override it manually in both Step 1 and Step 2 of the wizard.

### The import wizard

**Opening the wizard:**
- **Bank account** — go to **Accounts**, find the account row, click the **⬆** icon.
- **Credit card** — go to **Debt**, expand the card, click **⬆ Import CSV** in the charges panel header.

**Step 1 — Load file:** Drag a file onto the drop zone or click to browse. The detected delimiter is highlighted automatically. A raw text preview appears so you can confirm the file looks right before proceeding. You can also adjust the quote character (double, single, or none) if your file uses non-standard quoting.

<p align="center">
  <img src="docs/screenshots/12-import-step1.png" alt="Import wizard — Step 1: load file" width="800" />
</p>

**Step 2 — Map columns:** The full file is rendered in a scrollable table. Each column header has a dropdown — assign a role to every column you want to import:

| Role | Used for |
|---|---|
| `Date` | Transaction date (required) |
| `Description` / `Merchant` | Payee or memo |
| `Amount` | Single amount column |
| `Debit` | Money-out column (when your bank splits debit/credit) |
| `Credit` | Money-in column |
| `Note` | Free-text note to attach to the record |
| `(skip)` | Ignore this column |

For bank accounts, if your export shows debits as **positive** numbers, enable **Invert sign** before proceeding. You can re-parse with a different delimiter here without going back to Step 1.

<p align="center">
  <img src="docs/screenshots/13-import-step2.png" alt="Import wizard — Step 2: column mapping" width="800" />
</p>

**Step 3 — Row-by-row review:** The wizard shows one transaction at a time. For each you choose what it represents:

- **Expense payment** — link to an existing expense, or create one inline
- **Card / debt payment** — link to a debt account to update its balance
- **Transfer** — a move between two of your bank accounts
- **Income / deposit** — credits that aren't transfers
- **Skip / uncategorized** — import without categorizing

The wizard **pre-selects the most likely category** for you: it checks your repeat-transaction rules first, then matches the description against existing expense and debt account names, and finally applies keyword inference (e.g. "Payroll" → Income, "Zelle" → Transfer, "Web Pmt" → Debt payment). Override any pre-selection before confirming.

- **Inline edit:** click **✏ Edit** on any transaction card to correct the date, description, or amount before saving.
- **Navigation:** Prev / Confirm / Skip, or "Skip remaining →" to jump to the summary.
- **Re-map columns:** click this footer button to return to Step 2 without losing your reviewed rows (useful if you spot a mapping error mid-review).
- **Repeat detection:** after confirming the same pattern several times, the wizard prompts to create an auto-manage rule for future imports.
- **Backdrop click protection:** the modal cannot be closed by clicking outside it — use the Cancel button or ✕ to exit deliberately.

<p align="center">
  <img src="docs/screenshots/14-import-step3.png" alt="Import wizard — Step 3: row-by-row review" width="800" />
</p>

**Step 4 — Snapshot & import:** Review the summary (row count, date range, totals, categorization breakdown). A duplicate warning appears if this file was imported before. Click **Take snapshot & import** — a snapshot is saved automatically before any data is written.

<p align="center">
  <img src="docs/screenshots/15-import-step4.png" alt="Import wizard — Step 4: confirm and snapshot" width="800" />
</p>

After importing, the account's transaction ledger shows every row you confirmed, with a running balance:

<p align="center">
  <img src="docs/screenshots/16-import-ledger.png" alt="Account ledger after import" width="800" />
</p>

### Column mapping

Column roles are auto-detected from common header names (`Date`, `Amount`, `Debit`, `Credit`, `Description`, `Merchant`, `Memo`, `Payee`, `Note`, etc.). If your file uses non-standard names, change each dropdown manually. The table updates live when you switch the delimiter.

Rows where the **date or amount cannot be parsed** are skipped. The count of skipped rows is shown in the summary so you know exactly what was left out.

**Supported date formats:**

| Format | Example |
|---|---|
| ISO 8601 | `2026-09-06`, `2026/09/06` |
| US | `09/06/2026`, `9/6/26` |
| US with dashes | `09-06-2026` |
| Compact ISO | `20260906` |
| Long month | `Sep 6, 2026`, `September 6, 2026` |
| Day-month-year | `6 Sep 2026`, `6-Sep-2026` |

**Supported amount formats:**

| Format | Example |
|---|---|
| Plain decimal | `1234.56` |
| With thousand separator | `1,234.56` |
| With currency symbol | `$1,234.56`, `€1234.56` |
| Accounting negative | `(1,234.56)`, `($99.50)` |
| European decimal comma | `1.234,56` |

### Duplicate detection

Every import is fingerprinted with a **SHA-256 checksum** of the raw file content. If you try to import the same file again (even against a different account), the wizard shows a yellow warning banner with the date of the previous import. You can still proceed — the warning is informational only.

Import records are stored in your encrypted vault and included in snapshots, so the deduplication history survives vault restores.

### Snapshot and rollback

Before any data is written, the wizard takes a **mandatory snapshot** named:

```
Import - [Account Name] - Sep 6, 2026 3:00 PM
```

This snapshot:
- Is saved to **Settings → Snapshots** in a dedicated **Import snapshots** subsection
- Is **never auto-pruned** (regular snapshots are kept for 24 hours with a minimum of 5; import snapshots persist until you delete them manually)
- Can be restored at any time to undo the import entirely

To roll back an import: go to **Settings → Snapshots**, find the relevant import snapshot (labeled `Import - [Account Name] - ...`), and click **Restore**.

---

## Snapshots

Financial Finger takes an automatic point-in-time snapshot of your data every 30 minutes in the background. Snapshots let you roll back to a known-good state if you accidentally delete data, run a bad import, or just want to undo a batch of changes.

### How snapshots work

- The background service worker captures a copy of every encrypted record in your database and stores it locally in IndexedDB under a `snapshots` store.
- Snapshots are taken automatically every 30 minutes once setup is complete, and manually on demand.
- Retention policy: snapshots older than **24 hours** are pruned. The **5 most recent** snapshots are always kept regardless of age.
- Snapshot data is stored as the same encrypted blobs that protect your live data — no additional encryption or decryption is needed to take or prune a snapshot.

### Taking a manual snapshot

<p align="center">
  <img src="docs/screenshots/17-snapshots.png" alt="Snapshots in Settings" width="800" />
</p>

Go to **Settings → Snapshots** and click **Snapshot now**. This is useful before:
- Running a large data import
- Making bulk edits
- Experimenting with scenarios you might want to undo

### Restoring from a snapshot

1. Go to **Settings → Snapshots**.
2. Find the snapshot you want to restore (newest first; each row shows its label and timestamp).
3. Click **Restore**.
4. Confirm the dialog. A safety snapshot of your current data is saved automatically before the restore runs.
5. The app reloads. Re-enter your private key and passphrase to unlock the vault and see your restored data.

> **Note:** Restoring replaces all current data with the snapshot contents. The auto-saved safety snapshot lets you reverse a bad restore by immediately restoring the "Before restore" entry that appears at the top of the list.

---

## Troubleshooting

### Break Glass

The **Break Glass** tool is an emergency access panel that gives you direct read, edit, and delete access to every raw record in your encrypted database. It is intended for situations where something went wrong at the data level and the normal UI cannot fix it.

**When to use it**

- A record contains a bad value that the app UI will not let you correct
- You need to verify a specific field (e.g. a linked ID) while debugging unexpected behavior
- You want to manually inspect what is actually stored vs. what the UI is showing
- You see a **⚠ Sync issue** badge on a bill (stale paid-date) and want to scan for related orphaned charges in the same operation

**Opening Break Glass**

1. Go to **Settings** and scroll to the bottom.
2. Click **🔧 Open Break Glass**. Your mascot will appear with a warning — this tool has no guardrails and no undo after saving.
3. Type **`break glass`** in the confirmation input, then click **"I hear ya — open 'er up"**.

<p align="center">
  <img src="docs/screenshots/24-break-glass-warning.png" alt="Break Glass confirmation warning" width="800" />
</p>

**Data Browser**

The left panel shows a store selector (Members, Income Sources, Expenses, Debt Accounts, etc.) and a list of every record in that store. Click any record to open it in the detail pane on the right.

<p align="center">
  <img src="docs/screenshots/25-break-glass-browser.png" alt="Break Glass data browser" width="800" />
</p>

| Mode | How to enter | What it does |
|---|---|---|
| **View** | Click a record | Shows all fields with human-readable labels and formatted values — dates rendered as readable timestamps, currency as `$X.XX`, percentages as `XX.XX%` |
| **Edit** | Click **Edit** | Opens a per-field form with type-appropriate controls — a date/time picker for epoch timestamps, a dollar input for currency fields, a checkbox for booleans |
| **Edit Raw JSON** | Click **Edit Raw JSON** | Opens the raw JSON in a textarea — for edge cases where you need to change a field the field editor does not surface, or paste in a corrected blob |

<p align="center">
  <img src="docs/screenshots/26-break-glass-editor.png" alt="Break Glass field editor for a record" width="800" />
</p>

UUID reference fields (like `memberId` on an income source) are rendered as **clickable links** in view mode. Clicking one navigates directly to the referenced record in the correct store — useful for verifying a relationship is pointing to the right place before making a correction.

**Save** writes the change to the encrypted database. **Cancel** discards it. **🗑 Delete** removes the record permanently after a browser confirmation prompt. There is no undo after any write.

---

### Orphan Record Scanner

The Orphan Scanner lives inside the Break Glass tool. Switch to the **Orphan Scanner** tab after opening Break Glass.

**What it does**

The scanner has two passes:

1. **FK integrity** — scans every inter-store relationship (income sources referencing members, expenses referencing categories, debt payments referencing accounts, etc.) and surfaces any record where the referenced record no longer exists. These are called *orphans* or *dangling FKs*. They can appear if a record was hard-deleted unexpectedly, if data was surgically edited via Break Glass, or if a vault backup was imported from a database at a different point in time. Orphans are harmless in most cases but can cause records to silently disappear from filtered lists or produce unexpected totals on Budget and Reports.

2. **Semantic consistency** — checks for data states that are structurally valid but semantically wrong:
   - **Stale bill dates** — a tracked bill's `expense.date` indicates it was paid this cycle, but no `ExpensePaidRecord` exists for that cycle. This can happen when a payment was recorded and then deleted without rolling back the bill's paid date. The scanner detects this regardless of how long ago the stale date was set.
   - **Orphaned card charges** — an auto-generated card charge (created when recording an expense payment charged to a card) whose linked payment record was later deleted. The charge shows up in card spending but no longer has a matching payment behind it.

**Running a scan**

The scan runs automatically whenever you click the **Orphan Scanner** tab — no extra click required. You can also click **Run Scan** at any time to re-scan. Switching to another tab and back triggers a fresh scan.

A clean database shows a ✅ Clean result. If issues are found, the scanner groups them by type and shows:

- **Dangling FK issues** — the store, record name, broken field, and what it points to. A **View in Browser** button jumps directly to the orphaned record in the Data Browser.
- **Consistency issues** — a description of the semantic problem and a **Fix** button. Clicking Fix runs an automatic correction (e.g. resets the bill's paid date to "never paid", or deletes the orphaned charge) after a confirmation prompt.

<p align="center">
  <img src="docs/screenshots/27-break-glass-orphan.png" alt="Orphan Scanner showing a dangling FK issue" width="800" />
</p>

**Fixing orphans manually**

With the orphaned record open in the Data Browser:

- Click **Edit** and update the broken field to point to a valid record ID, or
- Click **🗑 Delete** to remove the orphan if it is no longer needed.

Re-run the scan after each fix to confirm the database is clean.

---

## FAQ

### I lost my private key / forgot my passphrase. Can I recover my data?

**No.** There is no recovery mechanism, reset option, or backdoor.

The vault key is encrypted to your PGP public key using OpenPGP.js. Decrypting it requires your private key and your passphrase. The private key is never stored anywhere by the extension — it is only held in memory during the session you paste it. If you lose the private key, the vault key is permanently inaccessible, and every encrypted record in IndexedDB is unrecoverable. The math is the security model: without the key, the ciphertext is noise.

**What to try if you think you lost access:**

1. **Check your password manager.** During setup, the wizard showed you the private key and strongly suggested copying it there. Most password managers let you search by URL, site name ("Financial Finger"), or note content.
2. **Check old email or cloud sync.** If you saved the key to a note, draft email, or cloud document at setup, search for the PGP header `-----BEGIN PGP PRIVATE KEY BLOCK-----`.
3. **Try saved key files.** The wizard offers a "Load from file" option at unlock — check your Downloads folder and any USB drives or backups from around the time you set up the extension.
4. **Check all passphrase variations.** OpenPGP.js passphrases are case-sensitive. Try uppercase/lowercase variations of what you remember.

If none of these work, the only path forward is to wipe the vault in Settings → Danger zone and start over. You will lose all data.

**Going forward:** store the private key in a dedicated password manager (Bitwarden, 1Password, KeePass) and set a memorable passphrase. The key is not a secret that expires — you can store it the same way you store any other critical credential.

---

### Why can't I connect my bank or financial services directly via API?

This is an intentional design decision, not a technical limitation.

The financial industry's track record with third-party data aggregators is not reassuring. Aggregator breaches have exposed account numbers, balances, and full transaction histories for millions of people. Even well-intentioned services get acquired, pivoted, or subpoenaed. The moment your data leaves your device in plaintext — regardless of how good the vendor's intentions are — you have lost control of it. Every API integration, every OAuth handshake, every "we only store a read-only token" is another link in a chain that you do not control.

Financial Finger's answer to that problem is to eliminate the chain entirely. Your data is encrypted to a PGP key that only you hold, stored only in your browser's local IndexedDB, and never transmitted anywhere. There is no server to breach. There is no vendor to subpoena. There is no token to rotate after a leak.

There is also a more deliberate reason: **manual entry is a feature, not a burden**. When you type in a transaction you see it. When you set a recurring bill amount you think about it. The small friction of entering data yourself is exactly what forces active engagement with where your money is going. Tools that auto-import transactions often become tools people glance at instead of act on — a dashboard of numbers that confirms everything is fine until suddenly it is not. Financial Finger is designed to make you a participant in your own finances, not an observer.

Put simply: this tool is built for people who will actually use it. If you want a hands-off experience where an app reads your accounts and builds your budget for you, there are plenty of those — they typically cost a monthly subscription, and they have well-documented histories of data breaches, unexpected pivots, and terms of service that treat your financial life as a product to be monetized.

Financial Finger is free. It always will be. If it has been useful to you and you feel like buying the developer a coffee, there is a link in the sidebar — but it is never expected and never required. What is expected is that if you choose this tool, you show up for it.

Financial Finger will never auto-pull your bank data, connect to financial aggregators, or send anything off your device unencrypted.

---

### Why can't Financial Finger email me or text my phone when a reminder fires?

For the same reason it doesn't connect to your bank: doing so would require sending your data — and your contact information — to a server.

An email or SMS notification service needs three things to work: a server to run on, your email address or phone number to send to, and a reason to have both stored somewhere. That server is a target. The company running it is a vendor with terms of service, investors, and an acquisition value. Your email address and phone number are personal identifiers that, combined with the fact that you use a budgeting tool, are worth something to data brokers — and worth a great deal more to criminals after a breach. The history of "simple, helpful" notification services ending up on the dark web is long and not getting shorter.

Financial Finger's reminders fire inside the extension when you open it, with no data ever leaving your device. That is a meaningful constraint, and it is an intentional one. The bell notification you see is generated entirely locally — no network request, no third-party service, no account to create, no email address to harvest.

So: do you really need your email address and phone number winding up on the dark web through yet another service that promised it was just sending you a friendly reminder? Financial Finger's answer is no. Your contact information stays yours. Your reminders stay on your device. The tradeoff is that you have to open the app to see them — which, for a tool built around the idea that active engagement with your finances is the whole point, seems like a reasonable ask.

---

## Financial Finger in the Classroom

Financial Finger is purpose-built for households that want to manage their finances privately and without a cloud account — which also makes it an ideal tool for financial literacy education. Every student works with realistic data in a fully isolated environment. Nothing is shared with a server, no account is required, and there is no subscription to pay.

### The Financial Universe model

A teacher sets up one installation as the **Financial Universe** — a master household that defines the shared structure (expense categories, template bills, a realistic income scenario) that all students will start from. Each student then runs their own completely separate installation and imports the teacher's template as a starting point. From there, every student manages their own independent household.

Because Financial Finger uses PGP encryption for exports, the teacher controls exactly what students receive. Students cannot read each other's data. Each vault is locked to its own key pair.

---

### Teacher setup

1. **Complete the six-step setup wizard.** Name the household something descriptive (e.g. "Dollar Farm — Class Template"). Generate a key pair for the master installation; save the private key and passphrase somewhere you can retrieve for student imports.

2. **Create the shared expense categories.** These will appear in every student's installation after import: Housing, Food, Transportation, Utilities, Healthcare, Personal, Entertainment, Savings — or whatever categories fit your curriculum.

3. **Add template recurring expenses.** Model a realistic household: rent or mortgage, utilities (electric, water, gas), groceries, a car payment, insurance, streaming subscriptions. Set due days and monthly thresholds on the variable ones. This gives students a ready-made bill-tracking environment on day one.

4. **Add income sources.** Create two or three members with income sources at different pay frequencies — one biweekly salary, one hourly part-time, one semi-monthly — so students can immediately see how the normalization to monthly works.

5. **Optionally add debt accounts.** A credit card balance at a high APR and a vehicle loan with several years remaining are useful for the Avalanche/Snowball exercises in the Learn tab.

6. **Export the database.** Go to **Settings → Export**, select your own public key as the recipient (for a self-backup), and download the `.ffx` file. This is the file you distribute to students. It is encrypted — only someone with the matching private key can open it.

7. **Provide the private key and passphrase to students.** Since this is a classroom template (not a real personal vault), it is fine to share these. Treat them like a course handout — they only unlock the template, not any private financial data.

---

### Student onboarding

1. **Install Financial Finger** in Chrome, Edge, or Firefox — download a release zip from the [Releases page](https://github.com/sormondocom/finance-finger/releases) and load it unpacked following the [Quick start](#quick-start) instructions above.

2. **Complete the six-step setup wizard.** Each student generates their own key pair and names their own household. Their vault is completely separate from the template and from every other student's installation.

3. **Import the teacher's template.** Go to **Settings → Import**, load the `.ffx` file, and enter the teacher's private key and passphrase (shared by the teacher). Choose **Merge** mode (never Replace — that would wipe their own setup). Click **Decrypt & Import**. The categories, template expenses, and income sources now appear in their installation.

4. **Personalize the household.** Students add or edit members to match their assigned scenario (a single adult, a couple, a family with dependents), adjust income to their assigned amounts, and begin tracking bills.

5. **Explore.** Students open the Budget page to see their starting surplus or deficit, the Debt page to run Avalanche vs. Snowball projections, and the What If? page to model life decisions.

---

### Classroom exercises

**Budget baseline exercise** — Give each student a different income scenario and have them set up their household from the shared template. Compare Budget page surpluses: who has the most financial flexibility? What is the DTI chip showing? What would need to change to get it under 36%?

**Debt payoff comparison** — Assign the same two debt accounts (e.g. a $3,200 credit card at 24% APR and a $9,000 car loan at 6.9%) to every student. Have half use Avalanche and half use Snowball. Compare the amortization schedules: how many months does each strategy take? How much interest is paid overall?

**What If? decision modeling** — Pose a scenario: "You have a job offer in another city that pays $8,000 more per year, but rent is $400/month higher." Students create a scenario film in What If? with both changes active. Is it a ✅ Yes, ⚠️ Tight, or ❌ red budget? What other factors would you add?

**Emergency fund target** — Using the Emergency Fund calculator in the Learn tab, students calculate their 3-month and 6-month targets based on their actual recurring expenses. How many months would it take to reach the target saving $100, $200, or $300/month?

**Overage threshold exercise** — Mark the electric bill's threshold at a modest $120. Over two or three class sessions, record payments that sometimes go over. Open Reports → Common Overage Offenders and discuss what a seasonal pattern means for annual budgeting.

**Compound interest discussion** — Open the Learn tab → Saving & Investing → Compound Interest. Drag the slider to 20 years. What is the difference between $5,000 growing at 8% vs. festering at 22% APR? At what point does the investment line overtake the debt line on the chart?

**Data export as a deliverable** — At the end of the unit, students export their completed vault encrypted to their own key (Settings → Export → Your own key) and submit the `.ffx` file as their project deliverable. The teacher cannot open it without the student's private key — which reinforces the privacy model as a lived experience, not just a talking point.

---

## Dependencies

| Package | Purpose |
|---|---|
| `openpgp ^6.1.0` | ECC key generation, PGP encrypt/decrypt |
| `idb ^8.0.0` | Typed IndexedDB wrapper |
| `chart.js ^4.4.4` | Budget donut, spending charts, compound interest visualizer |
| `webextension-polyfill ^0.12.0` | Cross-browser `browser.*` API namespace |

All dependencies are auditable, actively maintained open-source libraries with no telemetry.

---

## License

See [LICENSE](LICENSE).
