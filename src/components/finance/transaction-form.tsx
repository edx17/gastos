import * as React from 'react';
import { classify } from '@/services/categorization/engine';
import { useWorkspace } from '@/providers/workspace-provider';
import { today as todayISO } from '@/lib/date';
import { parseAmountInput } from '@/lib/money';
import type { CurrencyCode } from '@/types/currency';
import type { Transaction, TransactionInput, TransactionType } from '@/types/transaction';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Switch, Textarea } from '@/components/ui/input';
import { CurrencySelector } from './currency-selector';
import { usePlan } from '@/hooks/use-plan';

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'refund', label: 'Reintegro' },
  { value: 'adjustment', label: 'Ajuste' },
];

/** Manual editor, shared by "agregar a mano" and by editing an existing movement. */
export function TransactionForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Guardar',
  saving,
}: {
  initial?: Partial<Transaction>;
  onSubmit: (input: TransactionInput) => void | Promise<unknown>;
  onCancel?: () => void;
  submitLabel?: string;
  saving?: boolean;
}) {
  const { categories, paymentMethods, profile, rules, history, household, householdMembers } = useWorkspace();
  const { can } = usePlan();

  const [type, setType] = React.useState<TransactionType>((initial?.type as TransactionType) ?? 'expense');
  const [amount, setAmount] = React.useState(initial?.amount ? String(initial.amount) : '');
  const [currency, setCurrency] = React.useState<CurrencyCode>(initial?.currency ?? profile.base_currency);
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [merchant, setMerchant] = React.useState(initial?.merchant_name ?? '');
  const [date, setDate] = React.useState(initial?.transaction_date ?? todayISO());
  const [categoryId, setCategoryId] = React.useState(initial?.category_id ?? '');
  const [subcategoryId, setSubcategoryId] = React.useState(initial?.subcategory_id ?? '');
  const [paymentMethodId, setPaymentMethodId] = React.useState(
    initial?.payment_method_id ?? paymentMethods.find((m) => m.is_default)?.id ?? '',
  );
  const [notes, setNotes] = React.useState(initial?.notes ?? '');
  const [touchedCategory, setTouchedCategory] = React.useState(Boolean(initial?.category_id));
  const [shared, setShared] = React.useState(Boolean(initial?.household_id));
  const [paidBy, setPaidBy] = React.useState(
    initial?.paid_by ?? householdMembers.find((member) => member.user_id)?.id ?? householdMembers[0]?.id ?? '',
  );
  // Un cambio de moneda no cambia de naturaleza al editarlo: sigue siendo una
  // transferencia, y lo único que tiene sentido corregir es la cotización.
  const exchangeKind = initial?.exchange_kind ?? null;
  const [exchangeRate, setExchangeRate] = React.useState(initial?.exchange_rate ? String(initial.exchange_rate) : '');

  const category = categories.find((c) => c.id === categoryId);
  const parsedAmount = parseAmountInput(amount);
  const valid = parsedAmount !== null && parsedAmount > 0 && description.trim().length > 0;

  // Suggest a category as the person types, but never overwrite a manual choice.
  React.useEffect(() => {
    if (touchedCategory || description.trim().length < 3) return;
    const suggestion = classify({ description, merchant, type }, { categories, rules, history });
    if (suggestion.confidence >= 0.65 && suggestion.category_id) {
      setCategoryId(suggestion.category_id);
      setSubcategoryId(suggestion.subcategory_id ?? '');
    }
  }, [description, merchant, type, touchedCategory, categories, rules, history]);

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        void onSubmit({
          type: exchangeKind ? 'transfer' : type,
          amount: parsedAmount,
          currency,
          description: description.trim(),
          transaction_date: date,
          category_id: categoryId || null,
          subcategory_id: subcategoryId || null,
          merchant_name: merchant.trim() || null,
          payment_method_id: paymentMethodId || null,
          notes: notes.trim() || null,
          source: initial?.source ?? 'manual',
          household_id: shared && household ? household.id : null,
          paid_by: shared && paidBy ? paidBy : null,
          exchange_kind: exchangeKind,
          exchange_rate: exchangeKind ? parseAmountInput(exchangeRate) ?? initial?.exchange_rate : undefined,
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="tx-type">Tipo</Label>
        <Select
          id="tx-type"
          value={exchangeKind ? 'transfer' : type}
          disabled={Boolean(exchangeKind)}
          onChange={(event) => setType(event.target.value as TransactionType)}
        >
          {TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tx-amount">Importe</Label>
        <div className="flex gap-2">
          <Input
            id="tx-amount"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          {can('multi_currency') ? (
            <CurrencySelector value={currency} onChange={setCurrency} className="w-32" />
          ) : null}
        </div>
      </div>

      {exchangeKind ? (
        <div className="space-y-1.5">
          <Label htmlFor="tx-rate">Cotización</Label>
          <Input
            id="tx-rate"
            inputMode="decimal"
            value={exchangeRate}
            onChange={(event) => setExchangeRate(event.target.value)}
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground">
            {exchangeKind === 'buy' ? 'A cuánto compraste.' : 'A cuánto vendiste.'} Define cuántos pesos se movieron.
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="tx-description">Descripción</Label>
        <Input
          id="tx-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Ej: supermercado de la semana"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tx-merchant">Comercio</Label>
        <Input
          id="tx-merchant"
          value={merchant}
          onChange={(event) => setMerchant(event.target.value)}
          placeholder="Opcional"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tx-date">Fecha</Label>
        <Input id="tx-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tx-category">Categoría</Label>
        <Select
          id="tx-category"
          value={categoryId}
          onChange={(event) => {
            setTouchedCategory(true);
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

      <div className="space-y-1.5">
        <Label htmlFor="tx-subcategory">Subcategoría</Label>
        <Select
          id="tx-subcategory"
          value={subcategoryId}
          disabled={!category}
          onChange={(event) => setSubcategoryId(event.target.value)}
        >
          <option value="">Sin subcategoría</option>
          {category?.subcategories
            .filter((s) => s.is_active)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tx-payment">Medio de pago</Label>
        <Select id="tx-payment" value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}>
          <option value="">Sin especificar</option>
          {paymentMethods.map((method) => (
            <option key={method.id} value={method.id}>
              {method.name}
            </option>
          ))}
        </Select>
      </div>

      {household && !exchangeKind ? (
        <div className="space-y-3 rounded-md bg-accent/40 p-3 sm:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Gasto de {household.name}</p>
              <p className="text-xs text-muted-foreground">
                Entra en el balance compartido en vez de contar sólo para vos.
              </p>
            </div>
            <Switch checked={shared} onCheckedChange={setShared} label={`Marcar como gasto de ${household.name}`} />
          </div>
          {shared ? (
            <div className="space-y-1.5">
              <Label htmlFor="tx-paid-by">Lo pagó</Label>
              <Select id="tx-paid-by" value={paidBy} onChange={(event) => setPaidBy(event.target.value)}>
                <option value="">Sin especificar</option>
                {householdMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.display_name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="tx-notes">Notas</Label>
        <Textarea id="tx-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>

      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={!valid} loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
