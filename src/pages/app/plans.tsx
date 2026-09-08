import * as React from 'react';
import { Check, Sparkles } from 'lucide-react';
import { PLANS } from '@/constants/plans';
import type { PlanCode } from '@/constants/plans';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { cn } from '@/lib/utils';
import { isDemoBackend } from '@/services/data';
import { startCheckout } from '@/services/billing/checkout';
import { usePlan } from '@/hooks/use-plan';
import { useWorkspace } from '@/providers/workspace-provider';
import { toAppError } from '@/hooks/use-async';
import type { AppError } from '@/types/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ErrorNote } from '@/components/finance/error-note';
import { UsageMeter } from '@/components/billing/usage-meter';

export default function PlansPage() {
  const { plan, subscription } = usePlan();
  const { client, userId, refreshPlan } = useWorkspace();
  const [error, setError] = React.useState<AppError | null>(null);
  const [pending, setPending] = React.useState<PlanCode | null>(null);

  const choose = async (code: PlanCode) => {
    setError(null);
    setPending(code);
    try {
      // En modo demo se cambia en el momento, para poder ver cómo se comporta cada plan.
      if (isDemoBackend() && client.setDemoPlan) {
        await client.setDemoPlan(userId, code);
        await refreshPlan();
        return;
      }
      const session = await startCheckout(code);
      window.location.href = session.url;
    } catch (caught) {
      setError(toAppError(caught));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Planes</h1>
        <p className="text-sm text-muted-foreground">
          Estás en el plan <strong>{plan.name}</strong>
          {subscription?.current_period_end
            ? ` · se renueva el ${formatDate(subscription.current_period_end.slice(0, 10))}`
            : ''}
          .
        </p>
      </header>

      {error ? <ErrorNote error={error} /> : null}

      {isDemoBackend() ? (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-sm">
          Modo demo: cambiar de plan acá no cobra nada, sirve para ver cómo se comporta la app con cada uno.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((item) => {
          const current = item.code === plan.code;
          return (
            <Card
              key={item.code}
              className={cn('flex flex-col p-5', item.featured && !current && 'ring-2 ring-primary/40')}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{item.name}</p>
                {current ? (
                  <Badge variant="success">Tu plan</Badge>
                ) : item.featured ? (
                  <Badge>Más elegido</Badge>
                ) : null}
              </div>

              <p className="mt-1 text-xs text-muted-foreground">{item.tagline}</p>

              <p className="num mt-4 text-2xl font-semibold">
                {item.price === 0 ? 'Gratis' : formatMoney(item.price, { currency: item.currency })}
                {item.price > 0 ? <span className="text-sm font-normal text-muted-foreground"> /mes</span> : null}
              </p>

              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {item.highlights.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="mt-5 w-full"
                variant={current ? 'outline' : item.featured ? 'default' : 'secondary'}
                disabled={current}
                loading={pending === item.code}
                onClick={() => void choose(item.code)}
              >
                {current ? (
                  'Plan actual'
                ) : item.price === 0 ? (
                  'Cambiar a Gratis'
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Elegir {item.name}
                  </>
                )}
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="p-5">
        <p className="font-medium">Tu uso de este mes</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <UsageMeter feature="transactions_per_month" label="Movimientos" />
          <UsageMeter feature="receipts_per_month" label="Tickets por foto" />
          <UsageMeter feature="ai_queries_per_month" label="Consultas con IA" />
          <UsageMeter feature="budgets" label="Límites de gasto" />
          <UsageMeter feature="goals" label="Metas de ahorro" />
          <UsageMeter feature="household_members" label="Integrantes del hogar" />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Los cupos se renuevan el primero de cada mes. Los datos que ya cargaste no se borran ni se
          ocultan si bajás de plan: sólo dejás de poder agregar más.
        </p>
      </Card>
    </div>
  );
}
