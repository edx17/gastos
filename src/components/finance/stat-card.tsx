import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney, formatPercent } from '@/lib/money';
import type { ComparisonMetric } from '@/types/report';
import { Card } from '@/components/ui/card';

export function StatCard({
  label,
  value,
  currency,
  comparison,
  icon: Icon,
  accent,
  hint,
}: {
  label: string;
  value: number;
  currency: string;
  comparison?: ComparisonMetric;
  icon?: LucideIcon;
  accent?: 'income' | 'expense' | 'savings' | 'neutral';
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              accent === 'income' && 'bg-success/12 text-success',
              accent === 'expense' && 'bg-destructive/10 text-destructive',
              accent === 'savings' && 'bg-primary/10 text-primary',
              (!accent || accent === 'neutral') && 'bg-muted text-muted-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="num mt-3 text-2xl font-semibold sm:text-[28px]">{formatMoney(value, { currency })}</p>
      <div className="mt-2 flex items-center gap-2">
        {comparison ? <ComparisonBadge metric={comparison} /> : null}
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
    </Card>
  );
}

/**
 * Up is not automatically good: more income is positive, more spending is not.
 * The metric carries its own direction so the colour never lies.
 */
export function ComparisonBadge({ metric, className }: { metric: ComparisonMetric; className?: string }) {
  if (metric.delta_ratio === null) {
    return <span className={cn('text-xs text-muted-foreground', className)}>Sin período previo</span>;
  }

  const rising = metric.delta > 0;
  const good = rising === metric.higher_is_better;
  const flat = Math.abs(metric.delta_ratio) < 0.5;
  const Icon = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        flat && 'bg-muted text-muted-foreground',
        !flat && good && 'bg-success/12 text-success',
        !flat && !good && 'bg-destructive/10 text-destructive',
        className,
      )}
      title={`Período anterior: ${metric.previous.toLocaleString('es-AR')}`}
    >
      <Icon className="h-3 w-3" />
      {formatPercent(Math.abs(metric.delta_ratio))}
      <span className="font-normal text-muted-foreground">vs. anterior</span>
    </span>
  );
}
