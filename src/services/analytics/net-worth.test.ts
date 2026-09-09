import { describe, expect, it } from 'vitest';
import { estimatedBalance, netWorth } from './net-worth';
import type { Account } from '@/types/transaction';

const account = (partial: Partial<Account>): Account => ({
  id: Math.random().toString(),
  user_id: 'u1',
  name: 'Cuenta',
  currency: 'ARS',
  kind: 'savings',
  balance: 0,
  balance_updated_at: '2026-09-08',
  institution: null,
  notes: null,
  sort_order: 0,
  include_in_net_worth: true,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  ...partial,
});

const rates = { ARS: 1, USD: 1500 };

describe('patrimonio', () => {
  it('suma cada moneda a la base', () => {
    expect(netWorth([account({ balance: 1_000_000 }), account({ balance: 1_000, currency: 'USD' })], rates)).toBe(
      2_500_000,
    );
  });

  it('una deuda resta', () => {
    expect(netWorth([account({ balance: 1_000_000 }), account({ balance: -400_000, kind: 'debt' })], rates)).toBe(
      600_000,
    );
  });

  it('respeta las cuentas que se pidió dejar afuera', () => {
    expect(
      netWorth([account({ balance: 500_000 }), account({ balance: 900_000, include_in_net_worth: false })], rates),
    ).toBe(500_000);
  });

  it('ignora las archivadas', () => {
    expect(netWorth([account({ balance: 500_000 }), account({ balance: 900_000, is_active: false })], rates)).toBe(
      500_000,
    );
  });

  it('sin cotización cargada no infla el total: cuenta uno a uno', () => {
    expect(netWorth([account({ balance: 100, currency: 'EUR' })], rates)).toBe(100);
  });

  it('sin cuentas da cero, no NaN', () => {
    expect(netWorth([], rates)).toBe(0);
  });
});

describe('saldo estimado', () => {
  it('sin movimientos linkeados es el declarado', () => {
    const cuenta = account({ id: 'a1', balance: 1_000_000 });
    expect(estimatedBalance(cuenta, undefined)).toBe(1_000_000);
    expect(netWorth([cuenta], rates)).toBe(1_000_000);
  });

  it('suma lo que se movió desde que se declaró', () => {
    const cuenta = account({ id: 'a1', balance: 1_000_000 });
    expect(estimatedBalance(cuenta, -130_000)).toBe(870_000);
    expect(netWorth([cuenta], rates, [{ account_id: 'a1', delta: -130_000, movements: 4 }])).toBe(870_000);
  });

  it('el desvío de una cuenta en dólares se convierte una sola vez', () => {
    const cuenta = account({ id: 'a1', balance: 1_000, currency: 'USD' });
    expect(netWorth([cuenta], rates, [{ account_id: 'a1', delta: -100, movements: 1 }])).toBe(1_350_000);
  });

  it('un desvío de una cuenta que no suma al total no mueve el patrimonio', () => {
    const cuenta = account({ id: 'a1', balance: 500_000, include_in_net_worth: false });
    expect(netWorth([cuenta], rates, [{ account_id: 'a1', delta: -100_000, movements: 2 }])).toBe(0);
  });
});
