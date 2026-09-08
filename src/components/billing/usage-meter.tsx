import { cn } from '@/lib/utils';
import { usePlan } from '@/hooks/use-plan';
import type { PlanLimits } from '@/constants/plans';
import { Progress } from '@/components/ui/progress';

/** Barra de uso del mes para un cupo del plan. */
export function UsageMeter({
  feature,
  label,
  className,
}: {
  feature: keyof PlanLimits;
  label: string;
  className?: string;
}) {
  const { quota } = usePlan();
  const state = quota(feature);

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="num text-muted-foreground">
          {state.limit === null ? (
            <span className="text-success">Sin límite</span>
          ) : state.limit === 0 ? (
            'No incluido'
          ) : (
            `${state.used} / ${state.limit}`
          )}
        </span>
      </div>
      {state.limit !== null && state.limit > 0 ? (
        <Progress
          value={(state.used / state.limit) * 100}
          label={label}
          indicatorClassName={state.exhausted ? 'bg-destructive' : state.nearLimit ? 'bg-warning' : undefined}
        />
      ) : null}
    </div>
  );
}
