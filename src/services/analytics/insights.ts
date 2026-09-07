import { formatMoney, formatPercent } from '@/lib/money';
import { isWeekend } from '@/lib/date';
import { round, uid } from '@/lib/utils';
import type { AiInsight } from '@/types/ai';
import type { BudgetProgress } from '@/types/budget';
import type { CategoryTree } from '@/types/category';
import type { Transaction } from '@/types/transaction';
import type { RecurringExpense } from '@/types/report';
import { antExpenses, categoryBreakdown, isSpending, summarize } from './aggregate';

export interface InsightInput {
  current: Transaction[];
  previous: Transaction[];
  categories: CategoryTree[];
  recurring: RecurringExpense[];
  budgets: BudgetProgress[];
  range: { from: string; to: string };
  previousRange: { from: string; to: string };
  currency: string;
}

/**
 * Observations, not advice. Every statement is computed from the user's own rows
 * and ships with the numbers behind it so it can be checked.
 */
export function buildInsights(input: InsightInput): AiInsight[] {
  const { current, previous, categories, recurring, budgets, range, previousRange, currency } = input;
  const insights: AiInsight[] = [];
  const money = (value: number) => formatMoney(value, { currency });

  const summary = summarize(current, range.from, range.to, currency);
  const prevSummary = summarize(previous, previousRange.from, previousRange.to, currency);

  const currentByCategory = categoryBreakdown(current, categories, { previous });

  // 1. Category movements worth naming.
  for (const category of currentByCategory.slice(0, 6)) {
    const previousAmount = category.previous_amount;
    const delta = category.delta_ratio;
    if (previousAmount === undefined || previousAmount === 0) continue;
    if (delta === null || delta === undefined || Math.abs(delta) < 12) continue;
    insights.push({
      id: uid(),
      kind: 'trend',
      title: `${category.category_name} ${delta > 0 ? 'subió' : 'bajó'} ${formatPercent(Math.abs(delta))}`,
      body: `Pasaste de ${money(previousAmount)} a ${money(category.amount)} en ${category.category_name.toLowerCase()} respecto del período anterior.`,
      severity: delta > 0 ? 'warning' : 'positive',
      evidence: [
        { label: 'Período actual', value: money(category.amount) },
        { label: 'Período anterior', value: money(previousAmount) },
        { label: 'Movimientos', value: String(category.transaction_count) },
      ],
    });
  }

  // 2. Composition: what share of income each big category eats.
  if (summary.income > 0 && currentByCategory.length) {
    const top = currentByCategory[0];
    const share = round((top.amount / summary.income) * 100, 1);
    insights.push({
      id: uid(),
      kind: 'composition',
      title: `${top.category_name} representa el ${formatPercent(share)} de tus ingresos`,
      body: `Gastaste ${money(top.amount)} en ${top.category_name.toLowerCase()} sobre ${money(summary.income)} de ingresos en el período.`,
      severity: share > 40 ? 'warning' : 'info',
      evidence: [
        { label: 'Gasto', value: money(top.amount) },
        { label: 'Ingresos', value: money(summary.income) },
      ],
    });
  }

  // 3. Subscriptions.
  const subscriptions = recurring.filter((r) => r.cadence === 'monthly');
  if (subscriptions.length >= 2) {
    const total = subscriptions.reduce((acc, r) => acc + r.average_amount, 0);
    insights.push({
      id: uid(),
      kind: 'recurring',
      title: `Tenés ${subscriptions.length} gastos recurrentes mensuales`,
      body: `Suman ${money(total)} por mes: ${subscriptions.slice(0, 4).map((r) => r.label).join(', ')}${subscriptions.length > 4 ? ' y otros' : ''}.`,
      severity: 'info',
      evidence: subscriptions.slice(0, 5).map((r) => ({ label: r.label, value: money(r.average_amount) })),
    });
  }

  // 4. Weekend habit.
  const spending = current.filter(isSpending);
  const weekend = spending.filter((t) => isWeekend(t.transaction_date));
  if (spending.length >= 10 && weekend.length) {
    const weekendTotal = weekend.reduce((acc, t) => acc + t.base_amount, 0);
    const share = round((weekendTotal / spending.reduce((acc, t) => acc + t.base_amount, 0)) * 100, 1);
    if (share >= 30) {
      insights.push({
        id: uid(),
        kind: 'habit',
        title: `El ${formatPercent(share)} de tus gastos ocurre los fines de semana`,
        body: `Son ${weekend.length} movimientos por ${money(weekendTotal)} entre sábados y domingos.`,
        severity: 'info',
        evidence: [
          { label: 'Fin de semana', value: money(weekendTotal) },
          { label: 'Movimientos', value: String(weekend.length) },
        ],
      });
    }
  }

  // 5. Ant expenses.
  const ants = antExpenses(current, range.from, range.to);
  if (ants.count >= 5 && ants.total > 0) {
    insights.push({
      id: uid(),
      kind: 'habit',
      title: `Gastos chicos por ${money(ants.total)}`,
      body: `${ants.count} movimientos de hasta ${money(ants.threshold)} suman ${money(ants.total)}. A este ritmo son ${money(ants.monthly_estimate)} por mes.`,
      severity: 'info',
      evidence: ants.groups.slice(0, 4).map((g) => ({ label: `${g.label} (${g.count})`, value: money(g.total) })),
    });
  }

  // 6. Budgets already over the line.
  for (const budget of budgets.filter((b) => b.status === 'exceeded' || b.status === 'danger')) {
    insights.push({
      id: uid(),
      kind: 'budget',
      title:
        budget.status === 'exceeded'
          ? `Excediste el límite de ${budget.budget.name}`
          : `Estás cerca del límite de ${budget.budget.name}`,
      body: `Llevás ${money(budget.spent)} de ${money(budget.budget.amount)} (${formatPercent(round(budget.ratio * 100, 1))}).`,
      severity: 'warning',
      evidence: [
        { label: 'Gastado', value: money(budget.spent) },
        { label: 'Límite', value: money(budget.budget.amount) },
      ],
    });
  }

  // 7. Savings rate.
  if (summary.income > 0) {
    const positive = summary.savings_rate >= 0;
    insights.push({
      id: uid(),
      kind: 'trend',
      title: `Tasa de ahorro del ${formatPercent(summary.savings_rate)}`,
      body: positive
        ? `Te quedaron ${money(summary.savings)} sobre ${money(summary.income)} de ingresos.`
        : `Gastaste ${money(Math.abs(summary.savings))} más de lo que ingresó en el período.`,
      severity: positive ? 'positive' : 'warning',
      evidence: [
        { label: 'Ingresos', value: money(summary.income) },
        { label: 'Gastos', value: money(summary.expense) },
        { label: 'Anterior', value: formatPercent(prevSummary.savings_rate) },
      ],
    });
  }

  return insights.slice(0, 8);
}
