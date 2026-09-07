import { describe, expect, it } from 'vitest';
import { parseReceiptText } from './parser';

const CARREFOUR = `CARREFOUR ARGENTINA S.A.
AV. RIVADAVIA 5100 - CABA
CUIT 30-68731043-4
FACTURA B N 0004-00021785
FECHA 06/09/2026 19:42

LECHE ENTERA 1L        2 x 1.800,00      3.600,00
PAN LACTAL             1 x 2.450,00      2.450,00
DETERGENTE 750ML       1 x 3.200,00      3.200,00

SUBTOTAL                               9.250,00
DESCUENTO                                -250,00
TOTAL                                  9.000,00
TARJETA DEBITO VISA
`;

describe('parseReceiptText', () => {
  const parsed = parseReceiptText(CARREFOUR);

  it('detects the merchant', () => {
    expect(parsed.merchant).toBe('Carrefour');
  });

  it('detects the tax id', () => {
    expect(parsed.merchant_tax_id).toBe('30-68731043-4');
  });

  it('detects the date and time', () => {
    expect(parsed.date).toBe('2026-09-06');
    expect(parsed.time).toBe('19:42');
  });

  it('detects the receipt number', () => {
    expect(parsed.receipt_number).toBe('0004-00021785');
  });

  it('extracts the line items with quantities', () => {
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0]).toMatchObject({ description: 'Leche Entera 1L', quantity: 2, unit_price: 1800, total: 3600 });
  });

  it('reads totals, discount and payment method', () => {
    expect(parsed.subtotal).toBe(9250);
    expect(parsed.discount).toBe(250);
    expect(parsed.total).toBe(9000);
    expect(parsed.payment_method).toBe('Débito');
  });

  it('is reasonably confident about a clean ticket', () => {
    expect(parsed.confidence).toBeGreaterThan(0.7);
  });

  it('handles decimal quantities sold by weight', () => {
    const result = parseReceiptText(`COTO
12/08/2026
BANANA X KG            1,240 x 1.900,00   2.356,00
TOTAL                                     2.356,00`);
    expect(result.items[0].quantity).toBe(1.24);
    expect(result.items[0].total).toBe(2356);
    expect(result.total).toBe(2356);
  });

  it('falls back to the sum of items and warns when there is no total line', () => {
    const result = parseReceiptText(`KIOSCO EL SOL
ALFAJOR                1.200,00
GASEOSA                2.300,00`);
    expect(result.total).toBe(3500);
    expect(result.warnings.join(' ')).toMatch(/total/i);
  });

  it('flags conflicting totals instead of picking silently', () => {
    const result = parseReceiptText(`SUPER
CAFE 1.000,00
TOTAL 1.000,00
TOTAL A PAGAR 1.500,00`);
    expect(result.total_candidates?.length).toBeGreaterThan(1);
    expect(result.warnings.join(' ')).toMatch(/más de un importe/i);
  });

  it('detects US dollars', () => {
    expect(parseReceiptText('DUTY FREE\nPERFUME U$S 120,00\nTOTAL U$S 120,00').currency).toBe('USD');
  });
});
