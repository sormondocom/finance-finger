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

**Income sources** — Each member can have multiple income sources. The pay type can be **salary** (enter the amount at any frequency) or **hourly** (enter an hourly rate and hours per period — the app computes the per-period pay and shows a preview). Frequencies: hourly, weekly, biweekly, semi-monthly, monthly, annual, or one-time. Semi-monthly sources support unequal paychecks — different amounts on the 1st and 15th of the month. Every source is normalized to monthly for all calculations. Sources can be toggled active/inactive without deleting them. Income sources can optionally be linked to a bank account to feed the Accounts page balance projection.

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

**Bank accounts** — Track every deposit account in your household: checking, savings, money market, or other. Each account can be set as individual (assigned to one household member), joint, or household-level.

**Balance projection** — The Accounts page calculates a running balance for each account by starting from an optional **starting balance** you provide, then adding income deposits and subtracting expenses and debt payments that are linked to that account. Navigate forward and backward through months to see projected balances over time.

**Balance chart** — A stacked bar chart shows all accounts side by side across recent months. Each account gets its own color, chosen from a custom color picker when adding or editing the account.

**Dashboard "Income by Account" card** — When at least one account has an active income source linked to it, the Dashboard shows a breakdown card listing each account alongside the income flowing into it. The card is hidden when no accounts have linked income.

**Cross-form hints** — The income source form and expense form both show a "No bank accounts" hint (with a direct link to the Accounts page) when no accounts exist yet, so you can add one without losing your place.

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

### Debt

