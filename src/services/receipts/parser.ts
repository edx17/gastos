import { round } from '@/lib/utils';
import { canonicalMerchantName } from '@/services/nlp/brands';
import { parseNumericLiteral } from '@/services/nlp/numbers';
import type { ParsedReceipt, ReceiptItemDraft } from '@/types/receipt';
import type { CurrencyCode } from '@/types/currency';

const NOISE = [
  'total', 'subtotal', 'sub total', 'iva', 'impuesto', 'descuento', 'dto', 'bonificacion', 'bonif',
  'efectivo', 'vuelto', 'cambio', 'tarjeta', 'debito', 'credito', 'visa', 'mastercard', 'cuit',
  'cuil', 'factura', 'ticket', 'comprobante', 'caja', 'cajero', 'gracias', 'atendido', 'cae',
  'ingresos brutos', 'resp', 'consumidor final', 'transferencia', 'mercado pago', 'saldo', 'propina',
  'items', 'articulos', 'redondeo', 'ahorro',
];

const MONEY = String.raw`\$?\s?-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\$?\s?-?\d+(?:[.,]\d{1,2})?`;

/**
 * Turns raw OCR text from an Argentine ticket into structured data.
 *
 * Everything is best-effort and reported with warnings: when the total cannot be
 * established with confidence the UI asks the user instead of saving a guess.
 */
export function parseReceiptText(text: string, defaults: { currency?: CurrencyCode } = {}): ParsedReceipt {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const warnings: string[] = [];
  const currency = detectCurrency(text, defaults.currency ?? 'ARS');

  const merchant = detectMerchant(rawLines);
  const merchantTaxId = matchFirst(text, /\b(\d{2}-\d{8}-\d)\b/) ?? normalizeCuit(matchFirst(text, /\bcuit[:\s]*(\d{11})\b/i));
  const address = detectAddress(rawLines);
  const date = detectDate(text);
  const time = matchFirst(text, /\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/, 0);
  const receiptNumber =
    matchFirst(text, /\b(\d{4,5}-\d{6,8})\b/) ??
    matchFirst(text, /(?:ticket|factura|comprobante|nro|n[°º.])\s*[a-z]?\s*[:\s]\s*(\d{4,})/i);

  const items = detectItems(rawLines);
  const labelled = detectLabelledAmounts(rawLines);

  const itemsTotal = round(items.reduce((acc, item) => acc + item.total, 0), 2);
  let total = labelled.total;
  const totalCandidates = labelled.totalCandidates;

  if (total === null && itemsTotal > 0) {
    total = itemsTotal;
    warnings.push('No encontré la línea del total: sumé los productos detectados.');
  }
  if (total !== null && itemsTotal > 0 && Math.abs(total - itemsTotal) / total > 0.25 && labelled.discount === null) {
    warnings.push('El total no coincide con la suma de los productos. Revisalo antes de guardar.');
  }
  if (totalCandidates.length > 1) {
    warnings.push('Detecté más de un importe que podría ser el total.');
  }
  if (!items.length) {
    warnings.push('No pude separar los productos. Podés guardar el ticket como un único gasto.');
  }

  const confidence = scoreConfidence({ merchant, date, total, items: items.length, warnings: warnings.length });

  return {
    merchant,
    merchant_tax_id: merchantTaxId,
    address,
    date,
    time: time ?? null,
    receipt_number: receiptNumber,
    currency,
    items,
    subtotal: labelled.subtotal ?? (items.length ? itemsTotal : null),
    discount: labelled.discount,
    tax: labelled.tax,
    total: total === null ? null : round(total, 2),
    payment_method: detectPayment(text),
    total_candidates: totalCandidates.length > 1 ? totalCandidates : undefined,
    confidence,
    warnings,
  };
}

function detectCurrency(text: string, fallback: CurrencyCode): CurrencyCode {
  if (/u\$s|usd|dolar/i.test(text)) return 'USD';
  if (/€|\beur\b/i.test(text)) return 'EUR';
  return fallback;
}

function detectMerchant(lines: string[]): string | null {
  for (const line of lines.slice(0, 6)) {
    const lower = line.toLowerCase();
    if (NOISE.some((noise) => lower.startsWith(noise))) continue;
    if (/^\d/.test(line)) continue;
    const letters = line.replace(/[^a-zA-ZÁ-úñÑ]/g, '');
    if (letters.length < 4) continue;
    return canonicalMerchantName(line.replace(/\s+(s\.?a\.?|s\.?r\.?l\.?|cicsa|sa|srl)\b.*$/i, '').trim());
  }
  return null;
}

function detectAddress(lines: string[]): string | null {
  const hit = lines.slice(0, 8).find((line) => /\b(av\.?|avenida|calle|ruta|bv\.?|boulevard)\b/i.test(line));
  return hit ?? null;
}

