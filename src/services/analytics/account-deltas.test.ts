import { describe, expect, it } from 'vitest';
import { accountDeltas } from './account-deltas';
import { makeTransaction } from '@/test/factories';
import type { Account, PaymentMethod } from '@/types/transaction';

const account = (id: string, partial: Partial<Account> = {}): Account => ({
  id,
  user_id: 'u1',
  name: id,
  currency: 'ARS',
  kind: 'savings',
  balance: 1_000_000,
  balance_updated_at: '2026-09-01',
  balance_declared_at: '2026-09-01T12:00:00.000Z',
  institution: null,
  notes: null,
  sort_order: 0,
  include_in_net_worth: true,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  ...partial,
});

const method = (id: string, kind: PaymentMethod['kind'], accountId: string | null): PaymentMethod => ({
  id,
  user_id: 'u1',
  name: id,
  kind,
  account_id: accountId,
  is_default: false,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
});

const deltaOf = (rows: ReturnType<typeof accountDeltas>, id: string) =>
  rows.find((row) => row.account_id === id)?.delta ?? 0;

describe('lo que se movió de cada cuenta', () => {
  const caja = account('caja');
  const debito = method('debito', 'debit', 'caja');
  const visa = method('visa', 'credit', 'caja');
  const efectivo = method('efectivo', 'cash', null);

  it('un gasto con débito descuenta de su cuenta', () => {
    const rows = [makeTransaction({ amount: 30000, base_amount: 30000, transaction_date: '2026-09-05', payment_method_id: 'debito' })];
    expect(deltaOf(accountDeltas([caja], [debito], rows, '2026-09-09'), 'caja')).toBe(-30000);
  });

  it('un ingreso suma', () => {
    const rows = [makeTransaction({ type: 'income', amount: 50000, base_amount: 50000, transaction_date: '2026-09-05', payment_method_id: 'debito' })];
    expect(deltaOf(accountDeltas([caja], [debito], rows, '2026-09-09'), 'caja')).toBe(50000);
  });

  it('la tarjeta de crédito NO descuenta al comprar: se paga el resumen', () => {
    const rows = [makeTransaction({ amount: 90000, base_amount: 90000, transaction_date: '2026-09-05', payment_method_id: 'visa' })];
    expect(deltaOf(accountDeltas([caja], [debito, visa], rows, '2026-09-09'), 'caja')).toBe(0);
  });

  it('un medio de pago sin cuenta no mueve nada', () => {
    const rows = [makeTransaction({ amount: 5000, base_amount: 5000, transaction_date: '2026-09-05', payment_method_id: 'efectivo' })];
    expect(accountDeltas([caja], [efectivo], rows, '2026-09-09').every((row) => row.delta === 0)).toBe(true);
  });

  it('lo anterior al día en que se declaró el saldo no cuenta', () => {
    const rows = [makeTransaction({ amount: 80000, base_amount: 80000, transaction_date: '2026-08-20', payment_method_id: 'debito' })];
    expect(deltaOf(accountDeltas([caja], [debito], rows, '2026-09-09'), 'caja')).toBe(0);
  });

  it('lo que todavía no venció tampoco', () => {
    const rows = [makeTransaction({ amount: 20000, base_amount: 20000, transaction_date: '2026-11-08', payment_method_id: 'debito' })];
    expect(deltaOf(accountDeltas([caja], [debito], rows, '2026-09-09'), 'caja')).toBe(0);
  });

  it('comprar dólares saca los pesos de la cuenta que los pagó', () => {
    const rows = [
      makeTransaction({
        type: 'transfer',
        amount: 100,
        currency: 'USD',
        base_amount: 145000,
        exchange_kind: 'buy',
        exchange_rate: 1450,
        transaction_date: '2026-09-05',
        payment_method_id: 'debito',
      }),
    ];
    expect(deltaOf(accountDeltas([caja], [debito], rows, '2026-09-09'), 'caja')).toBe(-145000);
  });

  it('una cuenta en dólares toma el importe en su moneda, no el convertido', () => {
    const usd = account('usd', { currency: 'USD', balance: 500 });
    const transferencia = method('tr', 'transfer', 'usd');
    const rows = [
      makeTransaction({
        amount: 100,
        currency: 'USD',
        base_amount: 150000,
        exchange_rate: 1500,
        transaction_date: '2026-09-05',
        payment_method_id: 'tr',
      }),
    ];
    expect(deltaOf(accountDeltas([usd], [transferencia], rows, '2026-09-09'), 'usd')).toBe(-100);
  });

  it('del día en que se declaró el saldo sólo entra lo cargado después', () => {
    const hoy = account('hoy', { balance_updated_at: '2026-09-09', balance_declared_at: '2026-09-09T10:00:00.000Z' });
    const debitoHoy = method('debito', 'debit', 'hoy');

    const antes = makeTransaction({
      amount: 1000,
      base_amount: 1000,
      transaction_date: '2026-09-09',
      payment_method_id: 'debito',
      created_at: '2026-09-09T09:00:00.000Z',
    });
    const despues = makeTransaction({
      amount: 2000,
      base_amount: 2000,
      transaction_date: '2026-09-09',
      payment_method_id: 'debito',
      created_at: '2026-09-09T11:00:00.000Z',
    });

    // El de la mañana ya estaba reflejado en el saldo que declaró a las 10.
    expect(deltaOf(accountDeltas([hoy], [debitoHoy], [antes], '2026-09-09'), 'hoy')).toBe(0);
    expect(deltaOf(accountDeltas([hoy], [debitoHoy], [despues], '2026-09-09'), 'hoy')).toBe(-2000);
  });

  it('cuenta cuántos movimientos entraron, para poder explicarlo', () => {
    const rows = [
      makeTransaction({ amount: 1000, base_amount: 1000, transaction_date: '2026-09-05', payment_method_id: 'debito' }),
      makeTransaction({ amount: 2000, base_amount: 2000, transaction_date: '2026-09-06', payment_method_id: 'debito' }),
    ];
    const [fila] = accountDeltas([caja], [debito], rows, '2026-09-09');
    expect(fila.movements).toBe(2);
    expect(fila.delta).toBe(-3000);
  });
});
