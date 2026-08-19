import type { IncomeFrequency } from '@/types';

export const MONTHLY_FACTORS: Record<IncomeFrequency, number> = {
  hourly:      160,
  weekly:      4.333,
  biweekly:    2.167,
  semimonthly: 2,
  monthly:     1,
  annual:      1 / 12,
  once:        0, // one-time events excluded from recurring monthly totals
};

export const FREQUENCY_LABELS: Record<IncomeFrequency, string> = {
  hourly:      'per hour',
  weekly:      'per week',
  biweekly:    'every 2 weeks',
  semimonthly: 'twice monthly',
  monthly:     'per month',
  annual:      'per year',
  once:        'one-time',
};

export const FREQUENCY_OPTIONS: { value: IncomeFrequency; label: string }[] = [
  { value: 'hourly',      label: 'Hourly' },
  { value: 'weekly',      label: 'Weekly' },
  { value: 'biweekly',   label: 'Every 2 weeks' },
  { value: 'semimonthly', label: 'Twice monthly' },
  { value: 'monthly',    label: 'Monthly' },
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

export const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export const fmtCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const CATEGORY_COLORS = [
  '#2D5A27', // farm green
  '#1B2A4A', // navy
  '#C9A84C', // gold
  '#B45309', // rust
  '#7C3AED', // purple
  '#0891B2', // teal
  '#BE185D', // rose
  '#374151', // slate
  '#065F46', // emerald
  '#6B21A8', // violet
];
