export type CurrencyCode = 'ARS' | 'USD' | 'EUR' | (string & {});

export interface CurrencyDefinition {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
  decimals: number;
}

export interface ExchangeRate {
  id: string;
  base_currency: CurrencyCode;
  quote_currency: CurrencyCode;
  rate: number;
  rate_date: string;
  source: 'manual' | 'api' | 'seed';
  created_at: string;
}

/** Money is always stored with its original amount plus a base-currency projection. */
export interface MoneyPair {
  original_amount: number;
  original_currency: CurrencyCode;
  exchange_rate: number;
  base_amount: number;
  base_currency: CurrencyCode;
}
