export type MascotGender = 'penny' | 'buck';

export type IncomeFrequency =
  | 'hourly'
  | 'weekly'
  | 'biweekly'
  | 'semimonthly'
  | 'monthly'
  | 'annual'
  | 'once';

export type PaymentCycle = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export type DebtStrategy = 'avalanche' | 'snowball' | 'custom';

// ── Vault / Config ────────────────────────────────────────────────────────────

export interface VaultConfig {
  setupComplete: boolean;
  publicKeyArmored: string;
  encryptedVaultKey: string;
  profileName: string;
  mascotGender: MascotGender;
  mascotName: string;
}

export interface ThemeSettings {
  colorScheme: 'light' | 'dark' | 'auto';
  accentColor: string;
}

// ── Encrypted storage envelope ────────────────────────────────────────────────

export interface EncryptedRecord {
  iv: number[];
  data: number[];
}

// ── Financial domain ──────────────────────────────────────────────────────────

export type AvatarType =
  | 'male'
  | 'female'
  | 'child'        // legacy — treated as baby-female in display
  | 'baby-male'
  | 'baby-female'
  | 'child-male'
  | 'child-female'
  | 'teen-male'
  | 'teen-female';

export interface HouseholdMember {
  id: string;
  name: string;
  avatarType?: AvatarType;
  createdAt: number;
}

export interface IncomeSource {
  id: string;
  memberId: string;
  name: string;
  amount: number;
  amount2?: number; // second paycheck when frequency === 'semimonthly' and paychecks differ
  frequency: IncomeFrequency;
  active: boolean;
  date?: number; // used only when frequency === 'once'
  createdAt: number;
  updatedAt: number;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
  monthlyBudget?: number; // envelope budgeting cap — undefined = no cap set
  createdAt: number;
}

export interface Expense {
  id: string;
  categoryId: string;
  memberId: string | null;
  description: string;
  amount: number;
  date: number;        // for recurring bills with dueDay: the date the bill was last marked paid
  recurring: boolean;
  recurringFrequency: IncomeFrequency | null;
  dueDay?: number;     // day of month this bill is due (1–28); recurring bills only
  threshold?: number;  // max expected monthly cost; enables overage tracking
  createdAt: number;
}

export interface ExpensePaidRecord {
  id: string;
  expenseId: string;
  amount: number;   // actual amount paid (may differ from expense.amount for variable bills)
  date: number;     // timestamp when marked paid
  createdAt: number;
}

export type DebtAccountType = 'card' | 'mortgage' | 'medical' | 'loan';

export interface DebtAccount {
  id: string;
  type: DebtAccountType;
  name: string;
  balance: number;
  apr: number;
  creditLimit?: number;       // cards only
  originalAmount?: number;    // mortgage / loan original principal
  termMonths?: number;        // mortgage / loan term in months
  minimumPaymentType?: 'fixed' | 'percentage';
  minimumPaymentValue?: number;
  introAprEndDate?: number;   // timestamp; 0% APR until this date (cards only)
  paymentCycle: PaymentCycle;
  dueDay?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DebtPayment {
  id: string;
  accountId: string;
  amount: number;
  date: number;
  type: 'regular' | 'extra';
  note?: string;
  createdAt: number;
}

export interface CardCharge {
  id: string;
  accountId: string;
  merchant: string;
  amount: number;
  date: number;
  categoryId?: string;
  note?: string;
  createdAt: number;
}

// ── Amortization ──────────────────────────────────────────────────────────────

export interface AmortizationPeriod {
  period: number;
  date: Date;
  payment: number;
  principal: number;
  interest: number;
  remainingBalance: number;
}

export interface AmortizationResult {
  schedule: AmortizationPeriod[];
  totalInterest: number;
  totalPaid: number;
  originalBalance: number;
  debtFreeDate: Date;
  periodsToPayoff: number;
}

export interface MultiCardMonthly {
  month: number;
  date: Date;
  totalBalance: number;
}

export interface MultiCardResult {
  monthly: MultiCardMonthly[];
  paidOffOrder: string[];
  totalInterest: number;
  totalPaid: number;
  debtFreeDate: Date | null;
}

// ── Scenario films ────────────────────────────────────────────────────────────

export interface ScenarioItem {
  id: string;
  type: 'income' | 'expense';
  description: string;
  amount: number;
  frequency: IncomeFrequency;
  recurring: boolean; // false = one-time lump sum; frequency is ignored
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  color: string;
  active: boolean;
  items: ScenarioItem[];
  createdAt: number;
  updatedAt: number;
}

// ── Data sharing ──────────────────────────────────────────────────────────────

export interface SharingKey {
  id: string;
  label: string;
  publicKeyArmored: string;
  fingerprint: string;
  email: string;
  addedAt: number;
}

// ── Mascot triggers ───────────────────────────────────────────────────────────

export type MascotTrigger =
  | 'greeting'
  | 'minimum-payment-trap'
  | 'negative-cashflow'
  | 'debt-free-improvement'
  | 'budget-milestone'
  | 'payment-due'
  | 'payment-overdue'
  | 'briefing'
  | 'expense-trend'
  | 'custom';

export interface MascotMessage {
  trigger: MascotTrigger;
  lines: string[];
}
