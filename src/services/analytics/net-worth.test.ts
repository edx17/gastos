import { describe, expect, it } from 'vitest';
import { netWorth } from './net-worth';
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
