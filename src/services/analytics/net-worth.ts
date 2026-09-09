import { round } from '@/lib/utils';
import type { Account } from '@/types/transaction';

/**
 * El total de lo que hay, pasado a la moneda base.
 *
 * Vive acá y no en cada pantalla para que el inicio y la pantalla de Cuentas no
 * puedan dar números distintos. Las cuentas marcadas para no sumar quedan
 * afuera; las deudas suman con su signo, que es negativo.
 */
export function netWorth(accounts: Account[], rates: Record<string, number>): number {
  return round(
    accounts
      .filter((account) => account.is_active && account.include_in_net_worth)
      .reduce((acc, account) => acc + account.balance * (rates[account.currency] ?? 1), 0),
    2,
  );
}
