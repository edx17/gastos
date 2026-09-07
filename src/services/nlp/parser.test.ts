import { describe, expect, it } from 'vitest';
import { parseIntent } from './parser';
import { toISO } from '@/lib/date';
import { subDays, subMonths } from 'date-fns';

// Fixed reference so date assertions don't drift: Monday 2026-09-07.
const today = new Date(2026, 8, 7);
const parse = (text: string) => parseIntent(text, { today, baseCurrency: 'ARS' });

describe('amounts', () => {
  const cases: [string, number][] = [
    ['pizza 3200', 3200],
    ['pizza $3200', 3200],
    ['pizza 3.200', 3200],
    ['pizza 3,2k', 3200],
    ['pizza tres lucas', 3000],
    ['ayer pizza 3200', 3200],
    ['el viernes compré pizza por 5000', 5000],
    ['compré una pizza 12 lucas', 12000],
    ['ayer cargué nafta 35 mil', 35000],
    ['supermercado 78.500', 78500],
    ['pagué la cuota del gym 28k', 28000],
    ['Netflix 9 lucas', 9000],
    ['cobré 1.500.000', 1500000],
    ['me devolvieron 20 mil', 20000],
    ['cobré 1 palo', 1000000],
    ['gasté 20 lucas', 20000],
    ['medio palo de alquiler', 500000],
    ['hoy gasté 8500 en combustible', 8500],
    ['2 pizzas 6400', 6400],
  ];

  it.each(cases)('reads %s as %i', (text, expected) => {
    expect(parse(text).amount).toBe(expected);
  });

  it('does not invent an amount when there is none', () => {
    const result = parse('compré algo pero no sé cuánto salió');
    expect(result.amount).toBeNull();
    expect(result.missing).toContain('amount');
    expect(result.question).toMatch(/importe/i);
  });
});

describe('intent type', () => {
  const cases: [string, string][] = [
    ['ayer pagué 50k de luz', 'expense'],
    ['cobré 900k', 'income'],
    ['me transfirieron 120 mil', 'income'],
    ['transferí 100k a mi ahorro', 'transfer'],
    ['pasé 50 dólares de mi cuenta a la caja de ahorro', 'transfer'],
    ['me devolvieron 15.000 de la compra', 'refund'],
    ['super 45 lucas', 'expense'],
  ];

  it.each(cases)('%s → %s', (text, expected) => {
    expect(parse(text).type).toBe(expected);
  });
});

describe('currency', () => {
  it('detects dollars', () => {
    const result = parse('gasté 100 dólares en una cena');
    expect(result.currency).toBe('USD');
    expect(result.amount).toBe(100);
    expect(result.currency_explicit).toBe(true);
  });

  it('detects euros', () => {
    expect(parse('pagué 40 euros de hotel').currency).toBe('EUR');
  });

  it('falls back to the account currency', () => {
    const result = parse('café 2500');
    expect(result.currency).toBe('ARS');
    expect(result.currency_explicit).toBe(false);
  });

  it('handles 100 usd cena', () => {
    const result = parse('100 usd cena');
    expect(result.currency).toBe('USD');
    expect(result.amount).toBe(100);
    expect(result.description).toBe('Cena');
  });
});

describe('dates', () => {
  it('defaults to today', () => {
    const result = parse('pizza 3200');
    expect(result.date).toBe(toISO(today));
    expect(result.date_explicit).toBe(false);
  });

  it('reads ayer', () => {
    expect(parse('ayer pizza 3200').date).toBe(toISO(subDays(today, 1)));
  });

  it('reads anteayer', () => {
    expect(parse('anteayer cargué nafta 20k').date).toBe(toISO(subDays(today, 2)));
  });

  it('reads el viernes pasado', () => {
    // Reference day is a Monday, so the previous Friday is 3 days back.
    expect(parse('el viernes pasado gasté 5000').date).toBe(toISO(subDays(today, 3)));
  });

  it('reads el mes pasado', () => {
    expect(parse('el mes pasado pagué 80k de expensas').date).toBe(toISO(subMonths(today, 1)));
  });

  it('reads a numeric date', () => {
    expect(parse('12/08 gasté 4500').date).toBe('2026-08-12');
  });

  it('reads a written date', () => {
    expect(parse('el 5 de enero gasté 9000').date).toBe('2026-01-05');
  });
});

describe('descriptions and merchants', () => {
  it('keeps the meaningful phrase', () => {
    expect(parse('hoy gasté 8500 en combustible').description).toBe('Combustible');
    expect(parse('pagué la cuota del gym 28k').description).toBe('Cuota del gym');
  });

  it('recognises known merchants', () => {
    expect(parse('Shell 30.000').merchant).toBe('Shell');
    expect(parse('Netflix 9 lucas').merchant).toBe('Netflix');
    expect(parse('compré en Mercado Libre 25000').merchant).toBe('Mercado Libre');
  });

  it('derives a description from the verb when nothing else is left', () => {
    expect(parse('ayer cené 18.500').description).toBe('Cena');
  });

  it('asks instead of guessing when the description is missing', () => {
    const result = parse('gasté 20 lucas');
    expect(result.missing).toContain('description');
    expect(result.question).toContain('20.000');
  });

  it('labels income without a description', () => {
    expect(parse('cobré 1.200.000').description).toBe('Ingreso');
  });
});

describe('payment methods', () => {
  it('detects the payment method when mentioned', () => {
    expect(parse('pagué 12000 con mercado pago').payment_method).toBe('Mercado Pago');
    expect(parse('pagué 12000 en efectivo').payment_method).toBe('Efectivo');
  });
});

describe('confidence', () => {
  it('is high for a complete phrase', () => {
    expect(parse('ayer gasté 8500 en combustible').confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('is low when the amount is missing', () => {
    expect(parse('compré algo en el super').confidence).toBeLessThan(0.4);
  });
});
