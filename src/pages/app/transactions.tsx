import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Download, Pencil, Plus, Trash2, Upload, Wallet } from 'lucide-react';
import { monthRange } from '@/lib/date';
import { formatMoney } from '@/lib/money';
import { useWorkspace } from '@/providers/workspace-provider';
import { useAsync } from '@/hooks/use-async';
import { useToast } from '@/components/ui/toast';
import type { Transaction, TransactionFilters } from '@/types/transaction';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker } from '@/components/finance/date-range-picker';
import { FilterBar } from '@/components/finance/filter-bar';
import { TransactionRow } from '@/components/finance/transaction-row';
import { TransactionForm } from '@/components/finance/transaction-form';
import { ErrorNote } from '@/components/finance/error-note';
import { ImportCsvDialog } from '@/components/finance/import-csv';
import { exportTransactionsCsv } from '@/services/reports/export';

export default function TransactionsPage() {
  const { client, userId, categories, paymentMethods, profile, revision, bumpRevision, refreshHistory } = useWorkspace();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus');

  const [range, setRange] = React.useState(() => monthRange());
  const [filters, setFilters] = React.useState<TransactionFilters>({ page: 1, pageSize: 25, sort: 'date_desc' });
  const [editing, setEditing] = React.useState<Transaction | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Transaction | null>(null);
  const [saving, setSaving] = React.useState(false);

  const effectiveFilters = React.useMemo<TransactionFilters>(
    () => ({ ...filters, from: range.from, to: range.to }),
    [filters, range],
  );

  const page = useAsync(
    () => client.listTransactions(userId, effectiveFilters),
    [userId, JSON.stringify(effectiveFilters), revision],
  );

  const totalPages = page.data ? Math.max(1, Math.ceil(page.data.total / page.data.pageSize)) : 1;
  const periodTotal = React.useMemo(
    () =>
      (page.data?.rows ?? [])
        .filter((row) => row.type === 'expense')
        .reduce((acc, row) => acc + row.base_amount, 0),
    [page.data],
  );

  const afterWrite = async () => {
    await refreshHistory();
    bumpRevision();
    page.reload();
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Movimientos</h1>
          <p className="text-sm text-muted-foreground">
            {page.data ? `${page.data.total} movimientos · ` : ''}
            gastos del período: {formatMoney(periodTotal, { currency: profile.base_currency })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
            <Upload className="h-4 w-4" />
            Importar CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!page.data?.rows.length) return;
              exportTransactionsCsv(page.data.rows, categories);
              toast.success('Exportación lista', 'Descargamos los movimientos del período.');
            }}
          >
            <Download className="h-4 w-4" />
            Exportar
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Nuevo
          </Button>
        </div>
      </header>

      <DateRangePicker value={range} onChange={setRange} />
      <FilterBar filters={filters} onChange={setFilters} />

      {page.error ? <ErrorNote error={page.error} onRetry={page.reload} /> : null}

      <Card>
        <CardContent className="px-2 py-2">
          {page.loading && !page.data ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : page.data?.rows.length ? (
            page.data.rows.map((transaction) => (
              <div key={transaction.id} className="group relative">
                <TransactionRow
                  transaction={transaction}
                  categories={categories}
                  paymentMethodName={paymentMethods.find((m) => m.id === transaction.payment_method_id)?.name}
                  highlighted={transaction.id === focusId}
                  onClick={() => setEditing(transaction)}
                />
                <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Editar"
                    onClick={() => setEditing(transaction)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Duplicar"
                    onClick={async () => {
                      await client.createTransaction(userId, {
                        type: transaction.type,
                        amount: transaction.amount,
                        currency: transaction.currency,
                        description: transaction.description,
                        transaction_date: transaction.transaction_date,
                        category_id: transaction.category_id,
                        subcategory_id: transaction.subcategory_id,
                        merchant_name: transaction.merchant_name,
                        payment_method_id: transaction.payment_method_id,
                        source: 'manual',
                      });
                      toast.success('Movimiento duplicado');
                      await afterWrite();
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Eliminar"
                    onClick={() => setDeleting(transaction)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={Wallet}
              title="No hay movimientos con esos filtros"
              description="Probá ampliando el período o limpiando los filtros."
              className="m-3"
              action={{ label: 'Agregar movimiento', onClick: () => setCreating(true) }}
            />
          )}
        </CardContent>
      </Card>

      {page.data && totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page.data.page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page.data.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page.data.page >= totalPages}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nuevo movimiento" size="lg">
        <TransactionForm
          saving={saving}
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            setSaving(true);
            try {
              await client.createTransaction(userId, input);
              toast.success('Movimiento guardado', input.description);
              setCreating(false);
              await afterWrite();
            } catch (error) {
              toast.error('No pude guardar', error instanceof Error ? error.message : undefined);
            } finally {
              setSaving(false);
            }
          }}
        />
      </Dialog>

      <Dialog
        open={Boolean(editing)}
        onClose={() => {
          setEditing(null);
          if (focusId) setSearchParams({});
        }}
        title="Editar movimiento"
        size="lg"
      >
        {editing ? (
          <TransactionForm
            initial={editing}
            saving={saving}
            submitLabel="Guardar cambios"
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              setSaving(true);
              try {
                await client.updateTransaction(editing.id, {
                  ...input,
                  category_id: input.category_id ?? null,
                  subcategory_id: input.subcategory_id ?? null,
                  merchant_name: input.merchant_name ?? null,
                  payment_method_id: input.payment_method_id ?? null,
                  notes: input.notes ?? null,
                });
                toast.success('Movimiento actualizado');
                setEditing(null);
                await afterWrite();
              } catch (error) {
                toast.error('No pude actualizar', error instanceof Error ? error.message : undefined);
              } finally {
                setSaving(false);
              }
            }}
          />
        ) : null}
      </Dialog>

      <ImportCsvDialog open={importing} onClose={() => setImporting(false)} onImported={afterWrite} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Eliminar movimiento"
        message={`Se va a borrar «${deleting?.description ?? ''}». Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await client.deleteTransaction(deleting.id);
          toast.success('Movimiento eliminado');
          await afterWrite();
        }}
      />
    </div>
  );
}
