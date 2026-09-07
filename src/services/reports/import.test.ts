import { describe, expect, it } from 'vitest';
import { buildPreview, guessColumns, parseCsv } from './import';
import { transactionsToCsv } from './export';
import { makeCategories, makeTransaction } from '@/test/factories';

const categories = makeCategories();
const paymentMethods = [
  { id: 'pm-1', user_id: 'user-1', name: 'Débito', kind: 'debit' as const, is_default: true, is_active: true, created_at: '' },
];

const CSV = `Fecha;Descripción;Importe;Moneda;Categoría;Medio de pago
06/09/2026;Supermercado;-45.800,50;ARS;Alimentación;Débito
05/09/2026;Sueldo;1.850.000;ARS;Ingresos;Débito
04/09/2026;"Cena, con amigos";-18.500;ARS;Alimentación;Débito
;Sin fecha;-1000;ARS;;`;

describe('parseCsv', () => {
  const rows = parseCsv(CSV);

  it('detects the separator and keeps quoted commas together', () => {
    expect(rows).toHaveLength(5);
    expect(rows[3][1]).toBe('Cena, con amigos');
  });
});

describe('guessColumns', () => {
  it('maps the usual headers without asking', () => {
    expect(guessColumns(parseCsv(CSV)[0])).toEqual([
      'date',
      'description',
      'amount',
      'currency',
      'category',
      'payment_method',
    ]);
  });

  it('ignores columns it does not recognise', () => {
    expect(guessColumns(['saldo posterior'])).toEqual(['ignore']);
  });
});

describe('buildPreview', () => {
  const rows = parseCsv(CSV);
  const preview = buildPreview(rows.slice(1), guessColumns(rows[0]), {
    categories,
    paymentMethods,
    baseCurrency: 'ARS',
    existing: [makeTransaction({ amount: 45800.5, description: 'Supermercado', transaction_date: '2026-09-06' })],
  });

  it('reads Argentine dates and amounts', () => {
    expect(preview[0].input).toMatchObject({
      amount: 45800.5,
      transaction_date: '2026-09-06',
      description: 'Supermercado',
      type: 'expense',
    });
  });

  it('treats positive amounts as income', () => {
    expect(preview[1].input?.type).toBe('income');
    expect(preview[1].input?.amount).toBe(1850000);
  });

  it('resolves categories and payment methods by name', () => {
    expect(preview[0].input?.category_id).toBe('cat-alimentacion');
    expect(preview[0].input?.payment_method_id).toBe('pm-1');
  });

  it('flags duplicates instead of importing them twice', () => {
    expect(preview[0].duplicateOf).toBeTruthy();
    expect(preview[1].duplicateOf).toBeUndefined();
  });

  it('reports rows it cannot use rather than dropping them silently', () => {
    expect(preview[3].input).toBeNull();
    expect(preview[3].problems.join(' ')).toMatch(/fecha/i);
  });
});

describe('round trip', () => {
  it('exports what it can import', () => {
    const csv = transactionsToCsv(
      [makeTransaction({ amount: 12345.67, description: 'Café; con "comillas"', category_id: 'cat-alimentacion' })],
      categories,
    );
    const rows = parseCsv(csv);
    expect(rows[0]).toContain('descripcion');
    expect(rows[1][2]).toBe('Café; con "comillas"');
    expect(rows[1][4]).toBe('Alimentación');
  });
});
