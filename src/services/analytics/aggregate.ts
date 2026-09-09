import { daysBetween, formatMonthLabel, monthsBetween } from '@/lib/date';
import { round } from '@/lib/utils';
import type { ISODate } from '@/types/common';
import type { CategoryTree } from '@/types/category';
import type { Transaction } from '@/types/transaction';
import type { CurrencyCode } from '@/types/currency';
import type {
  AntExpenseReport,
  CategoryBreakdown,
  CurrencyHolding,
  ComparisonMetric,
  DailyPoint,
  MerchantRanking,
  MonthlyPoint,
  PendingInstallment,
  PeriodSummary,
  SubcategoryBreakdown,
} from '@/types/report';

/** Money that leaves the account. Transfers move value, they don't consume it. */
export const isSpending = (t: Transaction) => t.type === 'expense';
/** Compra o venta de moneda extranjera: cambia de bolsillo, no se gasta. */
export const isExchange = (t: Transaction) => Boolean(t.exchange_kind);
/** Money that comes in. Refunds reduce spending, so they count as income here. */
export const isEarning = (t: Transaction) => t.type === 'income' || t.type === 'refund';

/**
 * Lo que queda disponible en la moneda base.
 *
 * Comprar moneda extranjera descuenta los pesos que salieron y venderla los
 * suma; el resto de las transferencias mueven plata de un bolsillo propio a
 * otro y no cambian el total.
 *
 * Lo que vence más adelante —la cuota de noviembre— no salió todavía del
 * bolsillo, así que la cuenta se corta hoy.
 */
export function runningBalance(rows: Transaction[], until: ISODate): number {
  return round(
    rows
      .filter((t) => t.transaction_date <= until)
      .reduce((acc, t) => {
      if (isEarning(t)) return acc + t.base_amount;
      if (isSpending(t)) return acc - t.base_amount;
      if (t.exchange_kind === 'buy') return acc - t.base_amount;
      if (t.exchange_kind === 'sell') return acc + t.base_amount;
      return acc;
    }, 0),
    2,
  );
}

/** Lo que falta pagar de cada compra en cuotas, una fila por compra. */
export function pendingInstallments(rows: Transaction[], until: ISODate): PendingInstallment[] {
  const plans = new Map<string, Transaction[]>();
  for (const row of rows) {
    if (!row.installment_id) continue;
    plans.set(row.installment_id, [...(plans.get(row.installment_id) ?? []), row]);
  }

  return [...plans.entries()]
    .map(([installment_id, group]) => {
      const pending = group.filter((row) => row.transaction_date > until);
      return {
        installment_id,
        description: group[0].description,
        installment_count: group[0].installment_count ?? group.length,
        paid_count: group.length - pending.length,
        pending_count: pending.length,
        pending_amount: round(pending.reduce((acc, row) => acc + row.base_amount, 0), 2),
        next_date: pending.map((row) => row.transaction_date).sort()[0] ?? '',
      };
    })
    .filter((plan) => plan.pending_count > 0)
    .sort((a, b) => a.next_date.localeCompare(b.next_date));
}

/**
 * Cuánto tiene de cada moneda que compró, cuánto le costó juntarlo y a qué
 * precio promedio lo compró. Las monedas que quedaron en cero no se muestran.
 */
