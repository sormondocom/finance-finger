# Financial Finger — Data Model

> Auto-generated from [`src/types/index.ts`](../src/types/index.ts).
> Run `npm run docs` to regenerate after editing the types file.

---

## Core Types

### `MascotGender`

```typescript
type MascotGender = 'penny' | 'buck'
```

### `IncomeFrequency`

```typescript
type IncomeFrequency = 'hourly' | 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'annual' | 'once'
```

### `PaymentCycle`

```typescript
type PaymentCycle = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
```

### `DebtStrategy`

```typescript
type DebtStrategy = 'avalanche' | 'snowball' | 'custom'
```

## Vault / Config

### `VaultConfig`

| Field | Type | Notes |
|---|---|---|
| `setupComplete` | `boolean` |  |
| `publicKeyArmored` | `string` |  |
| `encryptedVaultKey` | `string` |  |
| `profileName` | `string` |  |
| `mascotGender` | `MascotGender` |  |
| `mascotName` | `string` |  |

### `ThemeSettings`

| Field | Type | Notes |
|---|---|---|
| `colorScheme` | `'light' \| 'dark' \| 'auto'` |  |
| `accentColor` | `string` |  |

## Encrypted storage envelope

### `EncryptedRecord`

| Field | Type | Notes |
|---|---|---|
| `iv` | `number[]` |  |
| `data` | `number[]` |  |

## Financial domain

### `AvatarType`

```typescript
type AvatarType = 'male' | 'female' | 'child' | 'baby-male' | 'baby-female' | 'child-male' | 'child-female' | 'teen-male' | 'teen-female'
```

### `HouseholdMember`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` |  |
| `name` | `string` |  |
| `avatarType?` | `AvatarType` |  |
| `createdAt` | `number` |  |

### `IncomeSource`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` |  |
| `memberId` | `string` |  |
| `name` | `string` |  |
| `amount` | `number` | per-period amount (computed from hourlyRate × hoursPerWeek when payType is 'hourly') |
| `amount2?` | `number` | second paycheck when frequency === 'semimonthly' and paychecks differ |
| `frequency` | `IncomeFrequency` |  |
| `payType?` | `'salary' \| 'hourly'` | undefined treated as 'salary' for backward compat |
| `hourlyRate?` | `number` | present when payType === 'hourly' |
| `hoursPerWeek?` | `number` | present when payType === 'hourly' |
| `active` | `boolean` |  |
| `date?` | `number` | used only when frequency === 'once' |
| `paydayRef?` | `number` | a known payday timestamp; used to place payday chips on the calendar |
| `semimonthlySchedule?` | `'1-15' \| '15-end'` | structured payday pattern for semimonthly sources |
| `bankAccountId?` | `string` | optional bank account this income deposits into |
| `createdAt` | `number` |  |
| `updatedAt` | `number` |  |

### `ExpenseCategory`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` |  |
| `name` | `string` |  |
| `color` | `string` |  |
| `parentId` | `string \| null` |  |
| `monthlyBudget?` | `number` | envelope budgeting cap — undefined = no cap set |
| `defaultCardId?` | `string` | card-type DebtAccount to auto-charge when an expense in this category is saved |
| `description?` | `string` |  |
| `createdAt` | `number` |  |

### `Expense`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` |  |
| `categoryId` | `string` |  |
| `memberId` | `string \| null` |  |
| `description` | `string` |  |
| `amount` | `number` | monthly threshold / expected amount — the primary budget figure for this expense |
| `date` | `number` | for recurring bills with dueDay: the date the bill was last marked paid |
| `recurring` | `boolean` |  |
| `recurringFrequency` | `IncomeFrequency \| null` |  |
| `dueDay?` | `number` | day of month this bill is due (1–28); recurring bills only |
| `threshold?` | `number` | optional alert cap — when set, overage warnings fire against this rather than amount |
| `linkedCardId?` | `string` | card-type DebtAccount that auto-receives a charge when this expense is saved |
| `isFixedAmount?` | `boolean` | actual payment always equals estimated; pre-fills amount in Record Payment dialog |
| `isAutoPay?` | `boolean` | automatically charged; no manual payment recording needed |
| `url?` | `string` | optional billing portal / website link |
| `bankAccountId?` | `string` | optional bank account this expense is paid from (direct debit) |
| `createdAt` | `number` |  |

### `ExpensePaidRecord`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` |  |
| `expenseId` | `string` |  |
| `amount` | `number` | actual amount paid (may differ from expense.amount for variable bills) |
| `date` | `number` | timestamp when payment was recorded |
| `cardId?` | `string` | optional card charged when recording this payment |
| `bankAccountId?` | `string` | optional bank account the payment was drawn from |
| `createdAt` | `number` |  |

## Bank Accounts

### `BankAccountType`

```typescript
type BankAccountType = 'checking' | 'savings' | 'money-market' | 'other'
```

### `BankAccountOwnership`

```typescript
type BankAccountOwnership = 'individual' | 'joint' | 'household'
```

### `BankAccount`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` |  |
| `name` | `string` |  |
| `accountType` | `BankAccountType` |  |
| `ownership` | `BankAccountOwnership` |  |
| `memberId?` | `string` | only when ownership === 'individual' |
| `balance?` | `number` | optional current balance |
| `color?` | `string` | hex color for chart series; defaults to palette if unset |
| `url?` | `string` | optional online banking portal link |
| `createdAt` | `number` |  |
| `updatedAt` | `number` |  |

### `DebtAccountType`

