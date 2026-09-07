import { format, parseISO, startOfMonth, endOfMonth, subMonths, subDays, startOfWeek, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatMoney, formatPercent } from '@/lib/money';
import { isWeekend, lastNMonths, monthRange, toISO } from '@/lib/date';
import { normalizeText, plural, round } from '@/lib/utils';
import type { AiQueryAnswer } from '@/types/ai';
import type { CategoryTree } from '@/types/category';
import type { Transaction } from '@/types/transaction';
import { categoryBreakdown, isEarning, isSpending, merchantRanking, monthlySeries, summarize } from './aggregate';

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export interface QueryContext {
  transactions: Transaction[];
  categories: CategoryTree[];
  currency: string;
  today?: Date;
}

interface ResolvedQuery {
  from: string;
  to: string;
  periodLabel: string;
  category: CategoryTree | null;
  subcategoryName: string | null;
  merchant: string | null;
  weekendOnly: boolean;
  metric: 'expense' | 'income' | 'savings' | 'where' | 'top_merchant' | 'count';
}

/**
 * Answers questions about the user's own data by computing them, not by asking a
 * model to do arithmetic. The AI layer can rephrase the result, but the numbers
 * always come from here — and every answer reports the rows it used.
 */
export function answerFinanceQuestion(question: string, ctx: QueryContext): AiQueryAnswer {
  const today = ctx.today ?? new Date();
  const resolved = resolveQuery(question, ctx, today);
  const currency = ctx.currency;
  const money = (value: number) => formatMoney(value, { currency });

  let rows = ctx.transactions.filter(
    (t) => t.transaction_date >= resolved.from && t.transaction_date <= resolved.to,
  );
  const filters: string[] = [resolved.periodLabel];

  if (resolved.category) {
    rows = rows.filter((t) => t.category_id === resolved.category!.id);
    filters.push(resolved.category.name);
  }
  if (resolved.subcategoryName) {
    const sub = resolved.category?.subcategories.find(
      (s) => normalizeText(s.name) === normalizeText(resolved.subcategoryName!),
    );
    if (sub) {
      rows = rows.filter((t) => t.subcategory_id === sub.id);
      filters.push(sub.name);
    }
  }
  if (resolved.merchant) {
    const needle = normalizeText(resolved.merchant);
    rows = rows.filter(
      (t) => normalizeText(`${t.merchant_name ?? ''} ${t.description}`).includes(needle),
    );
    filters.push(resolved.merchant);
  }
  if (resolved.weekendOnly) {
    rows = rows.filter((t) => isWeekend(t.transaction_date));
    filters.push('fines de semana');
  }

  const summary = summarize(rows, resolved.from, resolved.to, currency);
  const used = { transactions: rows.length, from: resolved.from, to: resolved.to, filters };

  if (!rows.length) {
    return {
      question,
      answer: `No encontré movimientos para ${filters.join(' · ').toLowerCase()}.`,
      metrics: [],
      used,
    };
  }

  switch (resolved.metric) {
    case 'income': {
      return {
        question,
        answer: `Ingresaron ${money(summary.income)} en ${resolved.periodLabel.toLowerCase()}, en ${plural(rows.filter(isEarning).length, 'movimiento')}.`,
        metrics: [
          { label: 'Ingresos', value: money(summary.income) },
          { label: 'Movimientos', value: String(rows.filter(isEarning).length) },
        ],
        chart: { kind: 'bar', data: monthChart(rows, resolved, 'income') },
        used,
      };
    }
    case 'savings': {
      return {
        question,
        answer: `Ahorraste ${money(summary.savings)} (${formatPercent(summary.savings_rate)} de tus ingresos) en ${resolved.periodLabel.toLowerCase()}.`,
        metrics: [
          { label: 'Ingresos', value: money(summary.income) },
          { label: 'Gastos', value: money(summary.expense) },
          { label: 'Ahorro', value: money(summary.savings) },
        ],
        chart: { kind: 'bar', data: monthChart(rows, resolved, 'savings') },
        used,
      };
    }
    case 'where': {
      const breakdown = categoryBreakdown(rows, ctx.categories);
      const top = breakdown[0];
      return {
        question,
        answer: top
          ? `En ${resolved.periodLabel.toLowerCase()} lo que más pesó fue ${top.category_name}: ${money(top.amount)}, el ${formatPercent(top.ratio)} de tus gastos.`
          : 'No hay gastos registrados en ese período.',
        metrics: breakdown.slice(0, 4).map((b) => ({ label: b.category_name, value: money(b.amount), hint: formatPercent(b.ratio) })),
        chart: { kind: 'pie', data: breakdown.slice(0, 6).map((b) => ({ label: b.category_name, value: b.amount })) },
        used,
      };
    }
    case 'top_merchant': {
      const ranking = merchantRanking(rows, 5);
      return {
        question,
        answer: ranking.length
          ? `Donde más gastaste fue ${ranking[0].merchant}: ${money(ranking[0].amount)} en ${plural(ranking[0].count, 'compra')}.`
          : 'No hay comercios registrados en ese período.',
        metrics: ranking.map((r) => ({ label: r.merchant, value: money(r.amount), hint: `${r.count} compras` })),
        chart: { kind: 'bar', data: ranking.map((r) => ({ label: r.merchant, value: r.amount })) },
        used,
      };
    }
    case 'count': {
      return {
        question,
        answer: `Registraste ${plural(rows.length, 'movimiento')} en ${resolved.periodLabel.toLowerCase()}.`,
        metrics: [{ label: 'Movimientos', value: String(rows.length) }],
        used,
      };
    }
    default: {
      const spending = rows.filter(isSpending);
      const average = spending.length ? round(summary.expense / spending.length, 2) : 0;
      const label = [resolved.category?.name, resolved.subcategoryName, resolved.merchant]
        .filter(Boolean)
        .join(' > ');
      return {
        question,
        answer: `Gastaste ${money(summary.expense)}${label ? ` en ${label}` : ''} en ${resolved.periodLabel.toLowerCase()} (${plural(spending.length, 'movimiento')}, promedio ${money(average)}).`,
        metrics: [
          { label: 'Total', value: money(summary.expense) },
          { label: 'Movimientos', value: String(spending.length) },
          { label: 'Promedio', value: money(average) },
        ],
        chart: { kind: 'bar', data: monthChart(rows, resolved, 'expense') },
        used,
      };
    }
  }
}

