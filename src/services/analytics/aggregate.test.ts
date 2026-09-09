import { describe, expect, it } from 'vitest';
import {
  antExpenses,
  categoryBreakdown,
  compare,
  currencyHoldings,
  dailySeries,
  merchantRanking,
  monthlySeries,
  runningBalance,
  summarize,
} from './aggregate';
import { detectRecurring } from './recurring';
import { makeCategories, makeTransaction } from '@/test/factories';

const categories = makeCategories();

const rows = [
  makeTransaction({ type: 'income', amount: 1_850_000, base_amount: 1_850_000, transaction_date: '2026-09-05', category_id: 'cat-ingresos' }),
  makeTransaction({ amount: 400_000, base_amount: 400_000, transaction_date: '2026-09-06', category_id: 'cat-alimentacion', merchant_name: 'Carrefour' }),
  makeTransaction({ amount: 240_500, base_amount: 240_500, transaction_date: '2026-09-07', category_id: 'cat-transporte', merchant_name: 'YPF' }),
  makeTransaction({ amount: 600_000, base_amount: 600_000, transaction_date: '2026-09-08', category_id: 'cat-hogar', merchant_name: 'Inmobiliaria' }),
  makeTransaction({ type: 'transfer', amount: 100_000, base_amount: 100_000, transaction_date: '2026-09-09' }),
  makeTransaction({ type: 'refund', amount: 20_000, base_amount: 20_000, transaction_date: '2026-09-10' }),
];

describe('summarize', () => {
  const summary = summarize(rows, '2026-09-01', '2026-09-30', 'ARS');

  it('adds income and refunds, and only counts expenses as spending', () => {
    expect(summary.income).toBe(1_870_000);
    expect(summary.expense).toBe(1_240_500);
  });

  it('ignores transfers: moving money is not spending it', () => {
    const withoutTransfer = summarize(rows.filter((r) => r.type !== 'transfer'), '2026-09-01', '2026-09-30', 'ARS');
    expect(withoutTransfer.expense).toBe(summary.expense);
  });

  it('computes the savings rate', () => {
    expect(summary.savings).toBe(629_500);
    expect(summary.savings_rate).toBeCloseTo(33.7, 1);
  });

  it('respects the date range', () => {
    expect(summarize(rows, '2026-10-01', '2026-10-31', 'ARS').transaction_count).toBe(0);
  });
});

describe('compare', () => {
  it('knows more income is good and more spending is not', () => {
    const income = compare(1_000, 800, true);
    expect(income.delta_ratio).toBe(25);
    expect(income.higher_is_better).toBe(true);

    const expense = compare(1_000, 800, false);
    expect(expense.higher_is_better).toBe(false);
  });

  it('does not divide by zero', () => {
    expect(compare(1_000, 0, true).delta_ratio).toBeNull();
  });
});

describe('breakdowns', () => {
  it('ranks categories by amount and reports their share', () => {
    const breakdown = categoryBreakdown(rows, categories);
    expect(breakdown[0].category_name).toBe('Hogar');
    expect(breakdown[0].ratio).toBeCloseTo(48.4, 1);
    expect(breakdown.reduce((acc, row) => acc + row.ratio, 0)).toBeCloseTo(100, 0);
  });

  it('compares each category against the previous period', () => {
    const previous = [makeTransaction({ amount: 200_000, base_amount: 200_000, category_id: 'cat-alimentacion' })];
    const breakdown = categoryBreakdown(rows, categories, { previous });
    const food = breakdown.find((row) => row.category_name === 'Alimentación')!;
    expect(food.previous_amount).toBe(200_000);
    expect(food.delta_ratio).toBe(100);
  });

  it('ranks merchants', () => {
    const ranking = merchantRanking(rows);
    expect(ranking[0].merchant).toBe('Inmobiliaria');
    // Only expenses are ranked: income, refunds and transfers stay out.
    expect(ranking).toHaveLength(3);
  });
});

describe('series', () => {
  it('fills every month in the range, even the empty ones', () => {
    const series = monthlySeries(rows, '2026-07-01', '2026-09-30');
    expect(series).toHaveLength(3);
    expect(series[0].expense).toBe(0);
    expect(series[2].expense).toBe(1_240_500);
  });

  it('fills every day in the range', () => {
    const days = dailySeries(rows, '2026-09-01', '2026-09-10');
    expect(days).toHaveLength(10);
    expect(days.find((day) => day.date === '2026-09-06')?.expense).toBe(400_000);
    expect(days[0].expense).toBe(0);
  });
});

describe('ant expenses', () => {
  it('groups small repeated purchases and projects them monthly', () => {
    const small = [2000, 3500, 2500, 4000, 2200, 3100].map((amount, index) =>
      makeTransaction({
        amount,
        base_amount: amount,
        description: 'Café',
        merchant_name: 'Café de la esquina',
        transaction_date: `2026-09-0${index + 1}`,
      }),
    );
    // Mixed with the month's real spending, so the threshold is relative to how
    // this person actually spends.
    const report = antExpenses([...rows, ...small], '2026-09-01', '2026-09-30');
    expect(report.count).toBeGreaterThan(0);
    expect(report.groups[0].label).toBe('Café de la esquina');
    expect(report.monthly_estimate).toBeGreaterThan(0);
  });

  it('returns an empty report when there is nothing to show', () => {
    expect(antExpenses([], '2026-09-01', '2026-09-30').count).toBe(0);
  });
});

