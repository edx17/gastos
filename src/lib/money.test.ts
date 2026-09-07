import { describe, expect, it } from 'vitest';
import { convert, formatCompact, formatMoney, parseAmountInput } from './money';

describe('formatMoney', () => {
  it('uses the Argentine convention', () => {
    expect(formatMoney(1500000, { currency: 'ARS' })).toBe('$1.500.000');
    expect(formatMoney(8500, { currency: 'ARS' })).toBe('$8.500');
    expect(formatMoney(3200.5, { currency: 'ARS' })).toBe('$3.200,50');
  });

  it('marks the currency for dollars and euros', () => {
    expect(formatMoney(100, { currency: 'USD' })).toBe('US$100');
    expect(formatMoney(120.5, { currency: 'USD' })).toBe('US$120,50');
    expect(formatMoney(40, { currency: 'EUR' })).toBe('€40');
  });

  it('keeps the sign outside the symbol', () => {
    expect(formatMoney(-8500, { currency: 'ARS' })).toBe('-$8.500');
    expect(formatMoney(8500, { currency: 'ARS', signDisplay: 'always' })).toBe('+$8.500');
  });
});

describe('formatCompact', () => {
  it('shortens large amounts for chart axes', () => {
    expect(formatCompact(1_500_000)).toBe('$1.5 M');
    expect(formatCompact(85_000)).toBe('$85 k');
    expect(formatCompact(950)).toBe('$950');
  });
});

describe('parseAmountInput', () => {
  const cases: [string, number | null][] = [
    ['1.500.000', 1500000],
    ['3.200', 3200],
    ['3,20', 3.2],
    ['$ 8.500', 8500],
    ['1,234.56', 1234.56],
    ['', null],
  ];
  it.each(cases)('parses %s', (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });
});

describe('convert', () => {
  const rates = { ARS: 1, USD: 1450, EUR: 1600 };

  it('projects a foreign amount into the base currency', () => {
    expect(convert(100, 'USD', 'ARS', rates)).toEqual({ amount: 145000, rate: 1450 });
  });

  it('is a no-op for the same currency', () => {
    expect(convert(8500, 'ARS', 'ARS', rates)).toEqual({ amount: 8500, rate: 1 });
  });

  it('converts between two foreign currencies', () => {
    const result = convert(100, 'EUR', 'USD', rates);
    expect(result.amount).toBeCloseTo(110.34, 1);
  });

  it('leaves the amount untouched when a rate is missing instead of inventing one', () => {
    expect(convert(100, 'JPY', 'ARS', rates)).toEqual({ amount: 100, rate: 1 });
  });
});
