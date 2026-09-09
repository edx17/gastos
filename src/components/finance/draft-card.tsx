import * as React from 'react';
import { CalendarDays, Check, CreditCard, HelpCircle, Info, Pencil, Sparkles, Store, X } from 'lucide-react';
import { cn, round as round2 } from '@/lib/utils';
import { formatMoney, parseAmountInput } from '@/lib/money';
import { currencyNoun, describeExchange } from '@/services/nlp/exchange';
import { humanDate, today as todayISO } from '@/lib/date';
import { useWorkspace } from '@/providers/workspace-provider';
import type { InterpretResult } from '@/services/ai';
import type { SaveOptions } from '@/hooks/use-quick-entry';
import type { TransactionInput, TransactionType } from '@/types/transaction';
import type { CurrencyCode } from '@/types/currency';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select, Switch, Textarea } from '@/components/ui/input';
import { CategoryBadge } from './category-badge';
import { CurrencySelector } from './currency-selector';

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Transferencia',
  refund: 'Reintegro',
  adjustment: 'Ajuste',
};

/** El género tiene que concordar: «Transferencia detectado» se lee mal. */
const TYPE_HEADLINES: Record<TransactionType, string> = {
  expense: 'Gasto detectado',
  income: 'Ingreso detectado',
  transfer: 'Transferencia detectada',
  refund: 'Reintegro detectado',
  adjustment: 'Ajuste detectado',
};

/**
 * The review card: "Gasto detectado". Nothing is written until the person says so,
 * and every single field stays editable even when the confidence is high.
 */
