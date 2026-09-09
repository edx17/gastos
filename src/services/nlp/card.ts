/**
 * Pago del resumen de la tarjeta.
 *
 * Es el error más fácil de cometer en una app de gastos: los consumos ya se
 * cargaron uno por uno el día que se compraron, así que si el pago del resumen
 * también entra como gasto, el mes queda contado dos veces. Pagar la tarjeta no
 * consume plata nueva: cancela una deuda que ya está registrada. Por eso es una
 * transferencia.
 */

const ISSUERS: { re: RegExp; name: string }[] = [
  { re: /\bvisa\b/, name: 'Visa' },
  { re: /\bmaster ?card\b|\bmaster\b/, name: 'Mastercard' },
  { re: /\bamex\b|\bamerican express\b/, name: 'Amex' },
  { re: /\bnaranja\b/, name: 'Naranja' },
  { re: /\bcabal\b/, name: 'Cabal' },
];

/**
 * Pide que la tarjeta sea lo que se paga, no con qué se paga: después del verbo
 * sólo se aceptan artículos y las palabras «resumen», «cierre» o «vencimiento».
 * Así «pagué el super con tarjeta» no entra acá.
 */
const CARD_PAYMENT_RE =
  /\b(?:pague|pagué|pago|pagamos|abone|salde|cancele)\b\s*(?:el|la|los|las|mi|mis)?\s*(?:resumen|cierre|vencimiento)?\s*(?:de\s*)?(?:la|el|mi)?\s*\b(tarjeta(?:\s+de\s+credito)?|visa|master ?card|master|amex|american express|naranja|cabal)\b/;

export interface CardPaymentMatch {
  /** El banco o la marca, cuando la persona la nombró. */
  issuer: string | null;
}

export function findCardPayment(text: string): CardPaymentMatch | null {
  if (!CARD_PAYMENT_RE.test(text)) return null;
  return { issuer: ISSUERS.find((issuer) => issuer.re.test(text))?.name ?? null };
}

export function describeCardPayment(match: CardPaymentMatch): string {
  return match.issuer ? `Pago de ${match.issuer}` : 'Pago de tarjeta';
}