function detectDate(text: string): string | null {
  const match = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/.exec(text);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function detectPayment(text: string): string | null {
  const patterns: [RegExp, string][] = [
    [/mercado ?pago/i, 'Mercado Pago'],
    [/tarjeta de debito|debito|maestro/i, 'Débito'],
    [/tarjeta de credito|credito|visa credito|amex/i, 'Crédito'],
    [/efectivo|contado/i, 'Efectivo'],
    [/transferencia|cbu/i, 'Transferencia'],
    [/\bqr\b/i, 'QR'],
    [/\btarjeta\b/i, 'Tarjeta'],
  ];
  return patterns.find(([re]) => re.test(text))?.[1] ?? null;
}

interface LabelledAmounts {
  total: number | null;
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  totalCandidates: number[];
}

function detectLabelledAmounts(lines: string[]): LabelledAmounts {
  let total: number | null = null;
  let subtotal: number | null = null;
  let discount: number | null = null;
  let tax: number | null = null;
  const totalCandidates: number[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    const value = lastAmount(line);
    if (value === null) continue;

    if (/^sub\s?total\b/.test(lower)) {
      subtotal ??= value;
    } else if (/^(descuento|dto|bonificacion|bonif|ahorro)\b/.test(lower)) {
      discount ??= Math.abs(value);
    } else if (/^(iva|impuesto|percepcion)\b/.test(lower)) {
      tax ??= Math.abs(value);
    } else if (/\btotal\b/.test(lower) && !/sub\s?total/.test(lower)) {
      // "TOTAL A PAGAR" and "TOTAL" can both appear; keep every candidate.
      if (!totalCandidates.includes(value)) totalCandidates.push(value);
      total ??= value;
    }
  }

  // "TOTAL" repeated with the same value is not ambiguity.
  const distinct = Array.from(new Set(totalCandidates));
  if (distinct.length > 1) total = Math.max(...distinct);

  return { total, subtotal, discount, tax, totalCandidates: distinct };
}

function lastAmount(line: string): number | null {
  const matches = line.match(new RegExp(MONEY, 'g'));
  if (!matches?.length) return null;
  const value = parseNumericLiteral(matches[matches.length - 1].replace(/\$|\s/g, ''));
  return value === null ? null : round(value, 2);
}

// "LECHE 2 x 1.800,00 3.600,00" y también "INFINIA 28,45 LT x 1.230,00 34.993,50".
const UNITS = String.raw`(?:lt|ltr?|l|kg|k|gr?|g|ml|cc|un|u|uni|und|c\/u|x\s?kg)?`;
const ITEM_WITH_QTY = new RegExp(
  String.raw`^(?<desc>.+?)\s+(?<qty>\d{1,4}(?:[.,]\d{1,3})?)\s*${UNITS}\s*[x×*]\s*(?<unit>${MONEY})\s+(?<total>${MONEY})$`,
  'i',
);
const ITEM_SIMPLE = new RegExp(String.raw`^(?<desc>.+?)\s+(?<total>${MONEY})$`);

function detectItems(lines: string[]): ReceiptItemDraft[] {
  const items: ReceiptItemDraft[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (NOISE.some((noise) => lower.startsWith(noise))) continue;
    if (/^[\d\s.,:/-]+$/.test(line)) continue;

    const withQty = ITEM_WITH_QTY.exec(line);
    if (withQty?.groups) {
      const desc = cleanDescription(withQty.groups.desc);
      const qty = parseNumericLiteral(withQty.groups.qty) ?? 1;
      const unit = parseNumericLiteral(withQty.groups.unit.replace(/\$|\s/g, '')) ?? 0;
      const total = parseNumericLiteral(withQty.groups.total.replace(/\$|\s/g, '')) ?? round(qty * unit, 2);
      if (desc && total > 0) {
        items.push({ description: desc, quantity: round(qty, 3), unit_price: round(unit, 2), total: round(total, 2) });
        continue;
      }
    }

    const simple = ITEM_SIMPLE.exec(line);
    if (simple?.groups) {
      const desc = cleanDescription(simple.groups.desc);
      const total = parseNumericLiteral(simple.groups.total.replace(/\$|\s/g, ''));
      if (desc && total && total > 0 && countLetters(desc) >= 3) {
        items.push({ description: desc, quantity: 1, unit_price: round(total, 2), total: round(total, 2) });
      }
    }
  }

  return items;
}

function cleanDescription(value: string): string {
  const cleaned = value
    .replace(/\s+/g, ' ')
    .replace(/^[\d\s.*x-]+/i, '')
    .trim();
  if (countLetters(cleaned) < 3) return '';
  // Title-case words, but keep unit tokens intact: "1L", "750ML", "2.25L".
  return cleaned
    .toLowerCase()
    .split(' ')
    .map((word) => (/\d/.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

function countLetters(value: string): number {
  return (value.match(/[a-zA-ZÁ-úñÑ]/g) ?? []).length;
}

function scoreConfidence(args: {
  merchant: string | null;
  date: string | null;
  total: number | null;
  items: number;
  warnings: number;
}): number {
  let score = 0.25;
  if (args.merchant) score += 0.2;
  if (args.date) score += 0.15;
  if (args.total !== null) score += 0.25;
  if (args.items > 0) score += Math.min(0.15, args.items * 0.03);
  score -= args.warnings * 0.08;
  return round(Math.min(0.97, Math.max(0.1, score)), 2);
}

function matchFirst(text: string, re: RegExp, group = 1): string | null {
  const match = re.exec(text);
  if (!match) return null;
  return match[group] ?? match[0] ?? null;
}

function normalizeCuit(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}
