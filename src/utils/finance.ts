import type { IncomeFrequency } from '@/types';

export const MONTHLY_FACTORS: Record<IncomeFrequency, number> = {
  hourly:      160,
  weekly:      4.333,
  biweekly:    2.167,
  semimonthly: 2,
  monthly:     1,
  quarterly:   1 / 3,
  annual:      1 / 12,
  once:        0, // one-time events excluded from recurring monthly totals
};

export const FREQUENCY_LABELS: Record<IncomeFrequency, string> = {
  hourly:      'per hour',
  weekly:      'per week',
  biweekly:    'every 2 weeks',
  semimonthly: 'twice monthly',
  monthly:     'per month',
  quarterly:   'every quarter',
  annual:      'per year',
  once:        'one-time',
};

export const FREQUENCY_OPTIONS: { value: IncomeFrequency; label: string }[] = [
  { value: 'weekly',      label: 'Weekly' },
  { value: 'biweekly',   label: 'Every 2 weeks' },
  { value: 'semimonthly', label: 'Twice monthly' },
  { value: 'monthly',    label: 'Monthly' },
  { value: 'quarterly',  label: 'Quarterly' },
  { value: 'annual',     label: 'Annually' },
  { value: 'once',       label: 'One-time' },
];

export function toMonthly(amount: number, frequency: IncomeFrequency): number {
  return amount * MONTHLY_FACTORS[frequency];
}

// Use this for IncomeSource objects — handles the semi-monthly unequal-paycheck case.
export function sourceMonthly(source: { amount: number; amount2?: number; frequency: IncomeFrequency }): number {
  if (source.frequency === 'semimonthly' && source.amount2 != null) {
    return source.amount + source.amount2;
  }
  return toMonthly(source.amount, source.frequency);
}

export const SUPPORTED_CURRENCIES: Array<{ code: string; name: string }> = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'KRW', name: 'South Korean Won' },
];

// ── Currency formatters ───────────────────────────────────────────────────────
// These are wrapper objects so all import sites stay unchanged (they only call
// .format()). The underlying Intl.NumberFormat instances are swapped out by
// setCurrency() without touching any consumer.

let _currency = 'USD';
let _locale   = navigator.language || 'en-US';

let _fmt = new Intl.NumberFormat(_locale, {
  style: 'currency',
  currency: _currency,
  maximumFractionDigits: 0,
});

let _fmtCents = new Intl.NumberFormat(_locale, {
  style: 'currency',
  currency: _currency,
  // No fractional-digit overrides — the currency's natural precision is used
  // (2 for USD/EUR/GBP, 0 for JPY/KRW, etc.).
});

export const fmt      = { format: (n: number): string => _fmt.format(n) };
export const fmtCents = { format: (n: number): string => _fmtCents.format(n) };

export function setCurrency(code: string): void {
  _currency  = code;
  _fmt       = new Intl.NumberFormat(_locale, { style: 'currency', currency: code, maximumFractionDigits: 0 });
  _fmtCents  = new Intl.NumberFormat(_locale, { style: 'currency', currency: code });
}

export function getCurrentCurrency(): string { return _currency; }

export const CATEGORY_COLORS = [
  // Reds & pinks
  '#DC2626', // red
  '#E11D48', // rose
  '#DB2777', // pink
  '#BE185D', // deep rose
  // Oranges & ambers
  '#EA580C', // orange
  '#D97706', // amber
  '#B45309', // rust
  '#C9A84C', // gold
  // Yellows & limes
  '#CA8A04', // yellow
  '#65A30D', // lime
  // Greens
  '#16A34A', // green
  '#15803D', // forest
  '#065F46', // emerald
  '#2D5A27', // farm green
  // Teals & cyans
  '#0D9488', // teal-green
  '#0891B2', // teal
  '#0E7490', // dark teal
  // Blues
  '#0284C7', // sky blue
  '#1D4ED8', // blue
  '#1B2A4A', // navy
  // Indigos & purples
  '#4338CA', // indigo
  '#7C3AED', // purple
  '#9333EA', // bright purple
  '#6B21A8', // violet
  '#A21CAF', // fuchsia
  // Browns & neutrals
  '#92400E', // brown
  '#78350F', // dark brown
  '#374151', // slate
  '#475569', // slate-blue
  '#6B7280', // gray
  '#1F2937', // charcoal
];
