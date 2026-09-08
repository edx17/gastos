import type { ISODateTime, UUID } from './common';
import type { PlanCode, PlanLimits } from '@/constants/plans';

export type { PlanCode, PlanLimits };

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused';

export interface Subscription {
  id: UUID;
  user_id: UUID;
  plan_code: PlanCode;
  status: SubscriptionStatus;
  current_period_end: ISODateTime | null;
  cancel_at_period_end: boolean;
  provider: string;
  external_id: string | null;
  created_at: ISODateTime;
}

/** Uso del mes en curso, para mostrar cuánto queda antes de chocar el límite. */
export interface PlanUsage {
  transactions: number;
  receipts: number;
  ai_queries: number;
  budgets: number;
  goals: number;
  household_members: number;
}

/** Cada cosa que un plan puede habilitar o limitar. */
export type PlanFeature = keyof PlanLimits;

export interface QuotaState {
  used: number;
  limit: number | null;
  remaining: number | null;
  /** Ya no entra ninguno más. */
  exhausted: boolean;
  /** Queda poco: la interfaz avisa antes de que moleste. */
  nearLimit: boolean;
}
