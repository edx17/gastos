import type { CurrencyCode, CurrencyDefinition } from '@/types/currency';
import { round } from './utils';

export const CURRENCIES: Record<string, CurrencyDefinition> = {
  ARS: { code: 'ARS', symbol: '$', name: 'Peso argentino', locale: 'es-AR', decimals: 2 },
  USD: { code: 'USD', symbol: 'US$', name: 'Dólar estadounidense', locale: 'en-US', decimals: 2 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', locale: 'es-ES', decimals: 2 },
  BRL: { code: 'BRL', symbol: 'R$', name: 'Real brasileño', locale: 'pt-BR', decimals: 2 },
  UYU: { code: 'UYU', symbol: '$U', name: 'Peso uruguayo', locale: 'es-UY', decimals: 2 },
  CLP: { code: 'CLP', symbol: 'CLP$', name: 'Peso chileno', locale: 'es-CL', decimals: 0 },
};

/** Currencies offered in the pickers. Adding one here is enough to support it. */
export const SUPPORTED_CURRENCIES: CurrencyCode[] = ['ARS', 'USD', 'EUR'];

export const ALL_CURRENCIES: CurrencyCode[] = Object.keys(CURRENCIES);

export function currencyDef(code: CurrencyCode): CurrencyDefinition {
  return CURRENCIES[code] ?? { code, symbol: code, name: code, locale: 'es-AR', decimals: 2 };
}

export interface FormatMoneyOptions {
  currency?: CurrencyCode;
  decimals?: number;
  /** Drops decimals over 10k so dashboards stay readable. */
  compactDecimals?: boolean;
  signDisplay?: 'auto' | 'never' | 'always' | 'exceptZero';
  withSymbol?: boolean;
}

export function formatMoney(value: number, options: FormatMoneyOptions = {}): string {
  const { currency = 'ARS', compactDecimals = true, signDisplay = 'auto', withSymbol = true } = options;
  const def = currencyDef(currency);
  const abs = Math.abs(value);
  // Cents only show up when they exist: "$8.500" reads better than "$8.500,00".
  const hasFraction = Math.abs(value % 1) > 0.004;
  const decimals = options.decimals ?? (compactDecimals && (!hasFraction || abs >= 10000) ? 0 : def.decimals);

  const formatted = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay,
  }).format(value);

  if (!withSymbol) return formatted;

  const sign = formatted.startsWith('-') ? '-' : formatted.startsWith('+') ? '+' : '';
  return `${sign}${def.symbol}${formatted.replace(/^[-+]/, '')}`;
}

/** Short form for chart axes and tight cards: $1,2 M / $85 k. */
export function formatCompact(value: number, currency: CurrencyCode = 'ARS'): string {
  const def = currencyDef(currency);
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${def.symbol}${round(abs / 1_000_000, 1)} M`;
  if (abs >= 1_000) return `${sign}${def.symbol}${round(abs / 1_000, abs >= 100_000 ? 0 : 1)} k`;
  return `${sign}${def.symbol}${round(abs, 0)}`;
}

export function formatPercent(value: number, decimals = 1): string {
  return `${new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)}%`;
}

/**
 * Converts using a rate table expressed as "units of base currency per 1 unit of X".
 * The original amount is never mutated — callers store both sides of the pair.
 */
export function convert(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: Record<string, number>,
): { amount: number; rate: number } {
  if (from === to) return { amount: round(amount, 2), rate: 1 };
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return { amount: round(amount, 2), rate: 1 };
  const rate = fromRate / toRate;
  return { amount: round(amount * rate, 2), rate: round(rate, 6) };
}

/**
 * Reads a numeric literal the Argentine way: `.` groups thousands, `,` is the decimal
 * separator. A lone dot followed by exactly three digits is a thousands separator
 * (`3.200` = 3200); anything else is a decimal point (`3.20` = 3.2).
 */
export function parseNumericLiteral(literal: string): number | null {
  const cleaned = literal.replace(/\s/g, '');
  if (!/\d/.test(cleaned)) return null;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  let normalized = cleaned;
  if (hasComma && hasDot) {
    normalized = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  } else if (hasDot) {
    const parts = cleaned.split('.');
    const looksLikeThousands = parts.length > 2 || parts[parts.length - 1].length === 3;
    normalized = looksLikeThousands ? parts.join('') : cleaned;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Same rules, applied to whatever the user typed into a form field. */
export function parseAmountInput(input: string): number | null {
  return parseNumericLiteral(input.replace(/[^\d.,-]/g, '').trim());
}
