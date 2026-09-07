import * as React from 'react';
import { Filter, X } from 'lucide-react';
import { SUPPORTED_CURRENCIES } from '@/lib/money';
import { useWorkspace } from '@/providers/workspace-provider';
import type { TransactionFilters, TransactionType } from '@/types/transaction';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Ingresos' },
  { value: 'transfer', label: 'Transferencias' },
  { value: 'refund', label: 'Reintegros' },
  { value: 'adjustment', label: 'Ajustes' },
];

export function FilterBar({
  filters,
  onChange,
  showSearch = true,
  showSort = true,
}: {
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
  showSearch?: boolean;
  showSort?: boolean;
}) {
  const { categories, paymentMethods } = useWorkspace();
  const [open, setOpen] = React.useState(false);

  const category = categories.find((c) => c.id === filters.categoryIds?.[0]);
  const activeCount = [
    filters.types?.length,
    filters.categoryIds?.length,
    filters.subcategoryIds?.length,
    filters.paymentMethodIds?.length,
    filters.currency,
    filters.minAmount,
    filters.maxAmount,
    filters.merchant,
  ].filter(Boolean).length;

  const update = (patch: Partial<TransactionFilters>) => onChange({ ...filters, ...patch, page: 1 });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {showSearch ? (
          <Input
            className="max-w-xs"
            placeholder="Buscar por descripción o comercio"
            value={filters.search ?? ''}
            onChange={(event) => update({ search: event.target.value })}
            aria-label="Buscar movimientos"
          />
        ) : null}
        {showSort ? (
        <Select
          className="w-auto"
          value={filters.sort ?? 'date_desc'}
          onChange={(event) => update({ sort: event.target.value as TransactionFilters['sort'] })}
          aria-label="Ordenar"
        >
          <option value="date_desc">Más recientes</option>
          <option value="date_asc">Más antiguos</option>
          <option value="amount_desc">Mayor importe</option>
          <option value="amount_asc">Menor importe</option>
        </Select>
        ) : null}
        <Button variant={activeCount ? 'default' : 'outline'} size="sm" onClick={() => setOpen((value) => !value)}>
          <Filter className="h-4 w-4" />
          Filtros{activeCount ? ` (${activeCount})` : ''}
        </Button>
        {activeCount ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({ from: filters.from, to: filters.to, search: filters.search, sort: filters.sort, page: 1, pageSize: filters.pageSize })
            }
          >
            <X className="h-4 w-4" />
            Limpiar
          </Button>
        ) : null}
      </div>

      {open ? (
        <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="filter-type">Tipo</Label>
            <Select
              id="filter-type"
              value={filters.types?.[0] ?? ''}
              onChange={(event) => update({ types: event.target.value ? [event.target.value as TransactionType] : undefined })}
            >
              <option value="">Todos</option>
              {TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-category">Categoría</Label>
            <Select
              id="filter-category"
              value={filters.categoryIds?.[0] ?? ''}
              onChange={(event) =>
                update({
                  categoryIds: event.target.value ? [event.target.value] : undefined,
                  subcategoryIds: undefined,
                })
              }
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-subcategory">Subcategoría</Label>
            <Select
              id="filter-subcategory"
              disabled={!category}
              value={filters.subcategoryIds?.[0] ?? ''}
              onChange={(event) => update({ subcategoryIds: event.target.value ? [event.target.value] : undefined })}
            >
              <option value="">Todas</option>
              {category?.subcategories.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-payment">Medio de pago</Label>
            <Select
              id="filter-payment"
              value={filters.paymentMethodIds?.[0] ?? ''}
              onChange={(event) => update({ paymentMethodIds: event.target.value ? [event.target.value] : undefined })}
            >
              <option value="">Todos</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-currency">Moneda</Label>
            <Select
              id="filter-currency"
              value={filters.currency ?? ''}
              onChange={(event) => update({ currency: event.target.value || undefined })}
            >
              <option value="">Todas</option>
              {SUPPORTED_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-merchant">Comercio</Label>
            <Input
              id="filter-merchant"
              value={filters.merchant ?? ''}
              onChange={(event) => update({ merchant: event.target.value || undefined })}
              placeholder="Ej: Carrefour"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-min">Importe mínimo</Label>
            <Input
              id="filter-min"
              inputMode="numeric"
              value={filters.minAmount ?? ''}
              onChange={(event) => update({ minAmount: event.target.value ? Number(event.target.value) : undefined })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-max">Importe máximo</Label>
            <Input
              id="filter-max"
              inputMode="numeric"
              value={filters.maxAmount ?? ''}
              onChange={(event) => update({ maxAmount: event.target.value ? Number(event.target.value) : undefined })}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