function monthChart(rows: Transaction[], resolved: ResolvedQuery, key: 'expense' | 'income' | 'savings') {
  const series = monthlySeries(rows, resolved.from, resolved.to);
  return series.map((point) => ({ label: point.label, value: point[key] }));
}

function resolveQuery(question: string, ctx: QueryContext, today: Date): ResolvedQuery {
  const q = normalizeText(question);

  const period = resolvePeriod(q, today);
  const category = ctx.categories.find((c) => matchesCategory(q, c)) ?? null;
  const subcategoryName =
    ctx.categories
      .flatMap((c) => c.subcategories)
      .find((s) => q.includes(normalizeText(s.name)))?.name ?? null;

  const merchant = resolveMerchant(q, ctx);

  let metric: ResolvedQuery['metric'] = 'expense';
  if (/\bahorr/.test(q)) metric = 'savings';
  else if (/\bcobr|ingres|gan(e|o)\b|entro\b/.test(q)) metric = 'income';
  else if (/donde|en que se me fue|se me fue|en que gast/.test(q)) metric = 'where';
  else if (/comercio|negocio|local|donde compr/.test(q)) metric = 'top_merchant';
  else if (/cuantos movimientos|cuantas compras|cuantas veces/.test(q)) metric = 'count';

  return {
    ...period,
    category,
    subcategoryName: subcategoryName && (!category || category.subcategories.some((s) => s.name === subcategoryName)) ? subcategoryName : null,
    merchant,
    weekendOnly: /fin(es)? de semana|sabado|domingo/.test(q),
    metric,
  };
}

