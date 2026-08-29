import type { IncomeSource } from '@/types';

export function getPaydaysInMonth(source: IncomeSource, year: number, month: number): number[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Semi-monthly with an explicit schedule doesn't need a paydayRef
  if (source.frequency === 'semimonthly' && source.semimonthlySchedule) {
    return source.semimonthlySchedule === '1-15'
      ? [1, Math.min(15, daysInMonth)]
      : [Math.min(15, daysInMonth), daysInMonth];
  }

  if (!source.paydayRef) return [];
  const ref = new Date(source.paydayRef);
  const days: number[] = [];

  switch (source.frequency) {
    case 'monthly':
      days.push(Math.min(ref.getDate(), daysInMonth));
      break;
    case 'semimonthly': {
      // Legacy: no semimonthlySchedule set; fall back to paydayRef-based calculation
      const d1 = Math.min(ref.getDate(), daysInMonth);
      const d2 = Math.min(d1 + 15, daysInMonth);
      days.push(d1);
      if (d2 !== d1) days.push(d2);
      break;
    }
    case 'biweekly': {
      const refMs = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
      for (let d = 1; d <= daysInMonth; d++) {
        const diff = Math.round((Date.UTC(year, month, d) - refMs) / 86400000);
        if (diff % 14 === 0) days.push(d);
      }
      break;
    }
    case 'weekly': {
      const dow = ref.getDay();
      for (let d = 1; d <= daysInMonth; d++) {
        if (new Date(year, month, d).getDay() === dow) days.push(d);
      }
      break;
    }
    case 'quarterly': {
      const monthDiff = ((month - ref.getMonth()) % 3 + 3) % 3;
      if (monthDiff === 0) days.push(Math.min(ref.getDate(), daysInMonth));
      break;
    }
    case 'annual':
      if (ref.getMonth() === month) days.push(Math.min(ref.getDate(), daysInMonth));
      break;
  }

  return [...new Set(days)].sort((a, b) => a - b);
}
