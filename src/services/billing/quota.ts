import { DEFAULT_PLAN, getPlan, type Plan, type PlanCode, type PlanLimits } from '@/constants/plans';
import type { PlanUsage, QuotaState, Subscription } from '@/types/plan';

/** Umbral a partir del cual conviene avisar que queda poco. */
const NEAR_LIMIT_RATIO = 0.8;

/** Qué plan rige realmente para una suscripción: vencida o cancelada vuelve a gratis. */
export function effectivePlan(subscription: Subscription | null): Plan {
  if (!subscription) return getPlan(DEFAULT_PLAN);
  const active = subscription.status === 'active' || subscription.status === 'trialing';
  const expired =
    subscription.current_period_end !== null && new Date(subscription.current_period_end) <= new Date();
  return active && !expired ? getPlan(subscription.plan_code) : getPlan(DEFAULT_PLAN);
}

const USAGE_KEY: Partial<Record<keyof PlanLimits, keyof PlanUsage>> = {
  transactions_per_month: 'transactions',
  receipts_per_month: 'receipts',
  ai_queries_per_month: 'ai_queries',
  budgets: 'budgets',
  goals: 'goals',
  household_members: 'household_members',
};

/** Estado de un cupo puntual: cuánto se usó, cuánto queda, si ya se acabó. */
export function quotaFor(plan: Plan, usage: PlanUsage, feature: keyof PlanLimits): QuotaState {
  const limit = plan.limits[feature];
  const usageKey = USAGE_KEY[feature];
  const used = usageKey ? usage[usageKey] : 0;

  if (typeof limit === 'boolean') {
    return { used, limit: limit ? null : 0, remaining: limit ? null : 0, exhausted: !limit, nearLimit: false };
  }
  if (limit === null) {
    return { used, limit: null, remaining: null, exhausted: false, nearLimit: false };
  }

  const remaining = Math.max(0, limit - used);
  return {
    used,
    limit,
    remaining,
    exhausted: remaining <= 0,
    nearLimit: limit > 0 && used / limit >= NEAR_LIMIT_RATIO,
  };
}

/** ¿La función está incluida en el plan? (independiente de cuánto se haya usado) */
export function includes(plan: Plan, feature: keyof PlanLimits): boolean {
  const limit = plan.limits[feature];
  if (typeof limit === 'boolean') return limit;
  if (limit === null) return true;
  return limit > 0;
}

/** El plan más barato que incluye la función, para poder sugerirlo con precisión. */
export function cheapestPlanWith(feature: keyof PlanLimits, plans: Plan[]): Plan | null {
  return (
    [...plans]
      .sort((a, b) => a.price - b.price)
      .find((plan) => includes(plan, feature)) ?? null
  );
}

/** Cuántos meses de historia puede mirar el plan, como fecha mínima consultable. */
export function earliestReportDate(plan: Plan, today = new Date()): string {
  const months = Math.max(1, plan.limits.report_history_months);
  const date = new Date(today.getFullYear(), today.getMonth() - (months - 1), 1);
  return date.toISOString().slice(0, 10);
}

export type { Plan, PlanCode, PlanLimits };