export function DraftCard({
  draft,
  onSave,
  onCancel,
  saving,
}: {
  draft: InterpretResult;
  onSave: (input: TransactionInput, options: SaveOptions) => void | Promise<unknown>;
  onCancel: () => void;
  saving?: boolean;
}) {
  const { categories, paymentMethods, household, householdMembers, rates, profile } = useWorkspace();
  const { intent, suggestion } = draft;

  const [editing, setEditing] = React.useState(draft.action === 'ask');
  const [amount, setAmount] = React.useState(intent.amount ? String(intent.amount) : '');
  const [currency, setCurrency] = React.useState<CurrencyCode>(intent.currency);
  const [description, setDescription] = React.useState(intent.description);
  const [type, setType] = React.useState<TransactionType>(intent.type === 'unknown' ? 'expense' : intent.type);
  const [date, setDate] = React.useState(intent.date || todayISO());
  const [categoryId, setCategoryId] = React.useState(suggestion.category_id ?? '');
  const [subcategoryId, setSubcategoryId] = React.useState(suggestion.subcategory_id ?? '');
  const [paymentMethodId, setPaymentMethodId] = React.useState(
    paymentMethods.find((m) => m.name === intent.payment_method)?.id ?? paymentMethods.find((m) => m.is_default)?.id ?? '',
  );
  const [notes, setNotes] = React.useState('');
  const [askLearn, setAskLearn] = React.useState(false);
  const [shared, setShared] = React.useState(false);
  // Si no dijeron la cotización, arrancamos con la que tenga configurada.
  const [rate, setRate] = React.useState(String(intent.exchange_rate ?? rates[intent.currency] ?? ''));
  const [count, setCount] = React.useState(String(intent.installments?.count ?? ''));
  const [from, setFrom] = React.useState(String(intent.installments?.from ?? 1));
  // Por defecto lo pagó quien está usando la app: es el caso de casi siempre.
  const [paidBy, setPaidBy] = React.useState(
    householdMembers.find((member) => member.user_id)?.id ?? householdMembers[0]?.id ?? '',
  );

  const categoryChanged = categoryId !== (suggestion.category_id ?? '') || subcategoryId !== (suggestion.subcategory_id ?? '');
  const category = categories.find((c) => c.id === categoryId);
  const subcategory = category?.subcategories.find((s) => s.id === subcategoryId);
  const parsedAmount = parseAmountInput(amount) ?? 0;
  const amountValid = parsedAmount > 0;

  // Un cambio de moneda no se categoriza ni se reparte: es plata que cambia de
  // bolsillo. La ficha muestra otra cosa y pide otra cosa.
  const exchangeKind = intent.exchange_kind ?? null;
  const parsedRate = parseAmountInput(rate) ?? 0;
  const baseTotal = parsedAmount * parsedRate;
  const baseCurrency = intent.currency === profile.base_currency ? intent.currency : profile.base_currency;

  // Cuotas: el importe que se guarda es el de CADA cuota. Si la persona dijo el
  // precio total («120 lucas en 6 cuotas»), acá se divide.
  const plan = intent.installments ?? null;
  const parsedCount = Math.trunc(Number(count) || 0);
  const parsedFrom = Math.trunc(Number(from) || 1);
  const planValid = Boolean(plan) && parsedCount >= 2 && parsedCount <= 120 && parsedFrom >= 1 && parsedFrom <= parsedCount;
  const perInstallment = plan && planValid && plan.amount_is_total ? parsedAmount / parsedCount : parsedAmount;
  const planTotal = planValid ? perInstallment * parsedCount : 0;
  const planRemaining = planValid ? perInstallment * (parsedCount - parsedFrom + 1) : 0;

  const canSave = exchangeKind
    ? amountValid && parsedRate > 0
    : amountValid && description.trim().length > 0 && (!plan || planValid);

  const buildInput = (): TransactionInput =>
    exchangeKind
      ? {
          type: 'transfer',
          amount: parsedAmount,
          currency,
          description: description.trim(),
          transaction_date: date,
          notes: notes.trim() || null,
          source: 'natural_language',
          ai_confidence: intent.confidence,
          exchange_kind: exchangeKind,
          exchange_rate: parsedRate,
        }
      : {
          type,
          amount: parsedAmount,
          currency,
          description: description.trim(),
          transaction_date: date,
          category_id: categoryId || null,
          subcategory_id: subcategoryId || null,
          merchant_name: intent.merchant,
          payment_method_id: paymentMethodId || null,
          notes: notes.trim() || null,
          source: 'natural_language',
          ai_confidence: intent.confidence,
          household_id: shared && household ? household.id : null,
          paid_by: shared && paidBy ? paidBy : null,
          ...(plan && planValid
            ? { amount: round2(perInstallment), installments: { count: parsedCount, from: parsedFrom } }
            : {}),
        };

  const submit = (learn: SaveOptions['learn']) => {
    if (!canSave) return;
    void onSave(buildInput(), { learn });
  };

  const handlePrimary = () => {
    if (!canSave) return;
    // A changed category is a teaching moment — ask once, then remember the answer.
    if (!exchangeKind && categoryChanged && !askLearn) {
      setAskLearn(true);
      return;
    }
    submit('once');
  };

  return (
    <Card className="animate-slide-up overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-accent/40 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          {exchangeKind
            ? describeExchange(exchangeKind, currency)
            : intent.card_payment
              ? 'Pago de tarjeta'
              : TYPE_HEADLINES[type]}
          <span className="text-xs font-normal text-muted-foreground">
            {Math.round(intent.confidence * 100)}% de confianza
          </span>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Descartar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {intent.card_payment ? (
        <div className="flex items-start gap-2 border-b border-border bg-accent/30 px-4 py-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p>
            Esto no cuenta como gasto del mes: los consumos ya los cargaste el día que compraste. Pagar el resumen
            cancela esa deuda, no gasta plata nueva.
          </p>
        </div>
      ) : null}

      {intent.question ? (
        <div className="flex items-start gap-2 border-b border-border bg-warning/10 px-4 py-3 text-sm">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-2">
            <p>{intent.question}</p>
            {intent.missing.includes('description') && amountValid ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDescription('Otros');
                    setEditing(false);
                  }}
                >
                  Guardar como «Otros»
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  Agregar descripción
                </Button>
              </div>
            ) : null}
            {intent.amount_candidates?.length ? (
              <div className="flex flex-wrap gap-2">
                {intent.amount_candidates.map((candidate) => (
                  <Button key={candidate} size="sm" variant="outline" onClick={() => setAmount(String(candidate))}>
                    {formatMoney(candidate, { currency })}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {exchangeKind ? (
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="draft-fx-amount">Cuántos {currencyNoun(currency)}</Label>
            <Input
              id="draft-fx-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="draft-fx-rate">Cotización</Label>
            <Input
              id="draft-fx-rate"
              inputMode="decimal"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              placeholder="0"
            />
            {!intent.exchange_rate ? (
              <p className="text-xs text-muted-foreground">
                Es la que tenés cargada en Ajustes. Cambiala si compraste a otro precio.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="draft-fx-date">Fecha</Label>
            <Input id="draft-fx-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="draft-fx-notes">Notas</Label>
            <Input
              id="draft-fx-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="clay-inset space-y-1 rounded-2xl p-4 sm:col-span-2">
            <p className="text-sm text-muted-foreground">
              {exchangeKind === 'buy' ? 'Sale de tus pesos' : 'Entra a tus pesos'}
            </p>
            <p className="num text-2xl font-semibold tracking-tight">
              {parsedRate > 0 && amountValid ? formatMoney(baseTotal, { currency: baseCurrency }) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              {exchangeKind === 'buy'
                ? `Sumás ${formatMoney(parsedAmount, { currency })} a lo que tenés en ${currencyNoun(currency)}. No cuenta como gasto.`
                : `Restás ${formatMoney(parsedAmount, { currency })} de lo que tenés en ${currencyNoun(currency)}. No cuenta como ingreso.`}
            </p>
          </div>
        </div>
      ) : !editing ? (
        <div className="space-y-3 p-5">
          <p className="num text-3xl font-semibold tracking-tight">
            {amountValid ? formatMoney(parsedAmount, { currency }) : 'Importe pendiente'}
          </p>
          <p className="text-base font-medium">{description || 'Sin descripción'}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {category ? (
              <CategoryBadge name={category.name} subcategory={subcategory?.name} color={category.color} />
            ) : null}
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {humanDate(date)}
            </span>
            {intent.merchant ? (
              <span className="inline-flex items-center gap-1">
                <Store className="h-3.5 w-3.5" />
                {intent.merchant}
              </span>
            ) : null}
          </div>
          {suggestion.source !== 'fallback' ? (
            <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
          ) : null}
          {draft.degraded ? (
            <p className="text-xs text-warning">
              {draft.degraded} Usé la interpretación local, revisá los datos antes de guardar.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="draft-amount">Importe</Label>
            <div className="flex gap-2">
              <Input
                id="draft-amount"
                inputMode="decimal"
                value={amount}
                autoFocus
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0"
              />
              <CurrencySelector value={currency} onChange={setCurrency} className="w-32" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="draft-description">Descripción</Label>
            <Input
              id="draft-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="¿En qué fue?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="draft-type">Tipo</Label>
            <Select id="draft-type" value={type} onChange={(event) => setType(event.target.value as TransactionType)}>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="draft-date">Fecha</Label>
            <Input id="draft-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="draft-category">Categoría</Label>
            <Select
              id="draft-category"
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
          <div className="space-y-1.5">
            <Label htmlFor="draft-subcategory">Subcategoría</Label>
            <Select
              id="draft-subcategory"
              value={subcategoryId}
              onChange={(event) => setSubcategoryId(event.target.value)}
              disabled={!category}
            >
              <option value="">Sin subcategoría</option>
              {category?.subcategories.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="draft-payment">Medio de pago</Label>
            <Select
              id="draft-payment"
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
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="draft-notes">Notas</Label>
            <Textarea
              id="draft-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>
      )}

      {plan ? (
        <div className="space-y-3 border-t border-border bg-accent/30 px-5 py-4">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p>
              Se guarda como un gasto por mes, no todo hoy. Así cada mes muestra lo que realmente pesa ese mes.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="draft-count">Cuántas cuotas</Label>
              <Input
                id="draft-count"
                inputMode="numeric"
                value={count}
                onChange={(event) => setCount(event.target.value)}
                placeholder="6"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-from">Vas por la cuota</Label>
              <Input
                id="draft-from"
                inputMode="numeric"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground">
                Si ya venías pagándola, poné en cuál vas: se cargan sólo las que faltan.
              </p>
            </div>
          </div>

          {planValid && amountValid ? (
            <div className="clay-inset space-y-1 rounded-2xl p-4">
              <p className="num text-xl font-semibold tracking-tight">
                {parsedCount - parsedFrom + 1} × {formatMoney(perInstallment, { currency })}
              </p>
              <p className="text-xs text-muted-foreground">
                {parsedFrom > 1
                  ? `Te faltan ${formatMoney(planRemaining, { currency })} de un total de ${formatMoney(planTotal, { currency })}. La cuota ${parsedFrom} vence ${humanDate(date).toLowerCase()}.`
                  : `Total ${formatMoney(planTotal, { currency })}. La primera vence ${humanDate(date).toLowerCase()} y las demás mes a mes.`}
              </p>
            </div>
          ) : (
            <p className="text-xs text-warning">Revisá el plan: tienen que ser entre 2 y 120 cuotas.</p>
          )}
        </div>
      ) : null}

      {household && !exchangeKind ? (
        <div className="space-y-3 border-t border-border bg-accent/30 px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Gasto de {household.name}</p>
              <p className="text-xs text-muted-foreground">
                Entra en el balance compartido en vez de contar sólo para vos.
              </p>
            </div>
            <Switch
              checked={shared}
              onCheckedChange={setShared}
              label={`Marcar como gasto de ${household.name}`}
            />
          </div>
          {shared ? (
            <div className="space-y-1.5 sm:max-w-xs">
              <Label htmlFor="draft-paid-by">Lo pagó</Label>
              <Select id="draft-paid-by" value={paidBy} onChange={(event) => setPaidBy(event.target.value)}>
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

      {askLearn ? (
        <div className="space-y-3 border-t border-border bg-accent/30 px-5 py-4">
          <p className="text-sm font-medium">
            Cambiaste la categoría. ¿Querés que use esta corrección para movimientos parecidos?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => submit('always')} loading={saving}>
              Siempre
            </Button>
            <Button size="sm" variant="outline" onClick={() => submit('ask')} disabled={saving}>
              Preguntar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => submit('once')} disabled={saving}>
              Solo este gasto
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          {exchangeKind ? (
            <span />
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setEditing((value) => !value)}>
              <Pencil className="h-3.5 w-3.5" />
              {editing ? 'Ver resumen' : 'Editar'}
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handlePrimary} disabled={!canSave} loading={saving}>
              <Check className="h-4 w-4" />
              Guardar
            </Button>
          </div>
        </div>
      )}

      {!canSave && !intent.question ? (
        <p className={cn('px-5 pb-4 text-xs text-muted-foreground')}>
          {exchangeKind
            ? 'Completá cuántos comprás y a qué cotización para poder guardar.'
            : 'Completá el importe y la descripción para poder guardar.'}
        </p>
      ) : null}
    </Card>
  );
}
