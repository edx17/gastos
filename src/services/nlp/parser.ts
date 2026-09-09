import { format } from 'date-fns';
import { clamp, round } from '@/lib/utils';
import { formatMoney } from '@/lib/money';
import type { CurrencyCode } from '@/types/currency';
import type { ParsedField, ParsedIntent } from '@/types/ai';
import type { TransactionType } from '@/types/transaction';
import { findDate } from './dates';
import { findAmountCandidates, findWordAmount, pickBestAmount, type AmountCandidate } from './numbers';
import { findMerchant } from './brands';
import { describeExchange, findExchange, type ExchangeMatch } from './exchange';
import { describeCardPayment, findCardPayment } from './card';

export interface ParseContext {
  today?: Date;
  baseCurrency?: CurrencyCode;
}

const VERBS = [
  'gaste', 'gastamos', 'gastar', 'compre', 'compramos', 'pague', 'pagamos', 'abone', 'sale', 'salio',
  'costo', 'cuesta', 'me salio', 'cargue', 'cene', 'almorce', 'desayune', 'tome', 'puse', 'saque',
  'cobre', 'cobramos', 'ingrese', 'recibi', 'vendi', 'facture', 'deposite',
  'devolvieron', 'depositaron', 'transfirieron', 'pagaron', 'reintegraron', 'mandaron',
  'transferi', 'transfiero', 'movi', 'pase',
];

/** Verbs that carry the description themselves: "ayer cené 18.500" is a dinner. */
const VERB_MEANINGS: Record<string, string> = {
  cene: 'Cena',
  almorce: 'Almuerzo',
  desayune: 'Desayuno',
  merende: 'Merienda',
  cargue: 'Carga de combustible',
};

const STOPWORDS = new Set([
  'en', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'por', 'para', 'a', 'al',
  'que', 'y', 'con', 'mi', 'me', 'se', 'lo', 'le', 'su', 'sus', 'este', 'esta', 'esto', 'ese', 'eso',
  'pesos', 'peso', 'mangos', 'dolares', 'dolar', 'usd', 'ars', 'euros', 'euro', 'eur', 'plata',
  'aprox', 'aproximadamente', 'como', 'unos', 'algo',
]);

const PAYMENT_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\befectivo\b|\bcash\b/, label: 'Efectivo' },
  { re: /\bdebito\b|tarjeta de debito/, label: 'Débito' },
  { re: /\bcredito\b|tarjeta de credito|en cuotas/, label: 'Crédito' },
  { re: /\bmercado ?pago\b|\bmp\b/, label: 'Mercado Pago' },
  { re: /\bmodo\b|\buala\b|\bbrubank\b|billetera/, label: 'Billetera virtual' },
  { re: /\btransferencia\b|\bcbu\b|\balias\b/, label: 'Transferencia' },
  { re: /\btarjeta\b/, label: 'Tarjeta' },
  { re: /\bqr\b/, label: 'QR' },
];

/**
 * Los intereses que uno PAGA y los que uno COBRA se dicen igual.
 * Sin más contexto gana «los cobré»: en una app de gastos, el interés que se
 * paga suele venir adentro del resumen de la tarjeta y no se carga suelto,
 * mientras que el rendimiento de la caja de ahorro o de Reservas sí.
 */
const INTEREST_PAID_RE = /\btarjeta\b|\bvisa\b|\bmaster ?card\b|\bamex\b|\bprestamo\b|\bpunitorio/;
const INTEREST_EARNED_RE =
  /\bintereses?\b|\brendimientos?\b|\bdividendos?\b|\brenta\b|\bplazo fijo\b|\bmoney market\b/;

const TYPE_PATTERNS: { type: TransactionType; re: RegExp }[] = [
  { type: 'refund', re: /\bme devolvieron\b|\breintegro\b|\bdevolucion\b|\breembolso\b|\bcashback\b|\bme reintegraron\b/ },
  { type: 'income', re: /\bcobre\b|\bcobramos\b|\bme pagaron\b|\bme depositaron\b|\bme transfirieron\b|\bme pasaron\b|\bingrese\b|\brecibi\b|\bvendi\b|\bfacture\b|\bentro\b|\bsueldo\b|\baguinaldo\b|\bingreso de\b/ },
  { type: 'transfer', re: /\btransferi\b|\btransfiero\b|\bmovi\b|\bpase\b.*\b(a|hacia)\b|\bde mi cuenta a\b|\ba mi (caja de )?ahorro\b|\bal ahorro\b/ },
  { type: 'adjustment', re: /\bajuste\b|\bcorreccion de saldo\b|\bsaldo inicial\b/ },
  { type: 'expense', re: /\bgaste\b|\bcompre\b|\bpague\b|\babone\b|\bcargue\b|\bme salio\b|\bcosto\b|\bsalio\b/ },
];

/**
 * Turns "ayer cargué nafta 35 mil" into structured data, with no network call.
 *
 * This runs before (and as a safety net under) any AI provider: it is deterministic,
 * testable and instant, so the common cases never depend on a model being reachable.
 */
