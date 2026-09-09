import { Link } from 'react-router-dom';
import { ArrowRight, Landmark } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { netWorth } from '@/services/analytics/net-worth';
import type { CurrencyCode } from '@/types/currency';
import type { Account } from '@/types/transaction';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Lo que la persona tiene hoy, y dónde.
 *
 * Es distinto del ahorro del mes y del acumulado, que son flujos: cuánto entró
 * y cuánto salió. Esto es el estado. Va primero en el inicio porque es la
 * pregunta que uno se hace al abrir la app.
 */
export function NetWorthCard({
  accounts,
  rates,
  baseCurrency,
}: {
  accounts: Account[];
  rates: Record<string, number>;
  baseCurrency: CurrencyCode;
}) {
  if (!accounts.length) {
    return (
      <Card>
        <CardContent className="p-2">
          <EmptyState
            icon={Landmark}
            title="Todavía no le dijiste a Crocante cuánto tenés"
            description="Los movimientos cuentan lo que pasa desde que empezaste. Lo que ya tenías —la caja de ahorro, el FIMA, Reservas, los dólares— se carga una sola vez en Cuentas y arranca de ahí."
          />
          <div className="pb-4 text-center">
            <Link to="/app/accounts" className={buttonVariants({ size: 'sm' })}>
              Cargar mis cuentas <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = netWorth(accounts, rates);
  const visible = [...accounts]
    .filter((account) => account.include_in_net_worth)
    .sort((a, b) => Math.abs(b.balance * (rates[b.currency] ?? 1)) - Math.abs(a.balance * (rates[a.currency] ?? 1)))
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" />
            Tenés en total
          </CardTitle>
          <CardDescription>Sumando tus cuentas. Es lo que hay hoy, no lo que ahorraste este mes.</CardDescription>
        </div>
        <Link to="/app/accounts" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          Cuentas <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="num text-3xl font-semibold tracking-tight">{formatMoney(total, { currency: baseCurrency })}</p>

        <div className="space-y-1.5">
          {visible.map((account) => (
            <div key={account.id} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">
                {account.name}
                {account.institution ? <span className="text-xs"> · {account.institution}</span> : null}
              </span>
              <span className="num shrink-0">{formatMoney(account.balance, { currency: account.currency })}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