**Card management** — Track any debt account type: credit card, mortgage, vehicle loan, medical debt, or personal/student loan. For each account you can set:
- Current balance, APR, credit limit (cards), original principal and term (mortgages/vehicle loans/personal loans)
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
- **Data Sharing** — store household members' public keys and export your database encrypted to any recipient; import a `.ffx` file received from another installation
- **Export / Import** — back up your database encrypted to your own key, or receive a file from another household member and merge or replace your local data
- **Danger zone** — full vault wipe and IndexedDB reset
- **Break Glass** — emergency direct-access panel for reading, editing, and deleting raw database records; includes an Orphan Scanner for finding broken references (see [Troubleshooting → Break Glass](#break-glass))

---

## Using Financial Finger

Step-by-step instructions for every page in the app.

### Dashboard

The dashboard is your daily command center. It opens automatically after setup and every time you unlock the vault.

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

**One-time income**

Sources with frequency **once** appear in the Monthly Activity widget on the Dashboard for the month matching their date. You can also log them directly from the Dashboard without going to the Income page.

**Reminders on income sources**

A **Reminders** section appears at the bottom of the Add and Edit income source forms. Click **+ Add reminder** to attach a custom notification — for example, a monthly reminder on your payday to review your budget. Reminders added during creation are saved together with the source. All linked reminders are also visible and manageable from **Settings → Reminders**.

---

### Accounts

**Adding a bank account**

1. Click **+ Add Account** on the Accounts page.
2. Choose the account type: **Checking**, **Savings**, **Money Market**, or **Other**.
3. Choose ownership: **Individual** (select a household member), **Joint**, or **Household**.
4. Enter an optional starting balance — this is the known balance at a point in time that the projection builds forward from.
5. Choose a chart color to identify this account in the balance chart.
6. Click **Save**.

**Linking income to an account**

Open any income source (Income page → pencil icon) and select the account from the **Deposit to** dropdown. Income linked this way is added to the account's projected balance each month.

**Reading the balance**

The Accounts page shows a balance card for each account. The balance is calculated as: starting balance + all linked income deposits − all linked expense payments − linked debt payments for the current month being viewed. Use the **‹ / ›** arrows to step through months.

**Reminders on accounts**

A **Reminders** section appears at the bottom of the Add and Edit bank account forms. Use it to attach reminders such as a monthly prompt to reconcile the account or transfer to savings. All linked reminders are also manageable from **Settings → Reminders**.

**Balance chart**

The stacked bar chart at the top of the page shows all accounts side by side across recent months. Hover a bar segment to see the exact balance.

---

### Expenses

**Creating categories**

1. Click **+ Add Category** at the top of the Expenses page.
2. Give it a name (e.g. Housing, Food, Utilities) and choose a color. That color flows through every chart in the app that references expenses.
3. Click **Save**. Categories appear as a colored chip row above the expense list.

**Filtering by category**

Click any category chip to filter the list to that category. Click it again to clear the filter.

**Editing a category**

Click any category pill in the management row to open the Edit Category modal. You can rename the category, choose a new color from the 32-color palette, or update its monthly budget. The pill, filter chip, and every chart referencing that category update immediately after saving.

**Adding an expense**

1. Click **+ Add Expense**.
2. Fill in a description, amount, category, and date.
3. Check **Recurring** to make it a recurring bill. This reveals:
   - **Frequency** — weekly through annual.
   - **Due day** (1–28) — turns the expense into a tracked bill monitored each month.
   - **Monthly threshold** — the maximum you expect the bill to cost. If an actual payment exceeds this, the app warns you.
   - **Fixed amount** — check this when the bill is always exactly the same (e.g. a streaming subscription). The payment dialog pre-fills the amount and makes it read-only.
   - **Auto-pay** — check this for bills paid automatically by your bank. Auto-pay bills show an Auto-pay badge instead of a Record Payment button and do not appear in payment reminders.
   - **Charge to card** — link the expense to a debt account so payments automatically create a charge entry on that card.
4. Click **Save**.

**Reminders on expenses**

A **Reminders** section appears at the bottom of the Add and Edit expense forms. Click **+ Add reminder** to attach a custom notification — for example, a reminder a few days before a bill's due date, or a monthly prompt for a variable expense. The trigger type defaults to "days before due date" for expenses that have a due day, or "monthly on a specific day" for others. All linked reminders are also manageable from **Settings → Reminders**.

**Marking a bill paid**

1. Find a bill showing the ⏰ (due soon) or ⚠ (past due) badge and click **Mark Paid**.
2. The dialog pre-fills the bill's usual amount. Change it to what you actually paid — important for variable bills like electricity or gas.
3. If the amount exceeds your threshold, an inline warning shows the overage immediately before you confirm.
4. Click **Mark as Paid**. The badge updates to ✓ Paid and the notifier refreshes automatically.

---

### Calendar

The Calendar page shows all tracked bills (recurring expenses with a due day set) laid out on a monthly grid.

**Navigating months**

Use the **‹ / ›** arrows at the top to browse past or future months. Today's date is highlighted in the grid. Bills with due days on days 29–31 clamp to the last day of shorter months.

**Reading the grid**

Each bill appears as a chip on its due-day cell. The summary bar above the grid shows a count of each status:

| Status | Color | Meaning |
|---|---|---|
| Past Due | Red | Payment window has passed this month |
| Due Soon | Rust/amber | Due within 7 days |
| Paid | Green | Marked paid this calendar month |
| Upcoming | Sage | Due later in the month |

**Marking a bill paid from the Calendar**

Click **✓ Mark Paid** below any unpaid bill chip. The same amount dialog as the Expenses page opens — enter the actual amount paid and confirm. The chip updates immediately.

---

### Budget

The Budget page shows a real-time visual breakdown of your monthly spending.

**Summary bar**

The top bar shows total monthly income, total recurring expenses, and the surplus or deficit. These numbers match the Income and Expenses summary cards on the Dashboard.

**Donut chart**

Each slice represents a category. Click a slice to filter the category breakdown below it to that category only. Click the center or the same slice again to clear the filter.

**Category breakdown**

Horizontal bars showing each category's monthly total as a proportion of total spending, colored with each category's assigned color.

**Cash flow bar**

A single bar that compares total income to total spending at a glance.

If total spending exceeds income, your mascot slides in automatically with a heads-up about the deficit.

---

### Debt

**Adding a debt account**

1. Click **+ Add Account**.
2. Choose the account type: **Credit Card**, **Mortgage**, **Vehicle Loan**, **Medical**, or **Personal / Student Loan**.
3. Enter: name, current balance, APR, credit limit (for cards), original principal and term (for mortgages, vehicle loans, and personal loans).
4. Set the minimum payment: **fixed dollar amount** or **percentage of balance** (the app enforces a $25 floor on percentage minimums).
5. Choose a payment cycle (weekly, biweekly, semi-monthly, monthly) and an optional due day.
6. Optionally enter a 0% introductory APR end date for promotional-rate cards.
7. Click **Save**.

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

**Recording a payment**

1. Click **Record Payment** on a debt card.
2. Enter the payment amount and date. Check **Extra payment** if this is beyond the minimum.
3. Click **Save**. The balance and amortization schedule update, and the notifier refreshes.

**Logging a card charge**

1. Click **+ Charge** on a credit card.
2. Enter the merchant name, amount, and date.
3. Charges appear in the **Top Merchants** chart on the Reports page.

**Reminders on debt accounts**

A **Reminders** section appears at the bottom of the Add and Edit debt account forms (not the "Complete Account Setup" payment-details step). Click **+ Add reminder** to attach a custom notification — for example, a monthly reminder on your payment due date, or a one-time reminder to call about an introductory APR expiry. All linked reminders are also manageable from **Settings → Reminders**.

**Debt payoff celebration**

When you record a payment that brings a card balance to zero, a full-screen overlay plays with dancing mascots and confetti. Both Buck and Penny dance if your household has multiple members.

---

### Reports

**Setting the date range**

Use the preset buttons — **This Month**, **Last 3 Mo.**, **Last 6 Mo.**, **This Year**, **All Time** — or click **Custom** and enter start and end dates.

**Report cards at a glance**

| Card | Use it to |
|---|---|
| KPI chips | Get one-glance totals: spending, income, net cash flow, savings rate |
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

---

### Settings

| Setting | How to use it |
|---|---|
| **Mascot** | Click Buck or Penny to switch; type in the name field to rename your mascot. Changes apply immediately. |
| **Household name** | Edit the field and save. Updates the title on the Dashboard. |
| **Members** | Click **+ Add Member** to add a household member. Click the trash icon to remove one — a confirmation dialog warns you that all assigned income sources will also be removed. |
| **Theme** | Choose Light, Dark, or Auto (follows your OS preference). Applies immediately without a reload. |
| **Reminders** | View, add, edit, and delete all custom bell notifications. Each card shows the label, when the reminder fires, and active/inactive status. Reminders can also be created and deleted from within the Add/Edit forms on the Income, Expenses, Debt, and Accounts pages — they all appear here for centralized management. |
| **Security** | View your PGP fingerprint. Click **Export public key** to copy the armored public key to clipboard. |
| **Sharing keys** | Store a household member's or spouse's public key here so you can quickly encrypt exports to them without pasting their key every time. |
| **Export** | Encrypts your database and downloads a `.ffx` file. You choose a recipient: a saved sharing key, a one-time paste, or your own key (for a personal backup). Only the holder of the matching private key can open the file. |
| **Import** | Decrypts a `.ffx` file shared from another Financial Finger installation using your private key and passphrase. Choose **Merge** to add incoming records alongside your existing data, or **Replace** to wipe your database first. |
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
3. If the amount is over your threshold, the inline overage warning shows immediately. Note it — if this is the second overrun in a row, the mascot will name the pattern and suggest adjusting the threshold.
4. The chip on the Calendar updates to ✓ Paid. The notifier refreshes. If that was the last open alert, the mascot dismisses itself automatically.

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

## Troubleshooting

### Break Glass

The **Break Glass** tool is an emergency access panel that gives you direct read, edit, and delete access to every raw record in your encrypted database. It is intended for situations where something went wrong at the data level and the normal UI cannot fix it.

**When to use it**

- A record contains a bad value that the app UI will not let you correct
- You need to verify a specific field (e.g. a linked ID) while debugging unexpected behavior
- You want to manually inspect what is actually stored vs. what the UI is showing

**Opening Break Glass**

1. Go to **Settings** and scroll to the bottom.
2. Click **🔧 Open Break Glass**. Your mascot will appear with a warning — this tool has no guardrails and no undo after saving.
3. Click **"I hear ya — open 'er up"** to confirm.

**Data Browser**

The left panel shows a store selector (Members, Income Sources, Expenses, Debt Accounts, etc.) and a list of every record in that store. Click any record to open it in the detail pane on the right.

| Mode | How to enter | What it does |
|---|---|---|
| **View** | Click a record | Shows all fields with human-readable labels and formatted values — dates rendered as readable timestamps, currency as `$X.XX`, percentages as `XX.XX%` |
| **Edit** | Click **Edit** | Opens a per-field form with type-appropriate controls — a date/time picker for epoch timestamps, a dollar input for currency fields, a checkbox for booleans |
| **Edit Raw JSON** | Click **Edit Raw JSON** | Opens the raw JSON in a textarea — for edge cases where you need to change a field the field editor does not surface, or paste in a corrected blob |

UUID reference fields (like `memberId` on an income source) are rendered as **clickable links** in view mode. Clicking one navigates directly to the referenced record in the correct store — useful for verifying a relationship is pointing to the right place before making a correction.

**Save** writes the change to the encrypted database. **Cancel** discards it. **🗑 Delete** removes the record permanently after a browser confirmation prompt. There is no undo after any write.

---

### Orphan Record Scanner

The Orphan Scanner lives inside the Break Glass tool. Switch to the **Orphan Scanner** tab after opening Break Glass.

**What it does**

It scans every inter-store relationship in the database — income sources referencing members, expenses referencing categories, debt payments referencing accounts, and so on — and surfaces any record where the referenced record no longer exists. These are called *orphans* or *dangling FKs*. They can appear if a record was hard-deleted unexpectedly, if data was surgically edited via Break Glass, or if a vault backup was imported from a database at a different point in time.

Orphans are harmless in most cases, but they can cause records to silently disappear from lists (because the app filters by a member or category that no longer exists) or produce unexpected totals on the Budget and Reports pages.

**Running a scan**

1. Open Break Glass and click the **Orphan Scanner** tab.
2. Click **Run Scan**.

A clean database shows a ✅ Clean result. If orphans are found, the scanner groups them by relationship and shows:

- The store and record name that has the broken reference
- Which field is broken and what value it points to
- A **View in Browser** button that jumps directly to the orphaned record in the Data Browser

**Fixing orphans**

With the orphaned record open in the Data Browser:

- Click **Edit** and update the broken field to point to a valid record ID, or
- Click **🗑 Delete** to remove the orphan if it is no longer needed.

Re-run the scan after each fix to confirm the database is clean.

---

## FAQ

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
| `10-bill-calendar.spec.ts` | Calendar page: bill chips on correct day, status colors, Mark Paid updates chip, month navigation, summary bar counts |
| `10b-calendar-paydays.spec.ts` | Income source payday reference date, gold 💰 payday chips rendered at correct frequency intervals on the Calendar |
| `11-budget-buckets.spec.ts` | Budget bucket grid: fill percentage, to-assign counter, unbudgeted category pills, clicking a bucket opens the budget editor |
| `12-debt-milestones.spec.ts` | Milestone timeline card, per-account payoff dates, debt-freedom banner, Dashboard DTI and credit utilization chips |
| `13-settings-currency.spec.ts` | Currency picker in Settings, symbol persists across navigation, new symbol appears in rendered money values |
| `14-dashboard-reminders.spec.ts` | Reminder row sort order (most overdue first), row-click navigation to Debt or Expenses, active nav link update |
| `15-reports.spec.ts` | Reports page structure, Leaky Bucket chart: scrubber, prev/next step buttons, day label, expense and payday chips |
| `16-form-validation.spec.ts` | Enter key submits on last field, no-submit on non-last field, multi-field error list on blank submission |
| `17-expense-card-link.spec.ts` | Expense-to-card-charge linking: auto-charge creation, Auto badge, edit/card-swap/unlink/delete sync across both records |
| `18-category-edit.spec.ts` | Category edit modal: pre-fill, rename, color change, budget change, clear budget, duplicate name validation (case-insensitive), keyboard Enter |
| `19-expense-payments.spec.ts` | Expense payment recording: fixed-amount pre-fill, auto-pay badge, variable bill flow, form label changes between regular and recurring modes |
| `20-accounts.spec.ts` | Bank accounts CRUD, account types, ownership (individual/joint/household), chart color picker, starting balance, balance projection, month navigation, Income by Account dashboard card |
| `21-no-accounts-hints.spec.ts` | "No bank accounts" and "no credit cards" inline hints with navigation links in the income source form and expense form |
| `22-dashboard-card-conditions.spec.ts` | Income by Account card conditional rendering: absent when no accounts exist, absent when account has no linked income |
| `23-income-pay-type.spec.ts` | Income pay type: salary vs. hourly inputs, rate × hours preview, hourly source display in list, semi-monthly payday schedule dropdown |
| `24-calendar-income.spec.ts` | Calendar one-time income chips (💵), semi-monthly unequal paychecks showing correct amounts on 1st and 15th |
| `25-accounts-balance.spec.ts` | Account balance: starting balance field, balance calculation from linked income, month navigation, next-month disabled guard |
| `26-expense-payment-display.spec.ts` | Expense payment display and edit: actual-amount row visibility after payment, under/over threshold sub-labels, edit payment flow |
| `27-break-glass.spec.ts` | Break Glass tool: warning overlay, data browser (columnar view, field editor, raw JSON editor, store switching), FK navigation links, orphan scanner (clean pass + dangling FK detection + View in Browser), record deletion, refresh |
| `28-custom-reminders.spec.ts` | Custom reminders: Reminders section visible in create and edit forms for Income, Expenses, Debt, and Accounts; reminder added during create persists after save; linked reminders visible in edit form; all reminders appear in Settings → Reminders |

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

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push to `main`, on every pull request, and on version tags (`v*.*.*`). It has eight jobs with a deliberate dependency chain: **the Firefox build never starts until Chrome E2E tests pass**.

```
unit ─────────────────────────────────────────────────────────────────────────┐
build-chrome → e2e-chrome → build-firefox → e2e-firefox ──────────────────────┤
docs ─────────────────────────────────────────────────────────────────────────┤
                                                                              ↓
                                                                           package (push)
                                                                              ↓
                                                                           attest (tags)
                                                                              ↓
                                                                           release (tags)
```

| Job | Needs | What it does |
|---|---|---|
| **unit** | — | `npm test` (Vitest); runs in parallel with everything |
| **build-chrome** | — | `npm run build:chrome`; uploads `dist-chrome` artifact |
| **e2e-chrome** | build-chrome | Downloads `dist-chrome`, installs Playwright Chromium, runs `npm run test:e2e` with `CI=true` |
| **build-firefox** | e2e-chrome | `npm run build:firefox`; only starts if Chrome E2E passes; uploads `dist-firefox` artifact |
| **e2e-firefox** | build-firefox | Downloads `dist-firefox`, installs Playwright Firefox, runs `npm run test:e2e` with `CI=true BROWSER=firefox` |
| **docs** | — | Runs `npm run docs` and fails if the committed `docs/data-model.md` is stale |
| **package** | unit + e2e-firefox + docs | Downloads both dist artifacts, zips them, names them `financial-finger-{version}-chrome.zip` / `…-firefox.zip` |
| **attest** | package (tags only) | SLSA Build Level 2 provenance via `actions/attest-build-provenance@v2` for both zips |
| **release** | attest (tags only) | Creates a GitHub Release; marks pre-release if tag contains a hyphen (e.g. `v1.0.0-beta.1`) |

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

When E2E tests fail, the workflow uploads browser-specific artifacts:
- **`playwright-report-chrome`** / **`playwright-report-firefox`** — full HTML report with timeline, errors, and steps (retained 30 days)
- **`playwright-screenshots-chrome`** / **`playwright-screenshots-firefox`** — screenshots from every test step (retained 14 days)

Download these from the **Artifacts** section of the failed workflow run to diagnose the failure. Each browser's report is independent, so a Firefox failure doesn't overwrite the Chrome report.

### Running Firefox E2E tests locally

On macOS/Linux:
```bash
BROWSER=firefox npm run test:e2e
```

On Windows (PowerShell):
```powershell
$env:BROWSER='firefox'; npm run test:e2e
```

> **Note:** `npm run build:firefox` must be run first — the Firefox tests load from `dist/firefox/`.

---

## Architecture

### Why a browser extension?

This is a deliberate platform choice, not a default. The alternatives — a native desktop app, an Electron wrapper, a web app with a backend, a mobile app — were each considered and rejected for reasons that matter for a privacy-first, offline-first financial tool.

**Cross-platform by default**

The browser is the most widely deployed cross-platform runtime in existence. A browser extension runs identically on Windows, macOS, Linux, and ChromeOS — wherever a supported browser runs. There are no separate operating system builds, no platform-specific installers, no OS-level permission dialogs, and no code-signing certificates required for local development. The same TypeScript source and a single Vite build pipeline produce a working extension for both Chromium and Firefox with minimal per-target configuration.

**A well-known, stable technology stack**

HTML, CSS, and TypeScript are the most widely understood technologies in software development. The WebExtension API is a W3C-aligned standard implemented consistently across every major browser. The full tooling ecosystem — Vite, Playwright, npm, VS Code — is mature, well-documented, and available everywhere. This means the codebase is approachable to any web developer without learning platform-specific SDKs, and every dependency has a massive support community behind it.

**A security model enforced by the browser itself**

Browser extensions run in a sandboxed context. Permissions are declared explicitly in the manifest, visible to anyone who reads it, and enforced by the browser at runtime. Financial Finger declares exactly what it needs: `storage` (for the encrypted vault config) and nothing else. It cannot make arbitrary network requests, cannot access other tabs, and cannot read the filesystem. This isolation is structural — it does not depend on the application code being bug-free, it is enforced by the container.

**Local storage without a server**

IndexedDB is a full-featured, transactional, asynchronous database built into every browser. It persists across sessions, handles large datasets efficiently, and is never transmitted to a network unless the application code explicitly does so. Combined with the Web Crypto API and OpenPGP.js, the complete encryption and storage stack is available without any external service, server infrastructure, or cloud dependency. The extension has no backend. There is nothing to host, nothing to maintain, and no subscription to fund.

**No Electron**

The most common alternative for offline desktop tools with a web UI is Electron — which bundles a full Chromium runtime (~150 MB), requires platform-specific packaging, and introduces a large attack surface. Tauri reduces the binary size but requires Rust tooling and platform-specific webview integration. A browser extension is leaner, more transparent, and delegates its security model to a browser the user already trusts and keeps updated. The trade-off is that the user must have a browser installed — which, in practice, every user already does.

---

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

All financial records are stored in **IndexedDB** via [`idb`](https://github.com/jakearchibald/idb) with a typed schema. Every value is an `EncryptedRecord` — the raw domain object is never written to disk. For a full field-by-field reference, see the auto-generated [Data Model](docs/data-model.md).

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
    ├─ finance.ts          toMonthly, fmt, fmtCents, CATEGORY_COLORS
    ├─ billStatus.ts       computeBillStatus — paid / due-soon / past-due logic
    ├─ paymentStatus.ts    computePaymentStatus — debt payment tracking
    ├─ notifier.ts         Alert computation, badge updates, mascot callback
    └─ notificationModal.ts  openAddNotificationModal, buildLinkedRemindersSection — shared reminder UI for all forms
tests/
├─ e2e/                    Playwright spec files (33 files)
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