describe('recurring detection', () => {
  it('finds a monthly subscription', () => {
    const netflix = ['2026-06-10', '2026-07-10', '2026-08-10', '2026-09-10'].map((date) =>
      makeTransaction({ amount: 9500, base_amount: 9500, description: 'Netflix', merchant_name: 'Netflix', transaction_date: date }),
    );
    const [found] = detectRecurring(netflix, 'user-1');
    expect(found.label).toBe('Netflix');
    expect(found.cadence).toBe('monthly');
    expect(found.occurrences).toBe(4);
    expect(found.next_estimated_date).toBe('2026-10-11');
  });

  it('ignores irregular spending', () => {
    const random = ['2026-06-01', '2026-06-03', '2026-09-20'].map((date, index) =>
      makeTransaction({ amount: 1000 * (index + 1), base_amount: 1000 * (index + 1), description: 'Varios', transaction_date: date }),
    );
    expect(detectRecurring(random, 'user-1')).toHaveLength(0);
  });

  it('needs at least three occurrences', () => {
    const twice = ['2026-08-10', '2026-09-10'].map((date) =>
      makeTransaction({ amount: 9500, base_amount: 9500, description: 'Spotify', merchant_name: 'Spotify', transaction_date: date }),
    );
    expect(detectRecurring(twice, 'user-1')).toHaveLength(0);
  });
});

describe('cambio de moneda', () => {
  const fx = (kind: 'buy' | 'sell', amount: number, base: number, rate: number, currency: 'USD' | 'EUR' = 'USD') =>
    makeTransaction({
      type: 'transfer',
      amount,
      base_amount: base,
      currency,
      exchange_rate: rate,
      exchange_kind: kind,
      transaction_date: '2026-09-08',
    });

  it('no cuenta como gasto ni como ingreso', () => {
    const scoped = [
      makeTransaction({ amount: 10000, base_amount: 10000, transaction_date: '2026-09-01' }),
      fx('buy', 100, 145000, 1450),
    ];
    const summary = summarize(scoped, '2026-09-01', '2026-09-30', 'ARS');
    expect(summary.expense).toBe(10000);
    expect(summary.income).toBe(0);
  });

  it('descuenta del saldo los pesos que se fueron y suma los que volvieron', () => {
    expect(runningBalance([fx('buy', 100, 145000, 1450)], '2026-09-30')).toBe(-145000);
    expect(runningBalance([fx('buy', 100, 145000, 1450), fx('sell', 100, 160000, 1600)], '2026-09-30')).toBe(15000);
  });

  it('acumula la tenencia y el precio promedio de compra', () => {
    const [usd] = currencyHoldings([fx('buy', 100, 145000, 1450), fx('buy', 50, 77500, 1550), fx('sell', 30, 48000, 1600)]);
    expect(usd.currency).toBe('USD');
    expect(usd.amount).toBe(120);
    expect(usd.invested).toBe(174500);
    // 222.500 pesos por los 150 comprados.
    expect(usd.avg_rate).toBe(1483.33);
  });

  it('no muestra una moneda que se vendió entera', () => {
    expect(currencyHoldings([fx('buy', 100, 145000, 1450), fx('sell', 100, 150000, 1500)])).toEqual([]);
  });

  it('separa las monedas', () => {
    const rows = [fx('buy', 100, 145000, 1450), fx('buy', 80, 136000, 1700, 'EUR')];
    expect(currencyHoldings(rows).map((h) => h.currency)).toEqual(['EUR', 'USD']);
  });

  it('una transferencia común no toca el saldo ni las tenencias', () => {
    const plain = makeTransaction({ type: 'transfer', amount: 50000, base_amount: 50000, transaction_date: '2026-09-08' });
    expect(runningBalance([plain], '2026-09-30')).toBe(0);
    expect(currencyHoldings([plain])).toEqual([]);
  });
});

describe('cuotas y el resto de la app', () => {
  it('una compra en cuotas no se detecta como gasto recurrente', () => {
    const plan = Array.from({ length: 6 }, (_, i) =>
      makeTransaction({
        amount: 20000,
        base_amount: 20000,
        description: 'Zapatillas',
        merchant_name: 'Dexter',
        transaction_date: `2026-0${i + 1}-08`,
        installment_id: 'plan-1',
        installment_number: i + 1,
        installment_count: 6,
      }),
    );
    expect(detectRecurring(plan, 'u1')).toEqual([]);
  });

  it('un gasto fijo de verdad sí se detecta', () => {
    const netflix = Array.from({ length: 6 }, (_, i) =>
      makeTransaction({
        amount: 9500,
        base_amount: 9500,
        description: 'Netflix',
        merchant_name: 'Netflix',
        transaction_date: `2026-0${i + 1}-08`,
      }),
    );
    expect(detectRecurring(netflix, 'u1').length).toBeGreaterThan(0);
  });
});
