/**
 * Una compra en cuotas se guarda como un gasto por mes, no como uno solo.
 *
 * Así cada mes muestra lo que realmente pesa ese mes, el resumen de la tarjeta
 * cierra, y los límites y los reportes funcionan sin saber nada de cuotas.
 *
 * La expansión vive acá y no adentro de cada cliente para que la base y el
 * navegador generen exactamente las mismas filas.
 */

import { addMonths, fromISO, toISO } from '@/lib/date';
import { uid } from '@/lib/utils';
import type { ISODate } from '@/types/common';
import type { InstallmentPlan } from '@/types/transaction';

export interface InstallmentRow {
  transaction_date: ISODate;
  installment_id: string;
  installment_number: number;
  installment_count: number;
}

/**
 * Las filas de un plan, de la cuota `from` a la última.
 *
 * `firstDate` es cuándo vence la cuota `from`, no cuándo se hizo la compra: si
 * alguien llega con la heladera en la 3 de 12, la 3 vence ahora y las nueve que
 * faltan van cayendo mes a mes. Las anteriores no se inventan — son meses que
 * la persona no registró.
 */
export function expandInstallments(plan: InstallmentPlan, firstDate: ISODate): InstallmentRow[] {
  const count = Math.trunc(plan.count);
  const from = Math.trunc(plan.from ?? 1);

  if (!Number.isFinite(count) || count < 2 || count > 120) {
    throw new Error('Un plan de cuotas va de 2 a 120.');
  }
  if (!Number.isFinite(from) || from < 1 || from > count) {
    throw new Error('La cuota por la que vas tiene que estar dentro del plan.');
  }

  const installment_id = uid();
  const start = fromISO(firstDate);

  return Array.from({ length: count - from + 1 }, (_, offset) => ({
    transaction_date: toISO(addMonths(start, offset)),
    installment_id,
    installment_number: from + offset,
    installment_count: count,
  }));
}
