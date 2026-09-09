/**
 * Cuánto se movió cada cuenta desde el día en que se declaró su saldo.
 *
 * El saldo declarado es el ancla y no se pisa: la persona dice cuánto tiene y
 * cuándo, y a partir de ahí esto suma lo que pasó. Cuando el estimado se aleja
 * de la realidad, se vuelve a declarar el saldo y el ancla se corre.
 *
 * Reglas, las mismas que aplica la base:
 *   · Sale lo que se gastó y lo que se usó para comprar moneda.
 *   · Entra lo que se cobró y lo que se recuperó vendiendo.
 *   · Una tarjeta de crédito no descuenta al comprar: se paga el resumen.
 *   · Lo que todavía no venció no se cuenta.
 */

import { round } from '@/lib/utils';
import type { ISODate } from '@/types/common';
import type { Account, AccountDelta, PaymentMethod, Transaction } from '@/types/transaction';

export function accountDeltas(
  accounts: Account[],
  paymentMethods: PaymentMethod[],
  rows: Transaction[],
  until: ISODate,
): AccountDelta[] {
  // Sólo los medios de pago que descuentan al usarlos.
  const accountOf = new Map<string, string>();
  for (const method of paymentMethods) {
    if (method.account_id && method.kind !== 'credit') accountOf.set(method.id, method.account_id);
  }

  const byAccount = new Map<string, { delta: number; movements: number }>();
  for (const account of accounts) byAccount.set(account.id, { delta: 0, movements: 0 });

  for (const row of rows) {
    const accountId = row.payment_method_id ? accountOf.get(row.payment_method_id) : undefined;
    if (!accountId) continue;

    const account = accounts.find((item) => item.id === accountId);
    const bucket = byAccount.get(accountId);
    if (!account || !bucket) continue;

    const anchor = account.balance_updated_at ?? account.created_at.slice(0, 10);
    if (row.transaction_date > until) continue;
    // Del día en que se declaró el saldo entra sólo lo que se cargó después:
    // lo anterior ya estaba reflejado en el número que la persona dio.
    if (row.transaction_date < anchor) continue;
    if (row.transaction_date === anchor) {
      const declaredAt = account.balance_declared_at ?? account.created_at;
      if (row.created_at <= declaredAt) continue;
    }

    const sign =
      row.type === 'income' || row.type === 'refund' || row.exchange_kind === 'sell'
        ? 1
        : row.type === 'expense' || row.exchange_kind === 'buy'
          ? -1
          : 0;
    if (sign === 0) continue;

    // Si la moneda coincide se usa el importe tal cual; convertir dos veces
    // sólo agrega error.
    bucket.delta += sign * (row.currency === account.currency ? row.amount : row.base_amount);
    bucket.movements += 1;
  }

  return [...byAccount.entries()].map(([account_id, bucket]) => ({
    account_id,
    delta: round(bucket.delta, 2),
    movements: bucket.movements,
  }));
}
