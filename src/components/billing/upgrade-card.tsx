import { Link } from 'react-router-dom';
import { Lock, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import { usePlan } from '@/hooks/use-plan';
import type { PlanLimits } from '@/constants/plans';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * Lo que ve alguien cuando su plan no llega. Dice qué falta, cuál es el plan más
 * barato que lo incluye y cuánto sale — sin vueltas ni cuenta regresiva.
 */
export function UpgradeCard({
  feature,
  title,
  description,
  icon: Icon = Lock,
  className,
}: {
  feature: keyof PlanLimits;
  title: string;
  description: string;
  icon?: LucideIcon;
  className?: string;
}) {
  const { upgradeFor, plan } = usePlan();
  const target = upgradeFor(feature);

  return (
    <Card className={cn('flex flex-col items-center gap-3 p-8 text-center', className)}>
      <span className="clay-sm flex h-14 w-14 items-center justify-center rounded-full bg-accent">
        <Icon className="h-6 w-6 text-accent-foreground" />
      </span>
      <div>
        <p className="text-base font-medium">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      </div>

      {target && target.code !== plan.code ? (
        <>
          <p className="text-sm">
            Se incluye en el plan <strong>{target.name}</strong>, {formatMoney(target.price, { currency: target.currency })} por mes.
          </p>
          <Link to="/app/plans" className={buttonVariants()}>
            <Sparkles className="h-4 w-4" />
            Ver planes
          </Link>
        </>
      ) : null}
    </Card>
  );
}

/** Aviso liviano en línea, para cuando queda poco cupo pero todavía se puede usar. */
export function QuotaNotice({ feature, label }: { feature: keyof PlanLimits; label: string }) {
  const { quota, isFree } = usePlan();
  const state = quota(feature);

  if (state.limit === null || !state.nearLimit) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm">
      <span>
        Te quedan <strong>{state.remaining}</strong> {label} de este mes.
      </span>
      {isFree ? (
        <Link to="/app/plans" className="font-medium text-primary hover:underline">
          Ver planes
        </Link>
      ) : null}
    </div>
  );
}
