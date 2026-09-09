import type { ISODate, ISODateTime, UUID } from './common';
import type { CurrencyCode } from './currency';

export type TransactionType = 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment';

export type TransactionSource = 'manual' | 'natural_language' | 'receipt' | 'import' | 'ai' | 'seed';

/** Compra o venta de moneda extranjera. */
export type ExchangeKind = 'buy' | 'sell';

export interface Transaction {
  id: UUID;
  user_id: UUID;
  household_id: UUID | null;
  type: TransactionType;
  /** Amount in `currency` — never overwritten by conversions. */
  amount: number;
  currency: CurrencyCode;
  base_amount: number;
  base_currency: CurrencyCode;
  exchange_rate: number;
  /**
   * Marca los cambios de moneda. Comprar dólares no consume plata, la cambia de
   * moneda, así que el movimiento es una transferencia y esto dice hacia dónde.
   */
  exchange_kind?: ExchangeKind | null;
  description: string;
  merchant_id: UUID | null;
  merchant_name?: string | null;
  category_id: UUID | null;
  subcategory_id: UUID | null;
  payment_method_id: UUID | null;
  account_id: UUID | null;
  transaction_date: ISODate;
  notes?: string | null;
  source: TransactionSource;
  ai_confidence?: number | null;
  receipt_id?: UUID | null;
  is_recurring?: boolean;
  recurring_id?: UUID | null;
  paid_by?: UUID | null;
  created_by?: UUID | null;
  created_at: ISODateTime;
  updated_at?: ISODateTime;
}

export interface TransactionItem {
  id: UUID;
  transaction_id: UUID;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  category_id: UUID | null;
  subcategory_id: UUID | null;
  created_at: ISODateTime;
}

export interface TransactionInput {
  type: TransactionType;
  amount: number;
  currency: CurrencyCode;
  description: string;
  transaction_date: ISODate;
  category_id?: UUID | null;
  subcategory_id?: UUID | null;
  merchant_name?: string | null;
  payment_method_id?: UUID | null;
  account_id?: UUID | null;
  notes?: string | null;
  source?: TransactionSource;
  ai_confidence?: number | null;
  receipt_id?: UUID | null;
  household_id?: UUID | null;
  paid_by?: UUID | null;
  exchange_rate?: number;
  exchange_kind?: ExchangeKind | null;
  items?: Omit<TransactionItem, 'id' | 'transaction_id' | 'created_at'>[];
}

export interface TransactionFilters {
  from?: ISODate;
  to?: ISODate;
  types?: TransactionType[];
  categoryIds?: UUID[];
  subcategoryIds?: UUID[];
  paymentMethodIds?: UUID[];
  merchant?: string;
  currency?: CurrencyCode;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
  onlyRecurring?: boolean;
  hasReceipt?: boolean;
  sort?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
  page?: number;
  pageSize?: number;
}

export interface PaymentMethod {
  id: UUID;
  user_id: UUID;
  name: string;
  kind: 'cash' | 'debit' | 'credit' | 'transfer' | 'wallet' | 'other';
  issuer?: string | null;
  /** Last 4 digits at most — full card numbers are never stored. */
  last4?: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: ISODateTime;
}

export interface Account {
  id: UUID;
  user_id: UUID;
  name: string;
  currency: string;
  kind: 'checking' | 'savings' | 'cash' | 'investment' | 'wallet';
  is_active: boolean;
  created_at: ISODateTime;
}

export interface Merchant {
  id: UUID;
  user_id: UUID;
  name: string;
  normalized_name: string;
  default_category_id?: UUID | null;
  default_subcategory_id?: UUID | null;
  tax_id?: string | null;
  created_at: ISODateTime;
}
