import * as React from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Bug, Store, TrendingUp } from 'lucide-react';
import { lastNMonths, monthRange, previousRange } from '@/lib/date';
import { formatMoney, formatPercent } from '@/lib/money';
import { useWorkspace } from '@/providers/workspace-provider';
import { useAsync } from '@/hooks/use-async';
import { buildInsights } from '@/services/analytics/insights';
import type { TransactionFilters } from '@/types/transaction';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/ui/skeleton';
import { StatCard, ComparisonBadge } from '@/components/finance/stat-card';
import { DateRangePicker } from '@/components/finance/date-range-picker';
import { FilterBar } from '@/components/finance/filter-bar';
import { AiInsightCard } from '@/components/finance/ai-insight';
import { ErrorNote } from '@/components/finance/error-note';
import { UpgradeCard } from '@/components/billing/upgrade-card';
import { usePlan } from '@/hooks/use-plan';
import {
  CategoryPieChart,
  ChartCard,
  DailySpendChart,
  HorizontalBarChart,
  IncomeExpenseChart,
  SavingsTrendChart,
} from '@/components/finance/charts';

export default function ReportsPage() {
  const { client, userId, profile, categories, history, revision } = useWorkspace();
  const { can, plan, earliestReportDate } = usePlan();
  const currency = profile.base_currency;
  const historyFloor = earliestReportDate();
  const [range, setRange] = React.useState(() => monthRange());
  const [filters, setFilters] = React.useState<TransactionFilters>({});
  const [months, setMonths] = React.useState<3 | 6 | 12>(6);

  // El plan define hasta dónde se puede mirar hacia atrás.
  const cappedFrom = range.from < historyFloor ? historyFloor : range.from;
  const historyCapped = range.from < historyFloor;

  const effectiveFilters = React.useMemo<TransactionFilters>(
    () => ({ ...filters, from: cappedFrom, to: range.to }),
    [filters, cappedFrom, range.to],
  );

  const bundle = useAsync(
    () => client.getReportBundle(userId, effectiveFilters),
    [userId, JSON.stringify(effectiveFilters), revision],
  );
  const series = useAsync(() => client.getMonthlySeries(userId, months), [userId, months, revision]);
  const recurring = useAsync(() => client.listRecurring(userId), [userId, revision]);
  const budgets = useAsync(() => client.getBudgetProgress(userId), [userId, revision]);

  const insights = React.useMemo(() => {
    const previous = previousRange(range);
    return buildInsights({
      current: history.filter((t) => t.transaction_date >= range.from && t.transaction_date <= range.to),
      previous: history.filter((t) => t.transaction_date >= previous.from && t.transaction_date <= previous.to),
      categories,
      recurring: recurring.data ?? [],
      budgets: budgets.data ?? [],
      range,
      previousRange: previous,
      currency,
    });
  }, [history, categories, recurring.data, budgets.data, range, currency]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">Qué pasó, contra qué se compara y de dónde sale cada número.</p>
      </header>

      <DateRangePicker value={range} onChange={setRange} />
      <FilterBar filters={filters} onChange={setFilters} showSearch={false} showSort={false} />

      {historyCapped ? (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-sm">
          El plan {plan.name} muestra{' '}
          {plan.limits.report_history_months === 1
            ? 'el mes en curso'
            : `${plan.limits.report_history_months} meses de historia`}
          . Estás viendo desde el {cappedFrom}.{' '}
          <Link to="/app/plans" className="font-medium text-primary hover:underline">
            Ver planes
          </Link>
        </p>
      ) : null}

      {bundle.error ? <ErrorNote error={bundle.error} onRetry={bundle.reload} /> : null}

      {bundle.loading && !bundle.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonCard key={index} lines={1} />
          ))}
        </div>
      ) : bundle.data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Ingresos" value={bundle.data.summary.income} currency={currency} accent="income" />
            <StatCard label="Gastos" value={bundle.data.summary.expense} currency={currency} accent="expense" />
            <StatCard label="Ahorro" value={bundle.data.summary.savings} currency={currency} accent="savings" />
            <Card className="p-5">
              <p className="text-sm font-medium text-muted-foreground">Tasa de ahorro</p>
              <p className="num mt-3 text-2xl font-semibold sm:text-[28px]">
                {formatPercent(bundle.data.summary.savings_rate)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Período anterior: {formatPercent(bundle.data.previous.savings_rate)}
              </p>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Gastos por categoría" description={`${range.label} · ${bundle.data.byCategory.length} categorías`}>
              <CategoryPieChart data={bundle.data.byCategory} currency={currency} />
            </ChartCard>

            <ChartCard
              title="Ingresos vs. gastos"
              description="Evolución mensual"
              action={
                <Tabs
                  size="sm"
                  value={String(months)}
                  onChange={(value) => setMonths(Number(value) as 3 | 6 | 12)}
                  items={[
                    { value: '3', label: '3m' },
                    { value: '6', label: '6m' },
                    { value: '12', label: '12m' },
                  ]}
                />
              }
            >
              {series.data ? <IncomeExpenseChart data={series.data} currency={currency} /> : <div className="h-64" />}
            </ChartCard>

            <ChartCard title="Flujo de caja" description={`Ahorro mensual · ${lastNMonths(months).label}`}>
              {series.data ? <SavingsTrendChart data={series.data} currency={currency} /> : <div className="h-64" />}
            </ChartCard>

            <ChartCard title="Gasto diario" description={range.label}>
              <DailySpendChart data={bundle.data.daily} currency={currency} height={260} />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Top comercios" description="Dónde se va la plata">
              {bundle.data.merchants.length ? (
                <HorizontalBarChart
                  data={bundle.data.merchants.map((m) => ({ label: m.merchant, value: m.amount }))}
                  currency={currency}
                />
              ) : (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">Sin comercios en el período.</p>
              )}
            </ChartCard>

            <Card>
              <CardHeader>
                <CardTitle>Ranking de categorías</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {bundle.data.byCategory.slice(0, 8).map((row) => (
                  <div key={row.category_name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.color }} />
                      <span className="truncate">{row.category_name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatPercent(row.ratio)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {row.delta_ratio !== null && row.delta_ratio !== undefined ? (
                        <ComparisonBadge
                          metric={{
                            current: row.amount,
                            previous: row.previous_amount ?? 0,
                            delta: row.amount - (row.previous_amount ?? 0),
                            delta_ratio: row.delta_ratio,
                            higher_is_better: false,
                          }}
                        />
                      ) : null}
                      <span className="num font-medium">{formatMoney(row.amount, { currency })}</span>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center gap-2">
                <Bug className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Gastos hormiga</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {bundle.data.ants.count ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {bundle.data.ants.count} movimientos de hasta{' '}
                      {formatMoney(bundle.data.ants.threshold, { currency })} suman{' '}
                      <strong className="text-foreground">{formatMoney(bundle.data.ants.total, { currency })}</strong>. A
                      este ritmo son {formatMoney(bundle.data.ants.monthly_estimate, { currency })} al mes.
                    </p>
                    <div className="space-y-1.5">
                      {bundle.data.ants.groups.map((group) => (
                        <div key={group.label} className="flex items-center justify-between text-sm">
                          <span className="truncate">
                            {group.label} <span className="text-xs text-muted-foreground">×{group.count}</span>
                          </span>
                          <span className="num">{formatMoney(group.total, { currency })}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No detecté gastos chicos repetidos en este período.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Medios de pago</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {bundle.data.paymentMethods.map((method) => (
                  <div key={method.name} className="flex items-center justify-between text-sm">
                    <span>
                      {method.name} <span className="text-xs text-muted-foreground">· {method.count}</span>
                    </span>
                    <span className="num font-medium">{formatMoney(method.amount, { currency })}</span>
                  </div>
                ))}
                {!bundle.data.paymentMethods.length ? (
                  <p className="text-sm text-muted-foreground">Sin datos en el período.</p>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Detalle por subcategoría</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-2">Categoría</th>
                      <th className="pb-2">Subcategoría</th>
                      <th className="pb-2 text-right">Movimientos</th>
                      <th className="pb-2 text-right">%</th>
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bundle.data.bySubcategory.slice(0, 20).map((row) => (
                      <tr key={`${row.category_name}-${row.subcategory_name}`} className="border-t border-border">
                        <td className="py-2">{row.category_name}</td>
                        <td className="py-2 text-muted-foreground">{row.subcategory_name}</td>
                        <td className="num py-2 text-right">{row.transaction_count}</td>
                        <td className="num py-2 text-right">{formatPercent(row.ratio)}</td>
                        <td className="num py-2 text-right font-medium">{formatMoney(row.amount, { currency })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {!can('ai_insights') ? (
        <UpgradeCard
          feature="ai_insights"
          icon={TrendingUp}
          title="El análisis de hábitos no está en tu plan"
          description="Detecta en qué se te va la plata, qué subió respecto del mes pasado, tus suscripciones y los gastos hormiga que no ves."
        />
      ) : (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">Análisis inteligente</h2>
          <Badge variant="outline">Basado en tus datos</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Observaciones sobre lo que muestran tus movimientos. No son recomendaciones de inversión.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {insights.map((insight) => (
            <AiInsightCard key={insight.id} insight={insight} />
          ))}
          {!insights.length ? (
            <p className="text-sm text-muted-foreground">
              Cargá más movimientos para que pueda comparar períodos y detectar patrones.
            </p>
          ) : null}
        </div>
      </section>
      )}

      {can('ai_insights') && recurring.data?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Gastos recurrentes detectados</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recurring.data.map((item) => (
              <div key={item.merchant_key} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="num text-lg font-semibold">{formatMoney(item.average_amount, { currency })}</p>
                <p className="text-xs text-muted-foreground">
                  {CADENCE_LABELS[item.cadence]} · {item.occurrences} veces · última {item.last_date}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

const CADENCE_LABELS: Record<string, string> = {
  weekly: 'Semanal',
  monthly: 'Mensual',
  bimonthly: 'Bimestral',
  yearly: 'Anual',
};
