import type { ISODate, UUID } from './common';
import type { CurrencyCode } from './currency';
import type { TransactionFilters } from './transaction';

export interface PeriodSummary {
  from: ISODate;
  to: ISODate;
  income: number;
  expense: number;
  savings: number;
  savings_rate: number;
  transaction_count: number;
  currency: CurrencyCode;
}

export interface ComparisonMetric {
  current: number;
  previous: number;
  delta: number;
  delta_ratio: number | null;
  /** Whether an increase is a good thing for this metric. */
  higher_is_better: boolean;
}

export interface DashboardSummary {
  period: PeriodSummary;
  previous: PeriodSummary;
  comparison: {
    income: ComparisonMetric;
    expense: ComparisonMetric;
    savings: ComparisonMetric;
  };
  balance: number;
  top_categories: CategoryBreakdown[];
  recent_days: DailyPoint[];
}

export interface CategoryBreakdown {
  category_id: UUID | null;
  category_name: string;
  color: string;
  icon?: string;
  amount: number;
  ratio: number;
  transaction_count: number;
  previous_amount?: number;
  delta_ratio?: number | null;
}

export interface SubcategoryBreakdown extends CategoryBreakdown {
  subcategory_id: UUID | null;
  subcategory_name: string;
}

export interface MonthlyPoint {
  month: string;
  label: string;
  income: number;
  expense: number;
  savings: number;
}

export interface DailyPoint {
  date: ISODate;
  income: number;
  expense: number;
  count: number;
}

export interface MerchantRanking {
  merchant: string;
  amount: number;
  count: number;
  last_date: ISODate;
}

export interface AntExpenseReport {
  threshold: number;
  count: number;
  total: number;
  monthly_estimate: number;
  groups: { label: string; count: number; total: number; average: number }[];
}

export interface RecurringExpense {
  id: string;
  user_id: string;
  merchant_key: string;
  label: string;
  average_amount: number;
  currency: CurrencyCode;
  cadence: 'weekly' | 'monthly' | 'bimonthly' | 'yearly';
  occurrences: number;
  last_date: ISODate;
  next_estimated_date: ISODate | null;
  category_id: string | null;
  confirmed: boolean | null;
  created_at: string;
}

export interface ReportBundle {
  filters: TransactionFilters;
  summary: PeriodSummary;
  previous: PeriodSummary;
  byCategory: CategoryBreakdown[];
  bySubcategory: SubcategoryBreakdown[];
  monthly: MonthlyPoint[];
  daily: DailyPoint[];
  merchants: MerchantRanking[];
  paymentMethods: { name: string; amount: number; count: number }[];
  ants: AntExpenseReport;
}
