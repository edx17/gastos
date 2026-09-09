import { describe, expect, it } from 'vitest';
import { parseIntent } from './parser';

const parse = (text: string) => parseIntent(text, { today: new Date('2026-09-08T12:00:00'), baseCurrency: 'ARS' });

describe('cambio de moneda', () => {
  it('entiende «compro 100 dolares»', () => {
    const r = parse('compro 100 dolares');
    expect(r.type).toBe('transfer');
    expect(r.exchange_kind).toBe('buy');
    expect(r.currency).toBe('USD');
    expect(r.amount).toBe(100);
    expect(r.exchange_rate).toBeNull();
    expect(r.description).toBe('Compra de dólares');
    expect(r.missing).toEqual([]);
  });

  it('toma la cotización cuando la dicen', () => {
    const r = parse('compré 100 dólares a 1450');
    expect(r.exchange_kind).toBe('buy');
    expect(r.amount).toBe(100);
    expect(r.exchange_rate).toBe(1450);
  });

  it('lee la cotización con puntos y con signo', () => {
    expect(parse('compre 200 usd a $1.480').exchange_rate).toBe(1480);
    expect(parse('compré 50 dolares al 1.512,50').exchange_rate).toBe(1512.5);
  });

  it('no confunde la cotización con el importe', () => {
    const r = parse('compre 100 dolares a 1450');
    expect(r.amount).toBe(100);
    expect(r.exchange_rate).toBe(1450);
  });

  it('entiende la venta', () => {
    const r = parse('vendí 50 dólares a 1500');
    expect(r.exchange_kind).toBe('sell');
    expect(r.amount).toBe(50);
    expect(r.exchange_rate).toBe(1500);
    expect(r.description).toBe('Venta de dólares');
  });

  it('acepta las formas de todos los días', () => {
    for (const text of ['me compré 100 dolares', 'compro usd 250', 'compre 100 verdes', 'compré 300 dólares blue']) {
      const r = parse(text);
      expect(r.exchange_kind, text).toBe('buy');
      expect(r.currency, text).toBe('USD');
    }
  });

  it('anda con euros', () => {
    const r = parse('compre 80 euros a 1700');
    expect(r.currency).toBe('EUR');
    expect(r.description).toBe('Compra de euros');
    expect(r.exchange_rate).toBe(1700);
  });

  it('respeta la fecha', () => {
    const r = parse('ayer compré 100 dólares a 1450');
    expect(r.exchange_kind).toBe('buy');
    expect(r.date).toBe('2026-09-07');
  });

  it('NO es un cambio si la frase dice en qué se gastó', () => {
    const r = parse('compré 100 dólares de nafta');
    expect(r.exchange_kind).toBeUndefined();
    expect(r.type).toBe('expense');
    expect(r.currency).toBe('USD');
  });

  it('NO es un cambio comprar cualquier otra cosa', () => {
    const r = parse('compré una bici 350 lucas');
    expect(r.exchange_kind).toBeUndefined();
    expect(r.type).toBe('expense');
  });

  it('NO es un cambio vender algo que no es moneda', () => {
    const r = parse('vendí la moto 2 palos');
    expect(r.exchange_kind).toBeUndefined();
    expect(r.type).toBe('income');
  });

  it('comprar pesos teniendo pesos de base no es un cambio', () => {
    const r = parse('compré 5000 pesos de fichas');
    expect(r.exchange_kind).toBeUndefined();
  });

  it('sin importe no inventa un cambio', () => {
    const r = parse('compré dólares');
    expect(r.exchange_kind).toBeUndefined();
  });

  it('el ejemplo que muestra la app sigue siendo un gasto en dólares', () => {
    const r = parse('compré zapatillas por 120 dólares');
    expect(r.exchange_kind).toBeUndefined();
    expect(r.type).toBe('expense');
    expect(r.currency).toBe('USD');
    expect(r.amount).toBe(120);
  });

  it('un gasto normal sigue siendo un gasto', () => {
    const r = parse('super 45 lucas');
    expect(r.exchange_kind).toBeUndefined();
    expect(r.type).toBe('expense');
    expect(r.amount).toBe(45000);
  });
});
