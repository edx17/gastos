import { CreditCard } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { humanDate } from '@/lib/date';
import type { CurrencyCode } from '@/types/currency';
import type { PendingInstallment } from '@/types/report';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Lo que ya está comprado y todavía hay que pagar.
 *
 * No es una deuda que se descuente hoy —cada cuota pesa el mes que vence— pero
 * conviene tenerlo a la vista antes de comprar la próxima cosa en doce pagos.
 */
export function InstallmentsCard({
  plans,
  currency,
}: {
  plans: PendingInstallment[];
  currency: CurrencyCode;
}) {
  if (!plans.length) return null;

  const total = plans.reduce((acc, plan) => acc + plan.pending_amount, 0);
  const nextMonth = plans.filter((plan) => plan.next_date).slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          Cuotas por pagar
        </CardTitle>
        <CardDescription>
          Ya lo compraste; falta pagarlo. Cada cuota entra como gasto el mes que vence, no hoy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="num text-2xl font-semibold tracking-tight">{formatMoney(total, { currency })}</p>

        <div className="space-y-2">
          {nextMonth.map((plan) => (
            <div key={plan.installment_id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                {plan.description}
                <span className="text-xs text-muted-foreground">
                  {' '}
                  · quedan {plan.pending_count} de {plan.installment_count}
                </span>
              </span>
              <span className="num shrink-0 text-sm">
                {formatMoney(plan.pending_amount, { currency })}
                {plan.next_date ? (
                  <span className="text-xs text-muted-foreground"> · {humanDate(plan.next_date)}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
