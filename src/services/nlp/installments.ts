/**
 * Compras en cuotas.
 *
 * Comprar en seis cuotas no es gastar todo hoy: es deber seis veces. Acá se
 * detecta el plan; el gasto se parte en un movimiento por mes más adelante.
 *
 * También hay que poder cargar cuotas que ya arrancaron, porque nadie empieza a
 * usar una app de gastos con la vida en cero: uno llega con la heladera en la 3
 * de 12.
 */

const WORD_COUNTS: Record<string, number> = {
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, quince: 15, dieciocho: 18, veinticuatro: 24,
};

const COUNT = `(\\d{1,3}|${Object.keys(WORD_COUNTS).join('|')})`;

/** «cuota 3 de 12», que dice de una las dos cosas. */
const NUMBERED_RE = new RegExp(`\\bcuota\\s+${COUNT}\\s+de\\s+${COUNT}\\b`);
/** «en 6 cuotas», «6 cuotas», «6 pagos». */
const PLAN_RE = new RegExp(`\\b(?:en\\s+)?${COUNT}\\s*(?:cuotas?|pagos)\\b`);
/** «6 cuotas de 20 lucas»: el importe que sigue es el de cada cuota. */
const PER_INSTALLMENT_RE = new RegExp(`\\b${COUNT}\\s*(?:cuotas?|pagos)\\s+de\\s+\\$?\\s?\\d`);
/** Cuotas que ya venían corriendo. */
const GOING_RE = /\bvoy por la\s+(\d{1,3})\b|\bva por la\s+(\d{1,3})\b/;
const REMAINING_RE = /\bme quedan\s+(\d{1,3})\s*(?:cuotas?|pagos)\b/;

export interface InstallmentMatch {
  /** Cuántas cuotas tiene el plan completo. */
  count: number;
  /** Desde qué cuota hay que cargar: 1 si la compra es de ahora. */
  from: number;
  /** Si el importe detectado es el precio total en vez del de cada cuota. */
  amountIsTotal: boolean;
  /** El texto sin la parte de las cuotas, para que sus números no compitan por ser el importe. */
  rest: string;
}

const toNumber = (value: string): number => WORD_COUNTS[value] ?? Number(value);

/** `text` ya viene normalizado y sin la fecha. */
export function findInstallments(text: string): InstallmentMatch | null {
  if (!/\bcuotas?\b|\bpagos\b/.test(text)) return null;

  let rest = text;
  let count = 0;
  let from = 1;

  const strip = (match: RegExpExecArray | null) => {
    if (!match) return;
    rest = `${rest.slice(0, match.index)} ${rest.slice(match.index + match[0].length)}`;
  };

  // «cuota 3 de 12» resuelve las dos cosas de una.
  const numbered = NUMBERED_RE.exec(rest);
  if (numbered) {
    from = toNumber(numbered[1]);
    count = toNumber(numbered[2]);
    strip(numbered);
  }

  const perInstallment = PER_INSTALLMENT_RE.test(rest);

  if (!count) {
    const plan = PLAN_RE.exec(rest);
    if (!plan) return null;
    count = toNumber(plan[1]);
    // De «6 cuotas de 20 lucas» sólo se saca «6 cuotas»: el importe que sigue
    // es el dato principal y tiene que sobrevivir.
    strip(plan);
  }

  const going = GOING_RE.exec(rest);
  if (going) {
    from = Number(going[1] ?? going[2]);
    strip(going);
  } else {
    const remaining = REMAINING_RE.exec(rest);
    if (remaining) {
      from = count - Number(remaining[1]) + 1;
      strip(remaining);
    }
  }

  if (!Number.isFinite(count) || count < 2 || count > 120) return null;
  if (!Number.isFinite(from) || from < 1 || from > count) from = 1;

  return {
    count,
    from,
    // Si dijeron «6 cuotas de X», X es cada cuota. Si dijeron «120 lucas en 6
    // cuotas», el importe es el total y hay que dividirlo.
    amountIsTotal: !perInstallment && !numbered,
    rest: rest.replace(/\s+/g, ' ').trim(),
  };
}
