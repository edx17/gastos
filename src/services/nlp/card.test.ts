import { describe, expect, it } from 'vitest';
import { parseIntent } from './parser';

const parse = (text: string) => parseIntent(text, { today: new Date('2026-09-08T12:00:00'), baseCurrency: 'ARS' });

describe('pago del resumen de la tarjeta', () => {
  it('no es un gasto: es cancelar una deuda ya registrada', () => {
    const r = parse('pagué la tarjeta 500 lucas');
    expect(r.type).toBe('transfer');
    expect(r.card_payment).toBe(true);
    expect(r.amount).toBe(500000);
    expect(r.description).toBe('Pago de tarjeta');
  });

  it('nombra el banco cuando la persona lo dice', () => {
    expect(parse('pagué el resumen de la visa 480000').description).toBe('Pago de Visa');
    expect(parse('pague la mastercard 300000').description).toBe('Pago de Mastercard');
    expect(parse('cancele el resumen de amex 120000').description).toBe('Pago de Amex');
    expect(parse('pague la naranja 90000').description).toBe('Pago de Naranja');
  });

  it('acepta las variantes de todos los días', () => {
    for (const text of [
      'pague tarjeta de credito 500000',
      'pagué el vencimiento de la tarjeta 250000',
      'abone el resumen de la tarjeta 180000',
      'saldé la visa 400000',
    ]) {
      expect(parse(text).type, text).toBe('transfer');
      expect(parse(text).card_payment, text).toBe(true);
    }
  });

  it('no se lo paga con la propia tarjeta', () => {
    expect(parse('pagué la tarjeta 500 lucas').payment_method).toBeNull();
  });

  it('comprar CON la tarjeta sigue siendo un gasto', () => {
    const r = parse('pagué el super con tarjeta 45 lucas');
    expect(r.type).toBe('expense');
    expect(r.card_payment).toBe(false);
    expect(r.payment_method).toBe('Tarjeta');
  });

  it('un consumo a crédito sigue siendo un gasto el día que se compró', () => {
    const r = parse('cené afuera 25 lucas con crédito');
    expect(r.type).toBe('expense');
    expect(r.card_payment).toBe(false);
    expect(r.payment_method).toBe('Crédito');
    expect(r.amount).toBe(25000);
  });

  it('pagar otra cosa no es pagar la tarjeta', () => {
    for (const text of ['pagué el alquiler 450 lucas', 'pagué la luz 34 lucas', 'pagué netflix 9500']) {
      expect(parse(text).card_payment, text).toBe(false);
      expect(parse(text).type, text).toBe('expense');
    }
  });
});
