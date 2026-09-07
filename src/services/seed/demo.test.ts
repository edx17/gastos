import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from './demo';
import { monthlySeries } from '@/services/analytics/aggregate';
import { lastNMonths } from '@/lib/date';

const reference = new Date(2026, 8, 7);
const dataset = buildDemoDataset('user-1', reference);

describe('demo dataset', () => {
  it('has roughly 200 movements across six months', () => {
    expect(dataset.transactions.length).toBeGreaterThan(150);
    expect(dataset.transactions.length).toBeLessThan(300);
  });

  it('is deterministic', () => {
    const other = buildDemoDataset('user-1', reference);
    expect(other.transactions.length).toBe(dataset.transactions.length);
    expect(other.transactions[10].amount).toBe(dataset.transactions[10].amount);
  });

  it('categorises every movement', () => {
    expect(dataset.transactions.every((t) => t.category_id && t.subcategory_id)).toBe(true);
  });

  it('keeps the original amount and its base-currency projection', () => {
    for (const row of dataset.transactions) {
      expect(row.base_amount).toBeCloseTo(row.amount * row.exchange_rate, 2);
      if (row.currency === row.base_currency) expect(row.exchange_rate).toBe(1);
    }
  });

  it('includes foreign-currency movements', () => {
    expect(dataset.transactions.some((t) => t.currency === 'USD')).toBe(true);
  });

  it('shows a healthy but realistic savings rate', () => {
    const range = lastNMonths(6, reference);
    const series = monthlySeries(dataset.transactions, range.from, range.to);
    for (const point of series) {
      expect(point.income).toBeGreaterThan(0);
      expect(point.expense).toBeGreaterThan(0);
      // A demo that is permanently in the red teaches nothing about the reports.
      expect(point.savings).toBeGreaterThan(0);
    }
  });

  it('ships budgets and goals to look at', () => {
    expect(dataset.budgets.length).toBeGreaterThanOrEqual(3);
    expect(dataset.goals.length).toBeGreaterThanOrEqual(2);
    expect(dataset.categories.length).toBeGreaterThan(10);
  });
});
