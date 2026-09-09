import { beforeEach, describe, expect, it } from 'vitest';
import { expandInstallments } from './installments';
import { LocalDataClient } from './local';
import { pendingInstallments, runningBalance } from '@/services/analytics/aggregate';

describe('expandInstallments', () => {
  it('arma un vencimiento por mes desde la primera', () => {
    const rows = expandInstallments({ count: 6 }, '2026-09-08');
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.transaction_date)).toEqual([
      '2026-09-08', '2026-10-08', '2026-11-08', '2026-12-08', '2027-01-08', '2027-02-08',
    ]);
    expect(rows.map((r) => r.installment_number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(rows.map((r) => r.installment_id)).size).toBe(1);
  });

  it('carga sólo las que faltan cuando el plan ya arrancó', () => {
    const rows = expandInstallments({ count: 12, from: 9 }, '2026-09-08');
    expect(rows).toHaveLength(4);
    expect(rows[0].installment_number).toBe(9);
    expect(rows[0].transaction_date).toBe('2026-09-08');
    expect(rows.at(-1)?.installment_number).toBe(12);
  });

  it('no inventa meses que la persona nunca registró', () => {
    const rows = expandInstallments({ count: 12, from: 9 }, '2026-09-08');
    expect(rows.every((row) => row.transaction_date >= '2026-09-08')).toBe(true);
  });

  it('rechaza un plan que no es un plan', () => {
    expect(() => expandInstallments({ count: 1 }, '2026-09-08')).toThrow();
    expect(() => expandInstallments({ count: 6, from: 7 }, '2026-09-08')).toThrow();
    expect(() => expandInstallments({ count: 200 }, '2026-09-08')).toThrow();
  });

  it('respeta fin de mes sin desbordar', () => {
    const rows = expandInstallments({ count: 3 }, '2026-01-31');
    expect(rows.map((r) => r.transaction_date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
});

describe('cuotas de punta a punta', () => {
  const client = new LocalDataClient();
  let userId = '';

  beforeEach(async () => {
    localStorage.clear();
    const user = await client.signUp(`cuotas-${Math.random()}@crocante.test`, 'crocante-demo', 'Test');
    userId = user.id;
  });

  it('guarda seis gastos de 20.000 en vez de uno de 120.000', async () => {
    await client.createTransaction(userId, {
      type: 'expense',
      amount: 20000,
      currency: 'ARS',
      description: 'Zapatillas',
      transaction_date: '2026-09-08',
      installments: { count: 6 },
    });

    const { rows } = await client.listTransactions(userId, { from: '2020-01-01', to: '2030-01-01', pageSize: 50 });
    const cuotas = rows.filter((row) => row.description === 'Zapatillas');
    expect(cuotas).toHaveLength(6);
    expect(cuotas.every((row) => row.amount === 20000)).toBe(true);
    expect(cuotas.map((row) => row.installment_number).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 3, 4, 5, 6]);

    // El saldo sólo descuenta la que ya venció.
    expect(runningBalance(cuotas, '2026-09-30')).toBe(-20000);
    expect(runningBalance(cuotas, '2026-11-30')).toBe(-60000);

    const [plan] = pendingInstallments(cuotas, '2026-09-30');
    expect(plan.pending_count).toBe(5);
    expect(plan.paid_count).toBe(1);
    expect(plan.pending_amount).toBe(100000);
    expect(plan.next_date).toBe('2026-10-08');
  });

  it('un movimiento sin plan sigue siendo uno solo', async () => {
    await client.createTransaction(userId, {
      type: 'expense',
      amount: 45000,
      currency: 'ARS',
      description: 'Super',
      transaction_date: '2026-09-08',
    });
    const { rows } = await client.listTransactions(userId, { from: '2020-01-01', to: '2030-01-01', pageSize: 50 });
    const super_ = rows.filter((row) => row.description === 'Super');
    expect(super_).toHaveLength(1);
    expect(super_[0].installment_id ?? null).toBeNull();
    expect(pendingInstallments(super_, '2026-09-30')).toEqual([]);
  });
});
