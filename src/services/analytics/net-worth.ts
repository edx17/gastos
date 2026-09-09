import { round } from '@/lib/utils';
import type { Account, AccountDelta } from '@/types/transaction';

/**
 * El total de lo que hay, pasado a la moneda base.
 *
 * Vive acá y no en cada pantalla para que el inicio y la pantalla de Cuentas no
 * puedan dar números distintos. Las cuentas marcadas para no sumar quedan
 * afuera; las deudas suman con su signo, que es negativo.
 */
export function netWorth(
  accounts: Account[],
  rates: Record<string, number>,
  deltas: AccountDelta[] = [],
): number {
  const drift = new Map(deltas.map((row) => [row.account_id, row.delta]));
  return round(
    accounts
      .filter((account) => account.is_active && account.include_in_net_worth)
      .reduce((acc, account) => acc + estimatedBalance(account, drift.get(account.id)) * (rates[account.currency] ?? 1), 0),
    2,
  );
}

/**
 * El saldo declarado más lo que se movió desde entonces.
 *
 * Sin movimientos linkeados el estimado es el declarado, que es exactamente lo
 * que la persona dijo: la función no inventa nada cuando no hay datos.
 */
export function estimatedBalance(account: Account, delta: number | undefined): number {
  return round(account.balance + (delta ?? 0), 2);
}