export function parseIntent(input: string, ctx: ParseContext = {}): ParsedIntent {
  const today = ctx.today ?? new Date();
  const baseCurrency = ctx.baseCurrency ?? 'ARS';
  const raw = input.trim();

  const prepared = raw.replace(/€/g, ' eur ').replace(/u\$s|us\$/gi, ' usd ');
  const normalized = normalizeForParsing(prepared);

  if (!normalized) {
    return emptyIntent(raw, baseCurrency, today);
  }

  // 1. Currency — an explicit mention always wins over the account default.
  const currencyInfo = detectCurrency(normalized, baseCurrency);

  // 2. Date first, so "12/08" or "el 5 de agosto" never gets read as an amount.
  const dateMatch = findDate(normalized, today);
  const withoutDate = dateMatch
    ? `${normalized.slice(0, dateMatch.start)} ${normalized.slice(dateMatch.end)}`
    : normalized;

  // 3. ¿Es un cambio de moneda? Se resuelve antes que nada porque «compré 100
  // dólares» no tiene comercio, ni categoría, ni nada más que interpretar.
  const exchange = findExchange(withoutDate, baseCurrency);
  if (exchange) {
    return exchangeIntent(exchange, {
      raw,
      baseCurrency,
      date: dateMatch?.date ?? format(today, 'yyyy-MM-dd'),
      dateExplicit: Boolean(dateMatch),
    });
  }

  // 4. ¿Es el pago del resumen de la tarjeta? Los consumos ya se cargaron uno
  // por uno: si esto entrara como gasto, el mes quedaría contado dos veces.
  const cardPayment = findCardPayment(withoutDate);

  // 5. Merchant
  const merchantMatch = findMerchant(withoutDate);

  // 6. Amount
  const digitCandidates = findAmountCandidates(withoutDate).filter(
    (c) => !merchantMatch || c.end <= merchantMatch.start || c.start >= merchantMatch.end,
  );
  const best: AmountCandidate | null = pickBestAmount(digitCandidates) ?? findWordAmount(withoutDate);

  const distinctValues = Array.from(new Set(digitCandidates.map((c) => c.value)));
  const ambiguousAmount =
    distinctValues.length > 1 &&
    !digitCandidates.some((c) => c.hadSymbol || c.hadMultiplier || c.hadCurrencyWord) &&
    Math.max(...distinctValues) / Math.min(...distinctValues.filter((v) => v > 0)) < 5;

  // 7. Type
  const type = cardPayment ? 'transfer' : detectType(normalized);
  const typeExplicit =
    Boolean(cardPayment) ||
    TYPE_PATTERNS.some((p) => p.re.test(normalized)) ||
    (INTEREST_EARNED_RE.test(normalized) && !INTEREST_PAID_RE.test(normalized));

  // 8. Payment method. Al resumen no se lo paga con la propia tarjeta.
  const paymentMethod = cardPayment ? null : PAYMENT_PATTERNS.find((p) => p.re.test(normalized))?.label ?? null;

  // 9. Description — what's left once the machine-readable bits are removed.
  const description = cardPayment
    ? describeCardPayment(cardPayment)
    : buildDescription(withoutDate, best, merchantMatch?.alias ?? null, merchantMatch?.name ?? null) ||
      verbMeaning(normalized);

  const missing: ParsedField[] = [];
  if (best === null || !Number.isFinite(best.value) || best.value <= 0) missing.push('amount');
  const finalDescription = description || defaultDescription(type);
  if (!description && type === 'expense') missing.push('description');

  const amount = best ? round(best.value, 2) : null;

  let confidence = 0.35;
  if (amount) confidence += 0.3;
  if (description) confidence += 0.12;
  if (dateMatch) confidence += 0.08;
  if (merchantMatch) confidence += 0.08;
  if (currencyInfo.explicit) confidence += 0.06;
  if (typeExplicit) confidence += 0.05;
  if (!amount) confidence = Math.min(confidence, 0.3);
  if (ambiguousAmount) confidence = Math.min(confidence, 0.6);

  return {
    type,
    amount,
    currency: currencyInfo.currency,
    currency_explicit: currencyInfo.explicit,
    date: dateMatch?.date ?? format(today, 'yyyy-MM-dd'),
    date_explicit: Boolean(dateMatch),
    description: finalDescription,
    merchant: merchantMatch?.name ?? null,
    payment_method: paymentMethod,
    card_payment: Boolean(cardPayment),
    confidence: round(clamp(confidence, 0.05, 0.97), 2),
    missing,
    question: buildQuestion({ missing, amount, currency: currencyInfo.currency, type, ambiguousAmount, values: distinctValues }),
    amount_candidates: ambiguousAmount ? distinctValues.sort((a, b) => b - a) : undefined,
    raw_input: raw,
    engine: 'rules',
  };
}

/**
 * Like `normalizeText`, but keeps `/` and `-` so `12/08` survives as a date.
 */