export function currencyHoldings(rows: Transaction[]): CurrencyHolding[] {
  const buckets = new Map<CurrencyCode, { amount: number; invested: number; bought: number; boughtBase: number }>();

  for (const row of rows) {
    if (!row.exchange_kind) continue;
    const bucket = buckets.get(row.currency) ?? { amount: 0, invested: 0, bought: 0, boughtBase: 0 };
    const sign = row.exchange_kind === 'buy' ? 1 : -1;
    bucket.amount += sign * row.amount;
    bucket.invested += sign * row.base_amount;
    if (row.exchange_kind === 'buy') {
      bucket.bought += row.amount;
      bucket.boughtBase += row.base_amount;
    }
    buckets.set(row.currency, bucket);
  }

  return [...buckets.entries()]
    .map(([currency, bucket]) => ({
      currency,
      amount: round(bucket.amount, 2),
      invested: round(bucket.invested, 2),
      avg_rate: bucket.bought > 0 ? round(bucket.boughtBase / bucket.bought, 2) : null,
    }))
    .filter((holding) => holding.amount !== 0)
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function inRange(t: Transaction, from: ISODate, to: ISODate): boolean {
  return t.transaction_date >= from && t.transaction_date <= to;
}

export function summarize(rows: Transaction[], from: ISODate, to: ISODate, currency: string): PeriodSummary {
  const scoped = rows.filter((t) => inRange(t, from, to));
  const income = round(scoped.filter(isEarning).reduce((acc, t) => acc + t.base_amount, 0), 2);
  const expense = round(scoped.filter(isSpending).reduce((acc, t) => acc + t.base_amount, 0), 2);
  const savings = round(income - expense, 2);

  return {
    from,
    to,
    income,
    expense,
    savings,
    savings_rate: income > 0 ? round((savings / income) * 100, 1) : 0,
    transaction_count: scoped.length,
    currency,
  };
}

export function compare(current: number, previous: number, higherIsBetter: boolean): ComparisonMetric {
  const delta = round(current - previous, 2);
  return {
    current,
    previous,
    delta,
    delta_ratio: previous === 0 ? null : round((delta / Math.abs(previous)) * 100, 1),
    higher_is_better: higherIsBetter,
  };
}

export function categoryBreakdown(
  rows: Transaction[],
  categories: CategoryTree[],
  options: { previous?: Transaction[]; type?: 'expense' | 'income' } = {},
): CategoryBreakdown[] {
  const predicate = options.type === 'income' ? isEarning : isSpending;
  const scoped = rows.filter(predicate);
  const total = scoped.reduce((acc, t) => acc + t.base_amount, 0);

  const buckets = new Map<string, { amount: number; count: number }>();
  for (const row of scoped) {
    const key = row.category_id ?? 'sin-categoria';
    const bucket = buckets.get(key) ?? { amount: 0, count: 0 };
    bucket.amount += row.base_amount;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  const previousBuckets = new Map<string, number>();
  for (const row of (options.previous ?? []).filter(predicate)) {
    const key = row.category_id ?? 'sin-categoria';
    previousBuckets.set(key, (previousBuckets.get(key) ?? 0) + row.base_amount);
  }

  return [...buckets.entries()]
    .map(([categoryId, bucket]) => {
      const category = categories.find((c) => c.id === categoryId);
      const previousAmount = previousBuckets.get(categoryId);
      return {
        category_id: category?.id ?? null,
        category_name: category?.name ?? 'Sin categoría',
        color: category?.color ?? '#94a3b8',
        icon: category?.icon,
        amount: round(bucket.amount, 2),
        ratio: total > 0 ? round((bucket.amount / total) * 100, 1) : 0,
        transaction_count: bucket.count,
        previous_amount: previousAmount === undefined ? undefined : round(previousAmount, 2),
        delta_ratio:
          previousAmount === undefined || previousAmount === 0
            ? null
            : round(((bucket.amount - previousAmount) / previousAmount) * 100, 1),
      } satisfies CategoryBreakdown;
    })
    .sort((a, b) => b.amount - a.amount);
}

export function subcategoryBreakdown(rows: Transaction[], categories: CategoryTree[]): SubcategoryBreakdown[] {
  const scoped = rows.filter(isSpending);
  const total = scoped.reduce((acc, t) => acc + t.base_amount, 0);
  const buckets = new Map<string, { amount: number; count: number }>();

  for (const row of scoped) {
    const key = `${row.category_id ?? 'sin'}|${row.subcategory_id ?? 'sin'}`;
    const bucket = buckets.get(key) ?? { amount: 0, count: 0 };
    bucket.amount += row.base_amount;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const [categoryId, subcategoryId] = key.split('|');
      const category = categories.find((c) => c.id === categoryId);
      const sub = category?.subcategories.find((s) => s.id === subcategoryId);
      return {
        category_id: category?.id ?? null,
        category_name: category?.name ?? 'Sin categoría',
        subcategory_id: sub?.id ?? null,
        subcategory_name: sub?.name ?? 'Sin subcategoría',
        color: category?.color ?? '#94a3b8',
        amount: round(bucket.amount, 2),
        ratio: total > 0 ? round((bucket.amount / total) * 100, 1) : 0,
        transaction_count: bucket.count,
      } satisfies SubcategoryBreakdown;
    })
    .sort((a, b) => b.amount - a.amount);
}

export function monthlySeries(rows: Transaction[], from: ISODate, to: ISODate): MonthlyPoint[] {
  const months = monthsBetween(from, to);
  const index = new Map(months.map((month) => [month, { income: 0, expense: 0 }]));

  for (const row of rows) {
    const month = row.transaction_date.slice(0, 7);
    const bucket = index.get(month);
    if (!bucket) continue;
    if (isEarning(row)) bucket.income += row.base_amount;
    else if (isSpending(row)) bucket.expense += row.base_amount;
  }

  return months.map((month) => {
    const bucket = index.get(month)!;
    return {
      month,
      label: formatMonthLabel(month),
      income: round(bucket.income, 2),
      expense: round(bucket.expense, 2),
      savings: round(bucket.income - bucket.expense, 2),
    };
  });
}

export function dailySeries(rows: Transaction[], from: ISODate, to: ISODate): DailyPoint[] {
  const days = daysBetween(from, to);
  const index = new Map(days.map((day) => [day, { income: 0, expense: 0, count: 0 }]));

  for (const row of rows) {
    const bucket = index.get(row.transaction_date);
    if (!bucket) continue;
    if (isEarning(row)) bucket.income += row.base_amount;
    else if (isSpending(row)) bucket.expense += row.base_amount;
    bucket.count += 1;
  }

  return days.map((date) => {
    const bucket = index.get(date)!;
    return { date, income: round(bucket.income, 2), expense: round(bucket.expense, 2), count: bucket.count };
  });
}

export function merchantRanking(rows: Transaction[], limit = 10): MerchantRanking[] {
  const buckets = new Map<string, { amount: number; count: number; last: ISODate }>();

  for (const row of rows.filter(isSpending)) {
    const name = (row.merchant_name || row.description || 'Sin comercio').trim();
    const bucket = buckets.get(name) ?? { amount: 0, count: 0, last: row.transaction_date };
    bucket.amount += row.base_amount;
    bucket.count += 1;
    if (row.transaction_date > bucket.last) bucket.last = row.transaction_date;
    buckets.set(name, bucket);
  }

  return [...buckets.entries()]
    .map(([merchant, bucket]) => ({
      merchant,
      amount: round(bucket.amount, 2),
      count: bucket.count,
      last_date: bucket.last,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export function paymentMethodBreakdown(
  rows: Transaction[],
  names: Map<string, string>,
): { name: string; amount: number; count: number }[] {
  const buckets = new Map<string, { amount: number; count: number }>();
  for (const row of rows.filter(isSpending)) {
    const key = row.payment_method_id ?? 'sin';
    const bucket = buckets.get(key) ?? { amount: 0, count: 0 };
    bucket.amount += row.base_amount;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      name: names.get(key) ?? 'Sin especificar',
      amount: round(bucket.amount, 2),
      count: bucket.count,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * "Gastos hormiga": small purchases that look harmless one at a time.
 * The threshold adapts to the user's own spending instead of being hardcoded.
 */
export function antExpenses(rows: Transaction[], from: ISODate, to: ISODate, explicitThreshold?: number): AntExpenseReport {
  const scoped = rows.filter((t) => isSpending(t) && inRange(t, from, to));
  if (!scoped.length) {
    return { threshold: explicitThreshold ?? 0, count: 0, total: 0, monthly_estimate: 0, groups: [] };
  }

  // The 35th percentile of the person's own expenses: robust when a handful of
  // big payments (rent, prepaga) would otherwise drag a median-based cut-off around.
  const amounts = scoped.map((t) => t.base_amount).sort((a, b) => a - b);
  const percentile35 = amounts[Math.min(amounts.length - 1, Math.floor(amounts.length * 0.35))];
  const threshold = round(explicitThreshold ?? Math.max(1000, percentile35), 0);

  const ants = scoped.filter((t) => t.base_amount <= threshold);
  const total = round(ants.reduce((acc, t) => acc + t.base_amount, 0), 2);
  const days = Math.max(1, daysBetween(from, to).length);

  const buckets = new Map<string, { count: number; total: number }>();
  for (const ant of ants) {
    const label = (ant.merchant_name || ant.description || 'Otros').trim();
    const bucket = buckets.get(label) ?? { count: 0, total: 0 };
    bucket.count += 1;
    bucket.total += ant.base_amount;
    buckets.set(label, bucket);
  }

  return {
    threshold,
    count: ants.length,
    total,
    monthly_estimate: round((total / days) * 30, 2),
    groups: [...buckets.entries()]
      .filter(([, bucket]) => bucket.count >= 2)
      .map(([label, bucket]) => ({
        label,
        count: bucket.count,
        total: round(bucket.total, 2),
        average: round(bucket.total / bucket.count, 2),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8),
  };
}
