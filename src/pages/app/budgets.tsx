import * as React from 'react';
import { PiggyBank, Plus, Trash2 } from 'lucide-react';
import { formatMoney, formatPercent } from '@/lib/money';
import { today } from '@/lib/date';
import { useWorkspace } from '@/providers/workspace-provider';
import { useAsync } from '@/hooks/use-async';
import { useToast } from '@/components/ui/toast';
import type { Budget, BudgetPeriod, BudgetStatus } from '@/types/budget';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { ErrorNote } from '@/components/finance/error-note';

const STATUS_LABEL: Record<BudgetStatus, string> = {
  normal: 'En orden',
  warning: 'Atención',
  danger: 'Casi al límite',
  exceeded: 'Excedido',
};

const STATUS_VARIANT: Record<BudgetStatus, 'success' | 'warning' | 'destructive' | 'outline'> = {
  normal: 'success',
  warning: 'warning',
  danger: 'warning',
  exceeded: 'destructive',
};

export default function BudgetsPage() {
  const { client, userId, categories, profile, revision, bumpRevision } = useWorkspace();
  const toast = useToast();
  const currency = profile.base_currency;
  const progress = useAsync(() => client.getBudgetProgress(userId), [userId, revision]);

  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Budget | null>(null);
  const [form, setForm] = React.useState({
    name: '',
    amount: '',
    period: 'monthly' as BudgetPeriod,
    categoryId: '',
    thresholds: '0.8,0.9,1',
  });

  const submit = async () => {
    const amount = Number(form.amount.replace(/[^\d.]/g, ''));
    if (!form.name.trim() || !Number.isFinite(amount) || amount <= 0) return;
    await client.createBudget(userId, {
      household_id: null,
      name: form.name.trim(),
      period: form.period,
      amount,
      currency,
      category_id: form.categoryId || null,
      subcategory_id: null,
      alert_thresholds: form.thresholds
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0),
      starts_on: today(),
      is_active: true,
    });
    toast.success('Límite creado', form.name);
    setForm({ name: '', amount: '', period: 'monthly', categoryId: '', thresholds: '0.8,0.9,1' });
    setCreating(false);
    bumpRevision();
    progress.reload();
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Límites de gasto</h1>
          <p className="text-sm text-muted-foreground">
            Definí cuánto querés gastar y te aviso antes de pasarte, no después.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Nuevo límite
        </Button>
      </header>

      {progress.error ? <ErrorNote error={progress.error} onRetry={progress.reload} /> : null}

      {progress.loading && !progress.data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : progress.data?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {progress.data.map((item) => (
            <Card key={item.budget.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.budget.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.budget.category_id ? item.category_name : 'Todas las categorías'} ·{' '}
                      {item.budget.period === 'monthly' ? 'Mensual' : 'Semanal'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Eliminar límite"
                      onClick={() => setDeleting(item.budget)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="num text-2xl font-semibold">{formatMoney(item.spent, { currency })}</span>
                  <span className="text-sm text-muted-foreground">
                    de {formatMoney(item.budget.amount, { currency })}
                  </span>
                </div>

                <Progress
                  value={item.ratio * 100}
                  label={item.budget.name}
                  indicatorClassName={
                    item.status === 'exceeded' ? 'bg-destructive' : item.status === 'danger' || item.status === 'warning' ? 'bg-warning' : undefined
                  }
                />

                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>{formatPercent(item.ratio * 100)} usado</span>
                  <span>
                    {item.remaining >= 0
                      ? `Quedan ${formatMoney(item.remaining, { currency })}`
                      : `Te pasaste ${formatMoney(Math.abs(item.remaining), { currency })}`}
                  </span>
                  {item.projected_end_of_period ? (
                    <span>A este ritmo: {formatMoney(item.projected_end_of_period, { currency })}</span>
                  ) : null}
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Avisos en {item.budget.alert_thresholds.map((t) => `${Math.round(t * 100)}%`).join(' · ')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={PiggyBank}
          title="Todavía no definiste límites"
          description="Empezá por el rubro que más se te va de las manos: comida, delivery o salidas."
          action={{ label: 'Crear el primero', onClick: () => setCreating(true) }}
        />
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nuevo límite" size="sm">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="budget-name">Nombre</Label>
            <Input
              id="budget-name"
              autoFocus
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ej: Comida del mes"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget-amount">Importe ({currency})</Label>
            <Input
              id="budget-amount"
              inputMode="numeric"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              placeholder="400000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget-period">Período</Label>
            <Select
              id="budget-period"
              value={form.period}
              onChange={(event) => setForm({ ...form, period: event.target.value as BudgetPeriod })}
            >
              <option value="monthly">Mensual</option>
              <option value="weekly">Semanal</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget-category">Categoría</Label>
            <Select
              id="budget-category"
              value={form.categoryId}
              onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
            >
              <option value="">Límite general</option>
              {categories
                .filter((c) => c.kind === 'expense' && c.is_active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget-alerts">Alertas (proporción del límite)</Label>
            <Input
              id="budget-alerts"
              value={form.thresholds}
              onChange={(event) => setForm({ ...form, thresholds: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">Por defecto avisa al 80%, 90% y 100%.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button onClick={submit}>Crear límite</Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Eliminar límite"
        message={`Se elimina «${deleting?.name ?? ''}». Los movimientos quedan intactos.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await client.deleteBudget(deleting.id);
          toast.success('Límite eliminado');
          bumpRevision();
          progress.reload();
        }}
      />
    </div>
  );
}
