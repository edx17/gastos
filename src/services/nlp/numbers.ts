/**
 * Spanish/Argentine amount parsing.
 *
 * Handles the way people actually write money here: `3.200`, `3,2k`, `12 lucas`,
 * `35 mil`, `1 palo`, `tres lucas`, `$1.500.000`.
 */

export const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  mil: 1_000,
  miles: 1_000,
  luca: 1_000,
  lucas: 1_000,
  gamba: 100,
  gambas: 100,
  palo: 1_000_000,
  palos: 1_000_000,
  millon: 1_000_000,
  millones: 1_000_000,
  mangos: 1,
  pesos: 1,
};

const UNITS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21,
  veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, treinta: 30,
  cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400,
  quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
  medio: 0.5, media: 0.5,
};

const SCALES: Record<string, number> = { mil: 1_000, millon: 1_000_000, millones: 1_000_000 };

/**
 * Reads a numeric literal the Argentine way: `.` groups thousands, `,` is the decimal
 * separator. A lone dot followed by exactly three digits is a thousands separator
 * (`3.200` = 3200), otherwise it is a decimal point (`3.20` = 3.2).
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

/** `tres lucas`, `dos mil quinientos`, `medio palo` → number. */
export function wordsToNumber(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let matched = false;

  for (const word of words) {
    if (word in UNITS) {
      const unit = UNITS[word];
      current = current === 0 ? unit : current + unit;
      matched = true;
      continue;
    }
    if (word in SCALES) {
      const scale = SCALES[word];
      const base = current === 0 ? 1 : current;
      if (scale === 1_000) {
        current = base * scale;
      } else {
        total += base * scale;
        current = 0;
      }
      matched = true;
      continue;
    }
    if (word in MULTIPLIERS && MULTIPLIERS[word] > 1) {
      const base = current === 0 ? 1 : current;
      total += base * MULTIPLIERS[word];
      current = 0;
      matched = true;
      continue;
    }
    // Any other word ends the number phrase.
    if (matched) break;
  }

  const result = total + current;
  return matched && result > 0 ? result : null;
}

export interface AmountCandidate {
  value: number;
  /** Character range in the normalized text, so the matched text can be stripped. */
  start: number;
  end: number;
  hadSymbol: boolean;
  hadMultiplier: boolean;
  hadCurrencyWord: boolean;
  fromWords: boolean;
}

const NUMBER_RE =
  /(?<symbol>u\$s|us\$|\$|€)?\s?(?<num>\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s?(?<mult>k|mil(?:es)?|lucas?|palos?|millon(?:es)?|gambas?|mangos|pesos|dolares|dolar|usd|euros?|eur)?/gi;

/** Every plausible amount in a phrase, with the signals that make one more likely than another. */
export function findAmountCandidates(text: string): AmountCandidate[] {
  const out: AmountCandidate[] = [];
  NUMBER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = NUMBER_RE.exec(text)) !== null) {
    const groups = match.groups as Record<string, string | undefined>;
    const base = parseNumericLiteral(groups.num ?? '');
    if (base === null) continue;

    const multWord = (groups.mult ?? '').toLowerCase();
    const isCurrencyWord = /^(pesos|dolares|dolar|usd|euros?|eur|mangos)$/.test(multWord);
    const multiplier = !isCurrencyWord && multWord ? MULTIPLIERS[normalizeMultiplier(multWord)] ?? 1 : 1;

    out.push({
      value: base * multiplier,
      start: match.index,
      end: match.index + match[0].length,
      hadSymbol: Boolean(groups.symbol),
      hadMultiplier: multiplier > 1,
      hadCurrencyWord: isCurrencyWord,
      fromWords: false,
    });
  }

  return out;
}

function normalizeMultiplier(word: string): string {
  if (word.startsWith('mil')) return 'mil';
  if (word.startsWith('luca')) return 'lucas';
  if (word.startsWith('palo')) return 'palo';
  if (word.startsWith('millon')) return 'millon';
  if (word.startsWith('gamba')) return 'gamba';
  return word;
}

const WORD_NUMBER_RE = new RegExp(
  `\\b((?:${Object.keys(UNITS).join('|')}|${Object.keys(SCALES).join('|')}|luca|lucas|palo|palos|k)\\s*)+`,
  'gi',
);

/** Fallback for fully written amounts: "tres lucas", "medio palo". */
export function findWordAmount(text: string): AmountCandidate | null {
  WORD_NUMBER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_NUMBER_RE.exec(text)) !== null) {
    const words = match[0].trim().split(/\s+/);
    const value = wordsToNumber(words);
    const hasMultiplier = words.some((w) => (MULTIPLIERS[normalizeMultiplier(w)] ?? 1) > 1 || w in SCALES);
    // A bare "una"/"dos" is a quantity, not money — only accept scaled or large word amounts.
    if (value && value > 0 && (hasMultiplier || value >= 100)) {
      return {
        value,
        start: match.index,
        end: match.index + match[0].length,
        hadSymbol: false,
        hadMultiplier: hasMultiplier,
        hadCurrencyWord: false,
        fromWords: true,
      };
    }
  }
  return null;
}

/**
 * Picks the amount the user meant. An explicit symbol or a "lucas/k" multiplier wins
 * over a bare number (`2 pizzas 6400` → 6400, not 2); ties go to the larger value.
 */
export function pickBestAmount(candidates: AmountCandidate[]): AmountCandidate | null {
  if (!candidates.length) return null;
  const score = (c: AmountCandidate) =>
    (c.hadSymbol ? 100 : 0) + (c.hadMultiplier ? 80 : 0) + (c.hadCurrencyWord ? 60 : 0) + Math.log10(c.value + 1);
  return [...candidates].sort((a, b) => score(b) - score(a) || b.value - a.value)[0];
}
