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
  /** Agrupa las cuotas de una misma compra. */
  installment_id?: UUID | null;
  installment_number?: number | null;
  installment_count?: number | null;
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

/** Una compra en cuotas: `amount` es lo que se paga por cuota, no el total. */
export interface InstallmentPlan {
  count: number;
  /** Desde qué cuota cargar. 1 si la compra es de ahora. */
  from?: number;
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
  /** Cuando está, el movimiento se guarda como un gasto por mes. */
  installments?: InstallmentPlan;
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
  /**
   * De qué cuenta sale la plata al pagar con esto.
   *
   * Las tarjetas de crédito no descuentan al comprar: el consumo se paga en el
   * resumen, y ese pago sale de la cuenta desde la que se transfiere.
   */
  account_id?: UUID | null;
  kind: 'cash' | 'debit' | 'credit' | 'transfer' | 'wallet' | 'other';
  issuer?: string | null;
  /** Last 4 digits at most — full card numbers are never stored. */
  last4?: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: ISODateTime;
}

export type AccountKind = 'checking' | 'savings' | 'cash' | 'investment' | 'wallet' | 'debt';

/**
 * Un lugar donde hay plata: la caja de ahorro, el FIMA, Reservas de Mercado
 * Pago, los dólares en el cajón.
 *
 * El saldo es declarado, no deducido de los movimientos: nadie carga en una app
 * de gastos cada rendimiento ni cada transferencia entre cuentas propias.
 */
export interface Account {
  id: UUID;
  user_id: UUID;
  name: string;
  currency: CurrencyCode;
  kind: AccountKind;
  balance: number;
  /** Cuándo se actualizó el saldo por última vez. */
  balance_updated_at?: ISODate | null;
  /** El momento exacto, para distinguir lo que se cargó ese mismo día después. */
  balance_declared_at?: ISODateTime | null;
  /** El banco o la billetera: Galicia, Mercado Pago, Belo. */
  institution?: string | null;
  notes?: string | null;
  sort_order: number;
  /** Una tarjeta o una cuenta ajena puede querer verse sin sumar al total. */
  include_in_net_worth: boolean;
  is_active: boolean;
  created_at: ISODateTime;
}

export interface AccountInput {
  name: string;
  currency: CurrencyCode;
  kind: AccountKind;
  balance: number;
  institution?: string | null;
  notes?: string | null;
  include_in_net_worth?: boolean;
}

/** Cuánto se movió una cuenta desde el día en que se declaró su saldo. */
export interface AccountDelta {
  account_id: UUID;
  delta: number;
  movements: number;
}

/** Un saldo declarado en una fecha, para ver la evolución. */
export interface AccountBalancePoint {
  id: UUID;
  account_id: UUID;
  balance: number;
  recorded_on: ISODate;
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
