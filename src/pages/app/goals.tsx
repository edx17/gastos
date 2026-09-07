import * as React from 'react';
import { CalendarClock, Plus, Target, Trash2, TrendingUp } from 'lucide-react';
import { formatMoney, formatPercent } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { useWorkspace } from '@/providers/workspace-provider';
import { useAsync } from '@/hooks/use-async';
import { useToast } from '@/components/ui/toast';
import type { Goal } from '@/types/goal';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { CurrencySelector } from '@/components/finance/currency-selector';
import { ErrorNote } from '@/components/finance/error-note';

export default function GoalsPage() {
  const { client, userId, profile, revision, bumpRevision } = useWorkspace();
  const toast = useToast();
  const projections = useAsync(() => client.getGoalProjections(userId), [userId, revision]);

  const [creating, setCreating] = React.useState(false);
  const [contributing, setContributing] = React.useState<Goal | null>(null);
  const [deleting, setDeleting] = React.useState<Goal | null>(null);
  const [amount, setAmount] = React.useState('');
  const [form, setForm] = React.useState({
    name: '',
    target: '',
    current: '',
    date: '',
    monthly: '',
    currency: profile.base_currency,
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Metas de ahorro</h1>
          <p className="text-sm text-muted-foreground">Cuánto falta, cuánto poner por mes y cuándo llegás.</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Nueva meta
        </Button>
      </header>

      {projections.error ? <ErrorNote error={projections.error} onRetry={projections.reload} /> : null}

      {projections.loading && !projections.data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : projections.data?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {projections.data.map(({ goal, progress, remaining, months_left, required_monthly, estimated_completion, on_track }) => (
            <Card key={goal.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{goal.name}</p>
                    {goal.description ? <p className="text-xs text-muted-foreground">{goal.description}</p> : null}
                  </div>
                  <div className="flex items-center gap-1">
                    {on_track === null ? null : (
                      <Badge variant={on_track ? 'success' : 'warning'}>{on_track ? 'En camino' : 'Va lento'}</Badge>
                    )}
                    <Button variant="ghost" size="icon-sm" aria-label="Eliminar meta" onClick={() => setDeleting(goal)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="num text-2xl font-semibold">
                    {formatMoney(goal.current_amount, { currency: goal.currency })}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    de {formatMoney(goal.target_amount, { currency: goal.currency })}
                  </span>
                  <span className="num ml-auto text-sm font-medium">{formatPercent(progress)}</span>
                </div>

                <Progress value={progress} label={goal.name} />

                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <span className="flex items-center gap-1">
                    <Target className="h-3.5 w-3.5" />
                    Faltan {formatMoney(remaining, { currency: goal.currency })}
                  </span>
                  {required_monthly ? (
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5" />
                      {formatMoney(required_monthly, { currency: goal.currency })} por mes
                      {months_left ? ` (${months_left} meses)` : ''}
                    </span>
                  ) : null}
                  {goal.target_date ? (
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Objetivo: {formatDate(goal.target_date)}
                    </span>
                  ) : null}
                  {estimated_completion ? (
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Estimado: {formatDate(estimated_completion)}
                    </span>
                  ) : null}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setContributing(goal);
                    setAmount('');
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Registrar aporte
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Target}
          title="Todavía no tenés metas"
          description="Poné un objetivo concreto: vacaciones, fondo de emergencia, una compra puntual."
          action={{ label: 'Crear meta', onClick: () => setCreating(true) }}
        />
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nueva meta" size="sm">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="goal-name">Nombre</Label>
            <Input
              id="goal-name"
              autoFocus
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ej: Vacaciones"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">Objetivo</Label>
              <Input
                id="goal-target"
                inputMode="numeric"
                value={form.target}
                onChange={(event) => setForm({ ...form, target: event.target.value })}
                placeholder="2000000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-current">Monto actual</Label>
              <Input
                id="goal-current"
                inputMode="numeric"
                value={form.current}
                onChange={(event) => setForm({ ...form, current: event.target.value })}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-date">Fecha objetivo</Label>
              <Input
                id="goal-date"
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-monthly">Aporte mensual</Label>
              <Input
                id="goal-monthly"
                inputMode="numeric"
                value={form.monthly}
                onChange={(event) => setForm({ ...form, monthly: event.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="goal-currency">Moneda</Label>
              <CurrencySelector
                id="goal-currency"
                value={form.currency}
                onChange={(value) => setForm({ ...form, currency: value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                const target = Number(form.target.replace(/[^\d.]/g, ''));
                if (!form.name.trim() || !Number.isFinite(target) || target <= 0) return;
                await client.createGoal(userId, {
                  household_id: null,
                  name: form.name.trim(),
                  description: null,
                  target_amount: target,
                  current_amount: Number(form.current.replace(/[^\d.]/g, '')) || 0,
                  currency: form.currency,
                  target_date: form.date || null,
                  monthly_contribution: Number(form.monthly.replace(/[^\d.]/g, '')) || null,
                  icon: 'Target',
                  color: '#0f766e',
                  is_archived: false,
                });
                toast.success('Meta creada', form.name);
                setForm({ name: '', target: '', current: '', date: '', monthly: '', currency: profile.base_currency });
                setCreating(false);
                bumpRevision();
                projections.reload();
              }}
            >
              Crear meta
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(contributing)}
        onClose={() => setContributing(null)}
        title={`Aporte a ${contributing?.name ?? ''}`}
        size="sm"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="goal-contribution">Importe</Label>
            <Input
              id="goal-contribution"
              autoFocus
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setContributing(null)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                const value = Number(amount.replace(/[^\d.-]/g, ''));
                if (!contributing || !Number.isFinite(value) || value === 0) return;
                await client.addGoalContribution(userId, contributing.id, value);
                toast.success('Aporte registrado');
                setContributing(null);
                bumpRevision();
                projections.reload();
              }}
            >
              Registrar
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Eliminar meta"
        message={`Se elimina «${deleting?.name ?? ''}» y sus aportes registrados.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await client.deleteGoal(deleting.id);
          toast.success('Meta eliminada');
          bumpRevision();
          projections.reload();
        }}
      />
    </div>
  );
}
