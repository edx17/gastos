/**
 * Compra y venta de moneda extranjera.
 *
 * «Compré 100 dólares a 1450» no es un gasto: la plata no se consume, cambia de
 * moneda. Se detecta acá, aparte del resto del parser, porque hay que estar
 * seguro: si en la frase quedó cualquier otra cosa ("compré 100 dólares de
 * nafta"), no es un cambio de moneda y conviene dejarlo pasar como gasto.
 */

import { round } from '@/lib/utils';
import { parseNumericLiteral } from '@/lib/money';
import type { CurrencyCode } from '@/types/currency';
import type { ExchangeKind } from '@/types/transaction';
import { findAmountCandidates, findWordAmount, pickBestAmount } from './numbers';

export interface ExchangeMatch {
  kind: ExchangeKind;
  currency: CurrencyCode;
  amount: number;
  /** La cotización, sólo si la persona la dijo. */
  rate: number | null;
}

const VERBS: { kind: ExchangeKind; re: RegExp }[] = [
  { kind: 'buy', re: /\b(compre|compro|compramos|compra|adquiri|adquiero)\b/ },
  { kind: 'sell', re: /\b(vendi|vendo|vendimos|venta|liquide|liquido)\b/ },
];

const CURRENCIES: { currency: CurrencyCode; re: RegExp; noun: string }[] = [
  { currency: 'USD', re: /\b(usd|dolares|dolar|verdes|verde)\b/, noun: 'dólares' },
  { currency: 'EUR', re: /\b(eur|euros|euro)\b/, noun: 'euros' },
];

/** «a 1450», «al 1.450», «a $1450», «cotización 1450». */
const RATE_RE = /\b(?:a|al|a razon de|cotizacion|cotizado a|precio)\s+\$?\s?(\d[\d.,]*)\b/;

/**
 * Palabras que pueden sobrar sin cambiar el sentido. Todo lo demás que quede en
 * la frase significa que no era una compra de moneda a secas.
 */
const FILLER = new Set([
  'me', 'nos', 'se', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'en', 'por', 'para', 'con', 'a', 'al', 'mi', 'mis', 'hoy', 'blue', 'oficial', 'mep',
  'ccl', 'billete', 'billetes', 'cara', 'caras', 'chica', 'chicas', 'aprox', 'aproximadamente',
]);

/** El nombre en castellano de la moneda, para armar la descripción. */
export function currencyNoun(currency: CurrencyCode): string {
  return CURRENCIES.find((c) => c.currency === currency)?.noun ?? currency;
}

export function describeExchange(kind: ExchangeKind, currency: CurrencyCode): string {
  return `${kind === 'buy' ? 'Compra' : 'Venta'} de ${currencyNoun(currency)}`;
}

/**
 * Devuelve el cambio de moneda si la frase es exactamente eso, o null.
 *
 * `text` ya viene normalizado y sin la fecha.
 */
export function findExchange(text: string, baseCurrency: CurrencyCode): ExchangeMatch | null {
  const verb = VERBS.find((v) => v.re.test(text));
  if (!verb) return null;

  const money = CURRENCIES.find((c) => c.re.test(text));
  // Comprar la propia moneda no es un cambio: es no haber dicho nada.
  if (!money || money.currency === baseCurrency) return null;

  // La cotización sale primero: así su número no compite por ser el importe.
  let rest = text;
  let rate: number | null = null;
  const rateMatch = RATE_RE.exec(rest);
  if (rateMatch) {
    const value = parseNumericLiteral(rateMatch[1]);
    if (value !== null && value > 0) {
      rate = round(value, 2);
      rest = `${rest.slice(0, rateMatch.index)} ${rest.slice(rateMatch.index + rateMatch[0].length)}`;
    }
  }

  const candidates = findAmountCandidates(rest);
  const best = pickBestAmount(candidates) ?? findWordAmount(rest);
  if (!best || !Number.isFinite(best.value) || best.value <= 0) return null;

  const leftovers = `${rest.slice(0, best.start)} ${rest.slice(best.end)}`
    .replace(verb.re, ' ')
    .replace(money.re, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !FILLER.has(token));

  // Quedó algo más en la frase: era un gasto en moneda extranjera, no un cambio.
  if (leftovers.length) return null;

  return { kind: verb.kind, currency: money.currency, amount: round(best.value, 2), rate };
}
