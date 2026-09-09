import { describe, expect, it } from 'vitest';
import { parseIntent } from './parser';

const parse = (text: string) => parseIntent(text, { today: new Date('2026-09-08T12:00:00'), baseCurrency: 'ARS' });

describe('intereses y rendimientos', () => {
  it('los intereses de la caja de ahorro son un ingreso, no un gasto', () => {
    const r = parse('intereses dolares 10.48');
    expect(r.type).toBe('income');
    expect(r.currency).toBe('USD');
    expect(r.amount).toBe(10.48);
  });

  it('reconoce las formas de nombrarlo', () => {
    for (const text of [
      'rendimientos mercado pago 8500',
      'intereses caja de ahorro 12300',
      'renta del plazo fijo 45000',
      'dividendos 30000',
      'rendimiento de reservas 2100',
    ]) {
      expect(parse(text).type, text).toBe('income');
    }
  });

  it('los intereses que se PAGAN siguen siendo un gasto', () => {
    for (const text of [
      'intereses de la tarjeta 15000',
      'intereses del prestamo 22000',
      'punitorios visa 8000',
    ]) {
      expect(parse(text).type, text).toBe('expense');
    }
  });

  it('no se come otros movimientos', () => {
    expect(parse('super 45 lucas').type).toBe('expense');
    expect(parse('cobré 1.200.000').type).toBe('income');
    expect(parse('pagué la tarjeta 500 lucas').type).toBe('transfer');
  });

  it('un rendimiento en pesos también entra como ingreso', () => {
    const r = parse('rendimientos 8500');
    expect(r.type).toBe('income');
    expect(r.currency).toBe('ARS');
    expect(r.amount).toBe(8500);
  });
});