```typescript
type DebtAccountType = 'card' | 'mortgage' | 'medical' | 'loan' | 'vehicle'
```

### `DebtAccount`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` |  |
| `type` | `DebtAccountType` |  |
| `name` | `string` |  |
| `balance` | `number` |  |
| `apr` | `number` |  |
| `creditLimit?` | `number` | cards only |
| `originalAmount?` | `number` | mortgage / loan original principal |
| `termMonths?` | `number` | mortgage / loan term in months |
| `minimumPaymentType?` | `'fixed' \| 'percentage'` |  |
| `minimumPaymentValue?` | `number` |  |
| `introAprEndDate?` | `number` | timestamp; 0% APR until this date (cards only) |
| `paymentCycle` | `PaymentCycle` |  |
| `dueDay?` | `number` | day of month extracted from nextDueDateMs for ongoing cycle display |
| `nextDueDateMs?` | `number` | timestamp of the actual next payment due date; status computation advances this forward by paymentCycle |
| `url?` | `string` | optional billing portal / website link |
| `createdAt` | `number` |  |
| `updatedAt` | `number` |  |

### `DebtPayment`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` |  |
| `accountId` | `string` |  |
| `amount` | `number` |  |
| `date` | `number` |  |
| `type` | `'regular' \| 'extra'` |  |
| `note?` | `string` |  |
| `bankAccountId?` | `string` | bank account the payment was drawn from |
| `createdAt` | `number` |  |

### `CardCharge`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` |  |
| `accountId` | `string` |  |
| `merchant` | `string` |  |
| `amount` | `number` |  |
| `date` | `number` |  |
| `categoryId?` | `string` |  |
| `note?` | `string` |  |
| `sourceExpenseId?` | `string` | set when this charge was auto-created from a linked expense |
| `createdAt` | `number` |  |

## Amortization

### `AmortizationPeriod`

| Field | Type | Notes |
|---|---|---|
| `period` | `number` |  |
| `date` | `Date` |  |
| `payment` | `number` |  |
| `principal` | `number` |  |
| `interest` | `number` |  |
| `remainingBalance` | `number` |  |

### `AmortizationResult`

| Field | Type | Notes |
|---|---|---|
| `schedule` | `AmortizationPeriod[]` |  |
| `totalInterest` | `number` |  |
| `totalPaid` | `number` |  |
| `originalBalance` | `number` |  |
| `debtFreeDate` | `Date` |  |
| `periodsToPayoff` | `number` |  |

### `MultiCardMonthly`

| Field | Type | Notes |
|---|---|---|
| `month` | `number` |  |
| `date` | `Date` |  |
| `totalBalance` | `number` |  |

### `MultiCardResult`

| Field | Type | Notes |
|---|---|---|
| `monthly` | `MultiCardMonthly[]` |  |
| `paidOffOrder` | `string[]` |  |
| `totalInterest` | `number` |  |
| `totalPaid` | `number` |  |
| `debtFreeDate` | `Date \| null` |  |

## Scenario films

### `ScenarioItem`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` |  |
| `type` | `'income' \| 'expense'` |  |
| `description` | `string` |  |
| `amount` | `number` |  |
| `frequency` | `IncomeFrequency` |  |
| `recurring` | `boolean` | false = one-time lump sum; frequency is ignored |

### `Scenario`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` |  |
| `name` | `string` |  |
| `description` | `string` |  |
| `color` | `string` |  |
| `active` | `boolean` |  |
| `items` | `ScenarioItem[]` |  |
| `createdAt` | `number` |  |
| `updatedAt` | `number` |  |

## Data sharing

### `SharingKey`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` |  |
| `label` | `string` |  |
| `publicKeyArmored` | `string` |  |
| `fingerprint` | `string` |  |
| `email` | `string` |  |
| `addedAt` | `number` |  |

## Mascot triggers

### `MascotTrigger`

```typescript
type MascotTrigger = 'greeting' | 'minimum-payment-trap' | 'negative-cashflow' | 'debt-free-improvement' | 'budget-milestone' | 'payment-due' | 'payment-overdue' | 'briefing' | 'expense-trend' | 'custom'
```

### `MascotMessage`

| Field | Type | Notes |
|---|---|---|
| `trigger` | `MascotTrigger` |  |
| `lines` | `string[]` |  |

## Custom Notifications

### `NotificationTriggerType`

```typescript
type NotificationTriggerType = 'bill-before' | 'monthly-day' | 'one-time'
```

### `NotifLinkedItemType`

```typescript
type NotifLinkedItemType = 'expense' | 'debt' | 'income' | 'account'
```

### `CustomNotification`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` |  |
| `label` | `string` |  |
| `triggerType` | `NotificationTriggerType` |  |
| `expenseId?` | `string` | bill-before: which recurring expense to watch |
| `daysBefore?` | `number` | bill-before: fire N days before the dueDay |
| `monthlyDay?` | `number` | monthly-day: day of month (1–28) |
| `triggerDate?` | `number` | one-time: timestamp of the target date |
| `triggerTime?` | `string` | 'HH:MM' — time of day to fire (undefined = fires at any time on first app open that day) |
| `customMessage?` | `string` |  |
| `linkedItemId?` | `string` | optional: ID of the item this reminder was created from |
| `linkedItemType?` | `NotifLinkedItemType` |  |
| `active` | `boolean` |  |
| `lastFiredAt?` | `string` | 'YYYY-MM-DD' — prevents double-fire on the same calendar day |
| `createdAt` | `number` |  |
| `updatedAt` | `number` |  |
