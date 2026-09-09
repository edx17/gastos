import type { ISODate, ISODateTime, UUID } from './common';
import type { CurrencyCode } from './currency';
import type { ExchangeKind, TransactionType } from './transaction';
import type { AiProviderId } from './user';

/** What the user is trying to record, before it becomes a transaction. */
export interface ParsedIntent {
  type: TransactionType | 'unknown';
  amount: number | null;
  currency: CurrencyCode;
  /** True when the user actually said the currency instead of us defaulting. */
  currency_explicit: boolean;
  date: ISODate;
  date_explicit: boolean;
  description: string;
  merchant: string | null;
  payment_method: string | null;
  notes?: string | null;
  /** Cuando la frase era una compra o venta de moneda extranjera. */
  exchange_kind?: ExchangeKind | null;
  /** La cotización, sólo si la persona la dijo. */
  exchange_rate?: number | null;
  confidence: number;
  /** Fields Crocante could not resolve — the UI asks instead of inventing them. */
  missing: ParsedField[];
  /** Human question shown when something essential is missing or ambiguous. */
  question?: string;
  amount_candidates?: number[];
  raw_input: string;
  engine: 'rules' | 'ai' | 'hybrid';
}

export type ParsedField = 'amount' | 'description' | 'type' | 'date';

export interface CategorySuggestion {
  category_id: UUID | null;
  category_name: string;
  subcategory_id: UUID | null;
  subcategory_name: string | null;
  confidence: number;
  /** Why this was suggested — shown to the user, never a silent overwrite. */
  reason: string;
  source: 'user_rule' | 'history' | 'merchant' | 'keywords' | 'ai' | 'fallback';
}

export interface DraftTransaction {
  intent: ParsedIntent;
  suggestion: CategorySuggestion;
  /** `save` = confident enough to save with a review link; `confirm` = show the card; `ask` = missing data. */
  action: 'save' | 'confirm' | 'ask';
}

export interface AiParseRequest {
  text: string;
  today: ISODate;
  base_currency: CurrencyCode;
  categories: { id: string; name: string; subcategories: { id: string; name: string }[] }[];
  /** Recent user corrections, so the model follows the user's own taste. */
  hints?: { text: string; category: string; subcategory?: string | null }[];
}

export interface AiParseResponse {
  type: TransactionType | 'unknown';
  amount: number | null;
  currency: CurrencyCode | null;
  date: ISODate | null;
  description: string | null;
  merchant: string | null;
  category: string | null;
  subcategory: string | null;
  payment_method: string | null;
  confidence: number;
  question?: string | null;
}

export interface AiInsight {
  id: string;
  kind: 'trend' | 'anomaly' | 'recurring' | 'composition' | 'habit' | 'budget';
  title: string;
  body: string;
  severity: 'info' | 'positive' | 'warning';
  /** The numbers the statement is based on, so the user can check it. */
  evidence: { label: string; value: string }[];
}

export interface AiQueryAnswer {
  question: string;
  answer: string;
  metrics: { label: string; value: string; hint?: string }[];
  chart?: {
    kind: 'bar' | 'line' | 'pie';
    data: { label: string; value: number }[];
  };
  used: { transactions: number; from: ISODate; to: ISODate; filters: string[] };
}

export interface AiInteraction {
  id: UUID;
  user_id: UUID;
  kind: 'parse' | 'categorize' | 'insight' | 'query' | 'receipt';
  provider: AiProviderId | string;
  model: string;
  input: string;
  output: string;
  confidence: number | null;
  latency_ms: number;
  success: boolean;
  error?: string | null;
  created_at: ISODateTime;
}

export interface CategorizationRule {
  id: UUID;
  user_id: UUID;
  /** Normalized text that triggers the rule (merchant or keyword). */
  pattern: string;
  match_type: 'exact' | 'contains';
  category_id: UUID;
  subcategory_id: UUID | null;
  /** `always` applies silently with high confidence, `ask` only suggests. */
  strategy: 'always' | 'ask';
  hits: number;
  created_at: ISODateTime;
  updated_at?: ISODateTime;
}
