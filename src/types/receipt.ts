import type { ISODate, ISODateTime, UUID } from './common';
import type { CurrencyCode } from './currency';

export interface ReceiptItemDraft {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  category_id?: UUID | null;
  subcategory_id?: UUID | null;
  category_name?: string;
  confidence?: number;
}

export interface ParsedReceipt {
  merchant: string | null;
  merchant_tax_id: string | null;
  address: string | null;
  date: ISODate | null;
  time: string | null;
  receipt_number: string | null;
  currency: CurrencyCode;
  items: ReceiptItemDraft[];
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  total: number | null;
  payment_method: string | null;
  /** Populated when several plausible totals were found — the UI asks instead of guessing. */
  total_candidates?: number[];
  confidence: number;
  warnings: string[];
}

export interface Receipt {
  id: UUID;
  user_id: UUID;
  transaction_id: UUID | null;
  storage_path: string | null;
  thumbnail_path?: string | null;
  merchant_name: string | null;
  merchant_tax_id: string | null;
  receipt_number: string | null;
  receipt_date: ISODate | null;
  currency: CurrencyCode;
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  total: number | null;
  ocr_raw_text: string | null;
  ocr_confidence: number | null;
  ocr_provider: string;
  parsed_data: ParsedReceipt | null;
  created_at: ISODateTime;
}

export interface ReceiptItem {
  id: UUID;
  receipt_id: UUID;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  category_id: UUID | null;
  subcategory_id: UUID | null;
  created_at: ISODateTime;
}

export interface OcrResult {
  text: string;
  confidence: number;
  provider: string;
  blocks?: { text: string; confidence?: number }[];
  /** True when produced by the development mock provider. */
  mock?: boolean;
}
