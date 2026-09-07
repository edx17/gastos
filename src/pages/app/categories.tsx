import * as React from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Plus, Tag } from 'lucide-react';
import { monthRange, previousRange } from '@/lib/date';
import { formatMoney, formatPercent } from '@/lib/money';
import { useWorkspace } from '@/providers/workspace-provider';
import { useAsync } from '@/hooks/use-async';
import { useToast } from '@/components/ui/toast';
import { categoryBreakdown } from '@/services/analytics/aggregate';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ComparisonBadge } from '@/components/finance/stat-card';
import type { CategoryKind } from '@/types/category';

const KIND_LABELS: Record<CategoryKind, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Transferencia',
  investment: 'Inversión',
};

const PALETTE = ['#0f766e', '#2563eb', '#7c3aed', '#e11d48', '#f97316', '#16a34a', '#0891b2', '#d946ef', '#64748b'];

export default function CategoriesPage() {
  const { client, userId, categories, profile, history, refreshCategories, revision, bumpRevision } = useWorkspace();
  const toast = useToast();
  const range = React.useMemo(() => monthRange(), []);
  const currency = profile.base_currency;

  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [renaming, setRenaming] = React.useState<{ id: string; name: string } | null>(null);
  const [newSub, setNewSub] = React.useState<{ categoryId: string; name: string } | null>(null);
  const [name, setName] = React.useState('');
  const [kind, setKind] = React.useState<CategoryKind>('expense');
  const [color, setColor] = React.useState(PALETTE[0]);

  const budgets = useAsync(() => client.getBudgetProgress(userId), [userId, revision]);

  const breakdown = React.useMemo(() => {
    const previous = previousRange(range);
    return categoryBreakdown(
      history.filter((t) => t.transaction_date >= range.from && t.transaction_date <= range.to),
      categories,
      { previous: history.filter((t) => t.transaction_date >= previous.from && t.transaction_date <= previous.to) },
    );
  }, [history, categories, range]);

  const statsFor = (categoryId: string) => breakdown.find((row) => row.category_id === categoryId);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
          <p className="text-sm text-muted-foreground">
            Cómo se reparte tu plata en {range.label}. Podés renombrarlas, desactivarlas o crear las tuyas.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Nueva categoría
        </Button>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {categories.map((category, index) => {
          const stats = statsFor(category.id);
          const budget = budgets.data?.find((b) => b.budget.category_id === category.id);
          const open = expanded === category.id;

          return (
            <Card key={category.id} className={category.is_active ? '' : 'opacity-60'}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setExpanded(open ? null : category.id)}>
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: category.color }} />
                    <span className="truncate font-medium">{category.name}</span>
                    <Badge variant="outline">{KIND_LABELS[category.kind]}</Badge>
                    {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={category.is_active ? 'Desactivar' : 'Activar'}
                      onClick={async () => {
                        await client.updateCategory(category.id, { is_active: !category.is_active });
                        await refreshCategories();
                      }}
                    >
                      {category.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Subir"
                      disabled={index === 0}
                      onClick={async () => {
                        const ids = categories.map((c) => c.id);
                        [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                        await client.reorderCategories(ids);
                        await refreshCategories();
                      }}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="num text-xl font-semibold">
                    {formatMoney(stats?.amount ?? 0, { currency })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatPercent(stats?.ratio ?? 0)} del total · {stats?.transaction_count ?? 0} movimientos
                  </span>
                  {stats?.delta_ratio !== null && stats?.delta_ratio !== undefined ? (
                    <ComparisonBadge
                      metric={{
                        current: stats.amount,
                        previous: stats.previous_amount ?? 0,
                        delta: stats.amount - (stats.previous_amount ?? 0),
                        delta_ratio: stats.delta_ratio,
                        higher_is_better: category.kind === 'income',
                      }}
                    />
                  ) : null}
                </div>

                {budget ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Presupuesto</span>
                      <span className="num">
                        {formatMoney(budget.spent, { currency })} / {formatMoney(budget.budget.amount, { currency })}
                      </span>
                    </div>
                    <Progress
                      value={budget.ratio * 100}
                      indicatorClassName={budget.status === 'exceeded' ? 'bg-destructive' : budget.status === 'danger' ? 'bg-warning' : undefined}
                    />
                  </div>
                ) : null}

                {open ? (
                  <div className="space-y-2 border-t border-border pt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {category.subcategories.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={async () => {
                            await client.updateSubcategory(sub.id, { is_active: !sub.is_active });
                            await refreshCategories();
                          }}
                          className={`rounded-full border px-2.5 py-1 text-xs ${sub.is_active ? 'border-border' : 'border-dashed text-muted-foreground line-through'}`}
                          title={sub.is_active ? 'Desactivar' : 'Activar'}
                        >
                          {sub.name}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setRenaming({ id: category.id, name: category.name })}>
                        Renombrar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setNewSub({ categoryId: category.id, name: '' })}>
                        <Plus className="h-3.5 w-3.5" />
                        Subcategoría
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nueva categoría" size="sm">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Nombre</Label>
            <Input id="cat-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-kind">Tipo</Label>
            <Select id="cat-kind" value={kind} onChange={(event) => setKind(event.target.value as CategoryKind)}>
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((option) => (
                <button
                  key={option}
                  onClick={() => setColor(option)}
                  aria-label={`Color ${option}`}
                  className={`h-7 w-7 rounded-full ring-offset-2 ${color === option ? 'ring-2 ring-ring' : ''}`}
                  style={{ background: option }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!name.trim()}
              onClick={async () => {
                await client.createCategory(userId, { name: name.trim(), kind, color, icon: 'Tag' });
                await refreshCategories();
                bumpRevision();
                toast.success('Categoría creada', name);
                setName('');
                setCreating(false);
              }}
            >
              Crear
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={Boolean(renaming)} onClose={() => setRenaming(null)} title="Renombrar categoría" size="sm">
        <div className="space-y-4">
          <Input
            value={renaming?.name ?? ''}
            onChange={(event) => setRenaming((current) => (current ? { ...current, name: event.target.value } : null))}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!renaming?.name.trim()) return;
                await client.updateCategory(renaming.id, { name: renaming.name.trim() });
                await refreshCategories();
                setRenaming(null);
                toast.success('Categoría actualizada');
              }}
            >
              Guardar
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={Boolean(newSub)} onClose={() => setNewSub(null)} title="Nueva subcategoría" size="sm">
        <div className="space-y-4">
          <Input
            value={newSub?.name ?? ''}
            onChange={(event) => setNewSub((current) => (current ? { ...current, name: event.target.value } : null))}
            placeholder="Ej: Peluquería"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNewSub(null)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!newSub?.name.trim()) return;
                await client.createSubcategory(userId, newSub.categoryId, newSub.name.trim());
                await refreshCategories();
                setNewSub(null);
                toast.success('Subcategoría creada');
              }}
            >
              Crear
            </Button>
          </div>
        </div>
      </Dialog>

      {!categories.length ? (
        <Card className="p-8 text-center">
          <Tag className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Todavía no hay categorías cargadas.</p>
        </Card>
      ) : null}
    </div>
  );
}