function matchesCategory(q: string, category: CategoryTree): boolean {
  if (q.includes(normalizeText(category.name))) return true;
  // "comida" should reach "Alimentación".
  const aliases: Record<string, string[]> = {
    alimentacion: ['comida', 'comer', 'super', 'supermercado', 'delivery'],
    transporte: ['nafta', 'combustible', 'viajes', 'auto'],
    entretenimiento: ['salidas', 'streaming', 'diversion'],
    hogar: ['casa', 'servicios', 'expensas', 'alquiler'],
    salud: ['medico', 'farmacia', 'obra social'],
  };
  return (aliases[category.slug] ?? []).some((alias) => q.includes(alias));
}

function resolveMerchant(q: string, ctx: QueryContext): string | null {
  const names = new Set<string>();
  for (const row of ctx.transactions) {
    if (row.merchant_name) names.add(row.merchant_name);
  }
  const found = [...names]
    .filter((name) => q.includes(normalizeText(name)))
    .sort((a, b) => b.length - a.length)[0];
  return found ?? null;
}

function resolvePeriod(q: string, today: Date): { from: string; to: string; periodLabel: string } {
  const monthIndex = MONTHS.findIndex((month) => q.includes(month));
  if (monthIndex >= 0) {
    const year = /\b(20\d{2})\b/.exec(q)?.[1];
    let date = new Date(year ? Number(year) : today.getFullYear(), monthIndex, 1);
    if (!year && date > today) date = new Date(today.getFullYear() - 1, monthIndex, 1);
    return {
      from: toISO(startOfMonth(date)),
      to: toISO(endOfMonth(date)),
      periodLabel: format(date, 'MMMM yyyy', { locale: es }),
    };
  }
  if (/mes pasado/.test(q)) {
    const range = monthRange(today, -1);
    return { from: range.from, to: range.to, periodLabel: range.label };
  }
  if (/este mes|del mes|mensual/.test(q)) {
    const range = monthRange(today);
    return { from: range.from, to: range.to, periodLabel: range.label };
  }
  if (/hoy/.test(q)) {
    return { from: toISO(today), to: toISO(today), periodLabel: 'hoy' };
  }
  if (/ayer/.test(q)) {
    const yesterday = subDays(today, 1);
    return { from: toISO(yesterday), to: toISO(yesterday), periodLabel: 'ayer' };
  }
  if (/esta semana|semana/.test(q)) {
    return {
      from: toISO(startOfWeek(today, { weekStartsOn: 1 })),
      to: toISO(endOfWeek(today, { weekStartsOn: 1 })),
      periodLabel: 'esta semana',
    };
  }
  const lastMonths = /ultimos? (\d{1,2}) meses/.exec(q);
  if (lastMonths) {
    const n = Math.min(24, Math.max(2, Number(lastMonths[1])));
    const range = lastNMonths(n, today);
    return { from: range.from, to: range.to, periodLabel: range.label };
  }
  if (/este ano|anual|ultimo ano/.test(q)) {
    return {
      from: toISO(new Date(today.getFullYear(), 0, 1)),
      to: toISO(today),
      periodLabel: String(today.getFullYear()),
    };
  }
  // Default: the current month, which is what people mean most of the time.
  const range = monthRange(today);
  return { from: range.from, to: range.to, periodLabel: range.label };
}

export function suggestedQuestions(): string[] {
  return [
    '¿Cuánto gasté en comida este mes?',
    '¿Dónde se me fue más plata en agosto?',
    '¿Cuánto gasté en delivery?',
    '¿Cuánto gasté el fin de semana?',
    '¿Cuánto ahorré este mes?',
    '¿Cuánto cobré el mes pasado?',
  ];
}

export { parseISO, subMonths };