function normalizeForParsing(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s$.,/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Un cambio de moneda ya viene resuelto: importe, moneda y para qué lado. Lo
 * único que puede faltar es la cotización, y esa la pone la app con la que
 * tenga configurada.
 */
function exchangeIntent(
  exchange: ExchangeMatch,
  ctx: { raw: string; baseCurrency: CurrencyCode; date: string; dateExplicit: boolean },
): ParsedIntent {
  return {
    type: 'transfer',
    amount: exchange.amount,
    currency: exchange.currency,
    currency_explicit: true,
    date: ctx.date,
    date_explicit: ctx.dateExplicit,
    description: describeExchange(exchange.kind, exchange.currency),
    merchant: null,
    payment_method: null,
    exchange_kind: exchange.kind,
    exchange_rate: exchange.rate,
    // No queda nada por adivinar; con la cotización dicha, menos todavía.
    confidence: exchange.rate ? 0.95 : 0.9,
    missing: [],
    raw_input: ctx.raw,
    engine: 'rules',
  };
}

function emptyIntent(raw: string, currency: CurrencyCode, today: Date): ParsedIntent {
  return {
    type: 'unknown',
    amount: null,
    currency,
    currency_explicit: false,
    date: format(today, 'yyyy-MM-dd'),
    date_explicit: false,
    description: '',
    merchant: null,
    payment_method: null,
    confidence: 0,
    missing: ['amount', 'description', 'type'],
    question: 'Contame qué hiciste con tu plata. Por ejemplo: «super 45 lucas» o «ayer cené 18.500».',
    raw_input: raw,
    engine: 'rules',
  };
}

function verbMeaning(normalized: string): string {
  const hit = Object.keys(VERB_MEANINGS).find((verb) => new RegExp(`\\b${verb}\\b`).test(normalized));
  return hit ? VERB_MEANINGS[hit] : '';
}

function detectCurrency(normalized: string, baseCurrency: CurrencyCode): { currency: CurrencyCode; explicit: boolean } {
  if (/\b(usd|dolares|dolar|verdes|dolar blue)\b/.test(normalized)) return { currency: 'USD', explicit: true };
  if (/\b(eur|euros?)\b/.test(normalized)) return { currency: 'EUR', explicit: true };
  if (/\b(ars|pesos|mangos)\b/.test(normalized)) return { currency: 'ARS', explicit: true };
  return { currency: baseCurrency, explicit: false };
}

function detectType(normalized: string): TransactionType {
  // Un rendimiento cobrado entra antes que la regla general de gasto, pero
  // después de que se nombre una tarjeta o un préstamo: ahí se está pagando.
  if (INTEREST_EARNED_RE.test(normalized) && !INTEREST_PAID_RE.test(normalized)) return 'income';

  for (const pattern of TYPE_PATTERNS) {
    if (pattern.re.test(normalized)) return pattern.type;
  }
  return 'expense';
}

function defaultDescription(type: TransactionType): string {
  switch (type) {
    case 'income':
      return 'Ingreso';
    case 'refund':
      return 'Reintegro';
    case 'transfer':
      return 'Transferencia';
    case 'adjustment':
      return 'Ajuste';
    default:
      return '';
  }
}

function buildDescription(
  text: string,
  amount: AmountCandidate | null,
  merchantAlias: string | null,
  merchantName: string | null,
): string {
  let working = text;
  if (amount) working = `${working.slice(0, amount.start)} ${working.slice(amount.end)}`;
  // Strip leftover amounts so "2 pizzas 6400" doesn't keep a stray "6400".
  working = working.replace(/\$?\s?\d[\d.,]*\s?(k|mil(es)?|lucas?|palos?|millones?)?/gi, ' ');

  let tokens = working
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !VERBS.includes(t));

  // Drop filler words only at the edges — "cuota del gym" should stay readable.
  while (tokens.length && STOPWORDS.has(tokens[0])) tokens.shift();
  while (tokens.length && STOPWORDS.has(tokens[tokens.length - 1])) tokens.pop();

  let phrase = tokens.join(' ').replace(/\s+/g, ' ').trim();
  if (!phrase && merchantName) return merchantName;
  if (!phrase) return '';

  if (merchantAlias && merchantName) {
    phrase = phrase.replace(merchantAlias, merchantName);
  }
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function buildQuestion(args: {
  missing: ParsedField[];
  amount: number | null;
  currency: CurrencyCode;
  type: TransactionType;
  ambiguousAmount: boolean;
  values: number[];
}): string | undefined {
  const { missing, amount, currency, type, ambiguousAmount, values } = args;

  if (missing.includes('amount')) {
    return type === 'income'
      ? 'Detecté un ingreso pero no el importe. ¿Cuánto entró?'
      : 'No pude detectar el importe. ¿Cuánto fue el gasto?';
  }
  if (missing.includes('description') && amount) {
    return `Detecté un gasto de ${formatMoney(amount, { currency })}, pero no pude identificar en qué. ¿Querés guardarlo como «Otros» o agregar una descripción?`;
  }
  if (ambiguousAmount && values.length > 1) {
    const list = values
      .slice(0, 3)
      .map((v) => formatMoney(v, { currency }))
      .join(' o ');
    return `Detecté más de un importe posible (${list}). ¿Cuál corresponde?`;
  }
  return undefined;
}
