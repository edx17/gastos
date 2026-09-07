import type { ISODate, ISODateTime, UUID } from './common';
import type { CurrencyCode } from './currency';

export interface Goal {
  id: UUID;
  user_id: UUID;
  household_id: UUID | null;
  name: string;
  description?: string | null;
  target_amount: number;
  current_amount: number;
  currency: CurrencyCode;
  target_date: ISODate | null;
  monthly_contribution: number | null;
  icon: string;
  color: string;
  is_archived: boolean;
  created_at: ISODateTime;
  updated_at?: ISODateTime;
}

export interface GoalContribution {
  id: UUID;
  goal_id: UUID;
  user_id: UUID;
  amount: number;
  currency: CurrencyCode;
  note?: string | null;
  contributed_on: ISODate;
  created_at: ISODateTime;
}

export interface GoalProjection {
  goal: Goal;
  progress: number;
  remaining: number;
  months_left: number | null;
  required_monthly: number | null;
  estimated_completion: ISODate | null;
  on_track: boolean | null;
}
