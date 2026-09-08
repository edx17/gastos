import { Lightbulb, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AiInsight as Insight } from '@/types/ai';
import { Card } from '@/components/ui/card';

const ICONS = {
  info: Lightbulb,
  positive: TrendingDown,
  warning: TrendingUp,
} as const;

/** An observation with the numbers attached — never advice dressed up as a fact. */
export function AiInsightCard({ insight }: { insight: Insight }) {
  const Icon = insight.kind === 'budget' ? AlertTriangle : ICONS[insight.severity];
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'clay-sm flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            insight.severity === 'positive' && 'bg-success/12 text-success',
            insight.severity === 'warning' && 'bg-warning/15 text-warning',
            insight.severity === 'info' && 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{insight.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{insight.body}</p>
          {insight.evidence.length ? (
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {insight.evidence.map((item) => (
                <div key={item.label} className="flex gap-1">
                  <dt>{item.label}:</dt>
                  <dd className="num font-medium text-foreground">{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
