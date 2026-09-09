import { describe, expect, it } from 'vitest';
import { parseIntent } from './parser';

const parse = (text: string) => parseIntent(text, { today: new Date('2026-09-08T12:00:00'), baseCurrency: 'ARS' });

describe('compras en cuotas', () => {
  it('«120 lucas en 6 cuotas»: el importe es el total', () => {
    const r = parse('zapatillas 120 lucas en 6 cuotas');
    expect(r.installments).toEqual({ count: 6, from: 1, amount_is_total: true });
    expect(r.amount).toBe(120000);
    expect(r.description).toBe('Zapatillas');
  });

  it('«6 cuotas de 20 lucas»: el importe es el de cada cuota', () => {
    const r = parse('zapatillas 6 cuotas de 20 lucas');
    expect(r.installments).toEqual({ count: 6, from: 1, amount_is_total: false });
    expect(r.amount).toBe(20000);
  });

  it('el número de cuotas no se confunde con el importe', () => {
    expect(parse('heladera 900000 en 12 cuotas').amount).toBe(900000);
    expect(parse('tele en 3 cuotas 450000').amount).toBe(450000);
  });

  it('acepta las cuotas escritas con palabras', () => {
    expect(parse('notebook 1.500.000 en doce cuotas').installments?.count).toBe(12);
    expect(parse('parlante 90000 en tres cuotas').installments?.count).toBe(3);
  });

  it('«cuota 3 de 12» carga desde la que va', () => {
    const r = parse('heladera cuota 3 de 12 de 45000');
    expect(r.installments).toEqual({ count: 12, from: 3, amount_is_total: false });
    expect(r.amount).toBe(45000);
  });

  it('«voy por la 4» también dice desde dónde', () => {
    const r = parse('lavarropas 8 cuotas de 62000 voy por la 4');
    expect(r.installments).toEqual({ count: 8, from: 4, amount_is_total: false });
    expect(r.amount).toBe(62000);
  });

  it('«me quedan 5 cuotas» se traduce a desde cuál va', () => {
    const r = parse('celular 12 cuotas de 80000 me quedan 5 cuotas');
    expect(r.installments?.count).toBe(12);
    expect(r.installments?.from).toBe(8);
  });

  it('ignora un plan imposible', () => {
    expect(parse('cafe 4500 en 1 cuota').installments).toBeUndefined();
    expect(parse('super 45 lucas').installments).toBeUndefined();
  });

  it('no rompe el resto del parser', () => {
    const r = parse('ayer compré zapatillas en 6 cuotas 120 lucas con crédito');
    expect(r.type).toBe('expense');
    expect(r.date).toBe('2026-09-07');
    expect(r.payment_method).toBe('Crédito');
    expect(r.installments?.count).toBe(6);
    expect(r.amount).toBe(120000);
  });
});
