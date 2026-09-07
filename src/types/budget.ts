import type { ISODate, ISODateTime, UUID } from './common';
import type { CurrencyCode } from './currency';

export type BudgetPeriod = 'weekly' | 'monthly';
export type BudgetStatus = 'normal' | 'warning' | 'danger' | 'exceeded';

export interface Budget {
  id: UUID;
  user_id: UUID;
  household_id: UUID | null;
  name: string;
  period: BudgetPeriod;
  amount: number;
  currency: CurrencyCode;
  /** Null category = overall spending limit. */
  category_id: UUID | null;
  subcategory_id: UUID | null;
  alert_thresholds: number[];
  starts_on: ISODate;
  is_active: boolean;
  created_at: ISODateTime;
  updated_at?: ISODateTime;
}

export interface BudgetProgress {
  budget: Budget;
  spent: number;
  remaining: number;
  ratio: number;
  status: BudgetStatus;
  period_start: ISODate;
  period_end: ISODate;
  category_name?: string;
  projected_end_of_period?: number;
}
