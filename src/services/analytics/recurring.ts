import { differenceInCalendarDays, parseISO } from 'date-fns';
import { normalizeText, round, uid } from '@/lib/utils';
import { toISO, addDays } from '@/lib/date';
import type { Transaction } from '@/types/transaction';
import type { RecurringExpense } from '@/types/report';

const CADENCES: { cadence: RecurringExpense['cadence']; min: number; max: number; days: number }[] = [
  { cadence: 'weekly', min: 5, max: 9, days: 7 },
  { cadence: 'monthly', min: 24, max: 38, days: 30 },
  { cadence: 'bimonthly', min: 50, max: 75, days: 60 },
  { cadence: 'yearly', min: 330, max: 400, days: 365 },
];

/**
 * Finds subscriptions and bills by looking for the same payee repeating at a
 * stable interval with a stable amount. No provider list is hardcoded — a local
 * gym charged every month is detected exactly like Netflix.
 */
export function detectRecurring(rows: Transaction[], userId: string): RecurringExpense[] {
  const groups = new Map<string, Transaction[]>();

  for (const row of rows) {
    if (row.type !== 'expense') continue;
    const key = normalizeText(row.merchant_name || row.description || '');
    if (key.length < 3) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const out: RecurringExpense[] = [];

  for (const [key, items] of groups) {
    if (items.length < 3) continue;
    const sorted = [...items].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      gaps.push(differenceInCalendarDays(parseISO(sorted[i].transaction_date), parseISO(sorted[i - 1].transaction_date)));
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const cadence = CADENCES.find((c) => avgGap >= c.min && avgGap <= c.max);
    if (!cadence) continue;
    // Two purchases days apart and one months later average into a plausible
    // cadence without being recurring at all: every gap has to fit the pattern.
    if (gaps.some((gap) => Math.abs(gap - avgGap) > Math.max(3, avgGap * 0.4))) continue;

    const amounts = sorted.map((t) => t.base_amount);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const deviation = Math.sqrt(amounts.reduce((acc, a) => acc + (a - mean) ** 2, 0) / amounts.length);
    // Prices move with inflation, so allow a wide but not unlimited spread.
    if (mean > 0 && deviation / mean > 0.45) continue;

    const last = sorted[sorted.length - 1];
    out.push({
      id: uid(),
      user_id: userId,
      merchant_key: key,
      label: last.merchant_name || last.description,
      average_amount: round(mean, 2),
      currency: last.base_currency,
      cadence: cadence.cadence,
      occurrences: sorted.length,
      last_date: last.transaction_date,
      next_estimated_date: toISO(addDays(parseISO(last.transaction_date), Math.round(avgGap))),
      category_id: last.category_id,
      confirmed: null,
      created_at: new Date().toISOString(),
    });
  }

  return out.sort((a, b) => b.average_amount - a.average_amount);
}
