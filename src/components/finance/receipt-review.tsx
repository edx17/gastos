import * as React from 'react';
import { AlertTriangle, Check, Split, Trash2 } from 'lucide-react';
import { cn, round } from '@/lib/utils';
import { formatMoney } from '@/lib/money';
import { useWorkspace } from '@/providers/workspace-provider';
import type { ReceiptDraft } from '@/hooks/use-receipt';
import type { ReceiptItemDraft } from '@/types/receipt';
import type { AppError } from '@/types/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ErrorNote } from './error-note';
import { CategoryBadge } from './category-badge';

export interface ConfirmOptions {
  mode: 'single' | 'split';
  total: number;
  date: string;
  merchant: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  paymentMethodId: string | null;
  items: ReceiptItemDraft[];
}

/** Everything the OCR found, editable, before a single row is written. */
export function ReceiptReview({
  draft,
  onChange,
  onConfirm,
  onCancel,
  saving,
  error,
}: {
  draft: ReceiptDraft;
  onChange: (draft: ReceiptDraft) => void;
  onConfirm: (options: ConfirmOptions) => void | Promise<unknown>;
  onCancel: () => void;
  saving?: boolean;
  error?: AppError | null;
}) {
  const { categories, paymentMethods, profile } = useWorkspace();
  const { parsed } = draft;

  const [mode, setMode] = React.useState<'single' | 'split'>('single');
  const [merchant, setMerchant] = React.useState(parsed.merchant ?? '');
  const [date, setDate] = React.useState(parsed.date ?? new Date().toISOString().slice(0, 10));
  const [total, setTotal] = React.useState(parsed.total !== null ? String(parsed.total) : '');
  const [categoryId, setCategoryId] = React.useState(() => dominantCategory(draft.items) ?? '');
  const [subcategoryId, setSubcategoryId] = React.useState('');
  const [paymentMethodId, setPaymentMethodId] = React.useState(
    paymentMethods.find((m) => m.name === parsed.payment_method)?.id ?? paymentMethods.find((m) => m.is_default)?.id ?? '',
  );

  const category = categories.find((c) => c.id === categoryId);
  const parsedTotal = Number(total.replace(',', '.'));
  const totalValid = Number.isFinite(parsedTotal) && parsedTotal > 0;

  const distribution = React.useMemo(() => {
    const buckets = new Map<string, { name: string; color: string; total: number }>();
    for (const item of draft.items) {
      const found = categories.find((c) => c.id === item.category_id);
      const key = found?.id ?? 'sin';
      const bucket = buckets.get(key) ?? { name: found?.name ?? 'Sin categoría', color: found?.color ?? '#94a3b8', total: 0 };
      bucket.total = round(bucket.total + item.total, 2);
      buckets.set(key, bucket);
    }
    return [...buckets.values()].sort((a, b) => b.total - a.total);
  }, [draft.items, categories]);

  const updateItem = (index: number, patch: Partial<ReceiptItemDraft>) => {
    const items = draft.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange({ ...draft, items });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Revisá el ticket</CardTitle>
          <div className="flex items-center gap-2">
            {draft.isMock ? <Badge variant="warning">OCR demo</Badge> : null}
            <Badge variant={parsed.confidence >= 0.7 ? 'success' : 'outline'}>
              {Math.round(parsed.confidence * 100)}% de confianza
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[240px_1fr]">
          <div className="space-y-2">
            <img
              src={draft.previewUrl}
              alt="Ticket subido"
              className="max-h-72 w-full rounded-lg border border-border object-contain"
            />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Ver texto detectado</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-[11px]">
                {draft.rawText}
              </pre>
            </details>
          </div>

          <div className="space-y-4">
            {parsed.warnings.length ? (
              <div className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-3">
                {parsed.warnings.map((warning) => (
                  <p key={warning} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    {warning}
                  </p>
                ))}
                {parsed.total_candidates?.length ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {parsed.total_candidates.map((candidate) => (
                      <Button key={candidate} size="sm" variant="outline" onClick={() => setTotal(String(candidate))}>
                        Usar {formatMoney(candidate, { currency: parsed.currency })}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="receipt-merchant">Comercio</Label>
                <Input id="receipt-merchant" value={merchant} onChange={(event) => setMerchant(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="receipt-date">Fecha</Label>
                <Input id="receipt-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="receipt-total">Total</Label>
                <Input
                  id="receipt-total"
                  inputMode="decimal"
                  value={total}
                  onChange={(event) => setTotal(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 text-sm text-muted-foreground">
              {parsed.merchant_tax_id ? <p>CUIT: {parsed.merchant_tax_id}</p> : null}
              {parsed.receipt_number ? <p>Ticket: {parsed.receipt_number}</p> : null}
              {parsed.discount ? <p>Descuento: {formatMoney(parsed.discount, { currency: parsed.currency })}</p> : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="receipt-payment">Medio de pago</Label>
                <Select
                  id="receipt-payment"
                  value={paymentMethodId}
                  onChange={(event) => setPaymentMethodId(event.target.value)}
                >
                  <option value="">Sin especificar</option>
                  {paymentMethods.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.name}
                    </option>
                  ))}
                </Select>
              </div>
              {mode === 'single' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="receipt-category">Categoría del gasto</Label>
                  <Select
                    id="receipt-category"
                    value={categoryId}
                    onChange={(event) => {
                      setCategoryId(event.target.value);
                      setSubcategoryId('');
                    }}
                  >
                    <option value="">Sin categoría</option>
                    {categories
                      .filter((c) => c.is_active)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </Select>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {draft.items.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{draft.items.length} productos detectados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {draft.items.map((item, index) => (
              <div
                key={`${item.description}-${index}`}
                className="grid items-center gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_auto_180px_auto]"
              >
                <Input
                  value={item.description}
                  onChange={(event) => updateItem(index, { description: event.target.value })}
                  className="h-9"
                  aria-label="Descripción del producto"
                />
                <Input
                  value={String(item.total)}
                  inputMode="decimal"
                  onChange={(event) => updateItem(index, { total: Number(event.target.value.replace(',', '.')) || 0 })}
                  className="h-9 w-28 text-right"
                  aria-label="Importe del producto"
                />
                <Select
                  className="h-9"
                  value={item.category_id ?? ''}
                  onChange={(event) => {
                    const found = categories.find((c) => c.id === event.target.value);
                    updateItem(index, {
                      category_id: event.target.value || null,
                      subcategory_id: null,
                      category_name: found?.name,
                    });
                  }}
                  aria-label="Categoría del producto"
                >
                  <option value="">Sin categoría</option>
                  {categories
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Quitar producto"
                  onClick={() => onChange({ ...draft, items: draft.items.filter((_, i) => i !== index) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="text-sm font-medium">Distribución:</span>
              {distribution.map((bucket) => (
                <CategoryBadge
                  key={bucket.name}
                  name={bucket.name}
                  color={bucket.color}
                  subcategory={formatMoney(bucket.total, { currency: parsed.currency })}
                  size="sm"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {error ? <ErrorNote error={error} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <ModeButton active={mode === 'single'} onClick={() => setMode('single')} title="Un solo gasto">
            Guardar como un gasto
          </ModeButton>
          <ModeButton
            active={mode === 'split'}
            onClick={() => setMode('split')}
            title="Un movimiento por categoría"
            disabled={distribution.length < 2}
          >
            <Split className="h-4 w-4" />
            Distribuir por categoría
          </ModeButton>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Descartar
          </Button>
          <Button
            loading={saving}
            disabled={!totalValid}
            onClick={() =>
              onConfirm({
                mode,
                total: parsedTotal,
                date,
                merchant: merchant.trim() || null,
                categoryId: categoryId || null,
                subcategoryId: subcategoryId || null,
                paymentMethodId: paymentMethodId || null,
                items: draft.items,
              })
            }
          >
            <Check className="h-4 w-4" />
            Guardar {totalValid ? formatMoney(parsedTotal, { currency: parsed.currency }) : ''}
          </Button>
        </div>
      </div>

      {!totalValid ? (
        <p className="text-sm text-muted-foreground">
          Revisá el total antes de guardar: no pude identificarlo con certeza en la imagen.
        </p>
      ) : null}
      {category && mode === 'single' ? (
        <p className="text-xs text-muted-foreground">
          Se guardará en {category.name} usando la moneda {parsed.currency} (base {profile.base_currency}).
        </p>
      ) : null}
    </div>
  );
}

function ModeButton({
  active,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40',
        active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground',
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function dominantCategory(items: ReceiptItemDraft[]): string | null {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!item.category_id) continue;
    totals.set(item.category_id, (totals.get(item.category_id) ?? 0) + item.total);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
