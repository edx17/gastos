import { describe, expect, it } from 'vitest';
import { PLANS, getPlan } from '@/constants/plans';
import { cheapestPlanWith, earliestReportDate, effectivePlan, includes, quotaFor } from './quota';
import type { PlanUsage, Subscription } from '@/types/plan';

const usage = (overrides: Partial<PlanUsage> = {}): PlanUsage => ({
  transactions: 0,
  receipts: 0,
  ai_queries: 0,
  budgets: 0,
  goals: 0,
  household_members: 0,
  ...overrides,
});

const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 's1',
  user_id: 'u1',
  plan_code: 'personal',
  status: 'active',
  current_period_end: null,
  cancel_at_period_end: false,
  provider: 'mercadopago',
  external_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('effectivePlan', () => {
  it('sin suscripción es el plan gratis', () => {
    expect(effectivePlan(null).code).toBe('free');
  });

  it('una suscripción activa manda', () => {
    expect(effectivePlan(subscription()).code).toBe('personal');
    expect(effectivePlan(subscription({ status: 'trialing' })).code).toBe('personal');
  });

  it('vuelve a gratis cuando venció el período', () => {
    expect(effectivePlan(subscription({ current_period_end: '2020-01-01T00:00:00.000Z' })).code).toBe('free');
  });

  it('vuelve a gratis si está cancelada o impaga', () => {
    expect(effectivePlan(subscription({ status: 'canceled' })).code).toBe('free');
    expect(effectivePlan(subscription({ status: 'past_due' })).code).toBe('free');
  });

  it('respeta el período pago aunque se haya pedido la baja', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const sub = subscription({ cancel_at_period_end: true, current_period_end: future });
    expect(effectivePlan(sub).code).toBe('personal');
  });
});

describe('quotaFor', () => {
  const free = getPlan('free');

  it('cuenta lo usado y lo que queda', () => {
    const quota = quotaFor(free, usage({ transactions: 12 }), 'transactions_per_month');
    expect(quota).toMatchObject({ used: 12, limit: 30, remaining: 18, exhausted: false, nearLimit: false });
  });

  it('avisa cuando queda poco', () => {
    expect(quotaFor(free, usage({ transactions: 24 }), 'transactions_per_month').nearLimit).toBe(true);
  });

  it('marca el cupo agotado', () => {
    const quota = quotaFor(free, usage({ transactions: 30 }), 'transactions_per_month');
    expect(quota.exhausted).toBe(true);
    expect(quota.remaining).toBe(0);
  });

  it('nunca devuelve un resto negativo', () => {
    expect(quotaFor(free, usage({ transactions: 45 }), 'transactions_per_month').remaining).toBe(0);
  });

  it('un plan sin tope no se agota', () => {
    const personal = getPlan('personal');
    const quota = quotaFor(personal, usage({ transactions: 5000 }), 'transactions_per_month');
    expect(quota.limit).toBeNull();
    expect(quota.exhausted).toBe(false);
  });

  it('trata las funciones de sí o no como cupo cero', () => {
    expect(quotaFor(free, usage(), 'csv_export').exhausted).toBe(true);
    expect(quotaFor(getPlan('personal'), usage(), 'csv_export').exhausted).toBe(false);
  });
});

describe('includes', () => {
  it('sabe qué trae cada plan', () => {
    expect(includes(getPlan('free'), 'receipts_per_month')).toBe(false);
    expect(includes(getPlan('personal'), 'receipts_per_month')).toBe(true);
    expect(includes(getPlan('personal'), 'household_members')).toBe(false);
    expect(includes(getPlan('hogar'), 'household_members')).toBe(true);
    expect(includes(getPlan('free'), 'ai_insights')).toBe(false);
  });
});

describe('cheapestPlanWith', () => {
  it('sugiere el plan más barato que resuelve la necesidad', () => {
    expect(cheapestPlanWith('receipts_per_month', PLANS)?.code).toBe('personal');
    expect(cheapestPlanWith('household_members', PLANS)?.code).toBe('hogar');
    expect(cheapestPlanWith('transactions_per_month', PLANS)?.code).toBe('free');
  });
});

describe('earliestReportDate', () => {
  const today = new Date(2026, 8, 15);

  it('el plan gratis sólo ve el mes en curso', () => {
    expect(earliestReportDate(getPlan('free'), today)).toBe('2026-09-01');
  });

  it('los planes pagos abren la historia', () => {
    expect(earliestReportDate(getPlan('personal'), today)).toBe('2024-10-01');
  });
});
