import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, PiggyBank, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { monthRange, previousRange } from '@/lib/date';
import { formatPercent } from '@/lib/money';
import { useWorkspace } from '@/providers/workspace-provider';
import { useAsync } from '@/hooks/use-async';
import { buildInsights } from '@/services/analytics/insights';
import { StatCard } from '@/components/finance/stat-card';
import { HoldingsCard } from '@/components/finance/holdings-card';
import { InstallmentsCard } from '@/components/finance/installments-card';
import { NaturalLanguageInput } from '@/components/finance/natural-language-input';
import { TransactionRow } from '@/components/finance/transaction-row';
import { AiInsightCard } from '@/components/finance/ai-insight';
import { CategoryPieChart, ChartCard, DailySpendChart } from '@/components/finance/charts';
import { ErrorNote } from '@/components/finance/error-note';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { QuotaNotice } from '@/components/billing/upgrade-card';
import { usePlan } from '@/hooks/use-plan';

export default function DashboardPage() {
  const { client, userId, profile, categories, paymentMethods, history, revision, bumpRevision, rates } = useWorkspace();
  const { can } = usePlan();
  const range = React.useMemo(() => monthRange(), []);
  const currency = profile.base_currency;

  const dashboard = useAsync(() => client.getDashboard(userId, range), [userId, range.from, range.to, revision]);
  const budgets = useAsync(() => client.getBudgetProgress(userId), [userId, revision]);
  const recurring = useAsync(() => client.listRecurring(userId), [userId, revision]);

  const insights = React.useMemo(() => {
    if (!dashboard.data) return [];
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
  }, [dashboard.data, history, categories, recurring.data, budgets.data, range, currency]);

  const recent = history.slice(0, 6);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {profile.display_name.split(' ')[0]}</h1>
        <p className="text-sm text-muted-foreground">
          Esto es lo que pasó con tu plata en {range.label}.
        </p>
      </header>

      <QuotaNotice feature="transactions_per_month" label="movimientos" />
      <NaturalLanguageInput onSaved={() => bumpRevision()} />

      {dashboard.error ? <ErrorNote error={dashboard.error} onRetry={dashboard.reload} /> : null}

      {dashboard.loading && !dashboard.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonCard key={index} lines={1} />
          ))}
        </div>
      ) : dashboard.data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Ingresos del mes"
              value={dashboard.data.period.income}
              currency={currency}
              comparison={dashboard.data.comparison.income}
              icon={TrendingUp}
              accent="income"
            />
            <StatCard
              label="Gastos del mes"
              value={dashboard.data.period.expense}
              currency={currency}
              comparison={dashboard.data.comparison.expense}
              icon={TrendingDown}
              accent="expense"
            />
            <StatCard
              label="Ahorro del mes"
              value={dashboard.data.period.savings}
              currency={currency}
              comparison={dashboard.data.comparison.savings}
              icon={PiggyBank}
              accent="savings"
              hint={`Tasa ${formatPercent(dashboard.data.period.savings_rate)}`}
            />
            {/* No es "lo que tenés": es lo que sobró de lo que entró y salió desde
                que usás la app. Lo que tenés está en Cuentas. */}
            <StatCard
              label="Ahorro acumulado"
              value={dashboard.data.balance}
              currency={currency}
              icon={Wallet}
              hint="Desde que usás Crocante"
            />
          </div>

          {dashboard.data.pending_installments.length ? (
            <InstallmentsCard plans={dashboard.data.pending_installments} currency={currency} />
          ) : null}

          {dashboard.data.holdings.length ? (
            <HoldingsCard holdings={dashboard.data.holdings} rates={rates} baseCurrency={currency} />
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Gastos por categoría" description={range.label}>
              {dashboard.data.top_categories.length ? (
                <CategoryPieChart data={dashboard.data.top_categories} currency={currency} />
              ) : (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Todavía no hay gastos este mes.
                </p>
              )}
            </ChartCard>

            <ChartCard title="Gasto diario" description="Para detectar los días caros de un vistazo">
              <DailySpendChart data={dashboard.data.recent_days} currency={currency} />
            </ChartCard>
          </div>
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Últimos movimientos</CardTitle>
            <Link to="/app/transactions" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Ver todos <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            {recent.length ? (
              recent.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  categories={categories}
                  paymentMethodName={paymentMethods.find((m) => m.id === transaction.payment_method_id)?.name}
                />
              ))
            ) : (
              <EmptyState
                icon={Wallet}
                title="Todavía no cargaste movimientos"
                description="Probá escribiendo «super 45 lucas» en el campo de arriba."
                className="m-3"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Límites del mes</CardTitle>
            <Link to="/app/budgets" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Gestionar
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {budgets.data?.length ? (
              budgets.data.slice(0, 4).map((item) => (
                <div key={item.budget.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.budget.name}</span>
                    <span className="num text-muted-foreground">{Math.round(item.ratio * 100)}%</span>
                  </div>
                  <Progress
                    value={item.ratio * 100}
                    label={item.budget.name}
                    indicatorClassName={
                      item.status === 'exceeded'
                        ? 'bg-destructive'
                        : item.status === 'danger'
                          ? 'bg-warning'
                          : item.status === 'warning'
                            ? 'bg-warning/70'
                            : undefined
                    }
                  />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Definí un límite mensual y te aviso al 80%, 90% y 100%.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {can('ai_insights') && insights.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Análisis inteligente</h2>
            <Link to="/app/reports" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Ver reportes
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {insights.slice(0, 4).map((insight) => (
              <AiInsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
