import * as React from 'react';
import { Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { formatDateFull } from '@/lib/date';
import { useWorkspace } from '@/providers/workspace-provider';
import { useAsync } from '@/hooks/use-async';
import { useToast } from '@/components/ui/toast';
import type { Account, AccountInput, AccountKind } from '@/types/transaction';
import type { CurrencyCode } from '@/types/currency';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Select, Switch, Textarea } from '@/components/ui/input';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { ErrorNote } from '@/components/finance/error-note';
import { CurrencySelector } from '@/components/finance/currency-selector';

const KINDS: { value: AccountKind; label: string; hint: string }[] = [
  { value: 'checking', label: 'Cuenta corriente', hint: 'La cuenta del banco donde entra el sueldo.' },
  { value: 'savings', label: 'Caja de ahorro', hint: 'Plata guardada en el banco.' },
  { value: 'investment', label: 'Inversión', hint: 'FIMA, plazo fijo, fondos, acciones.' },
  { value: 'wallet', label: 'Billetera', hint: 'Mercado Pago, Ualá, Belo.' },
  { value: 'cash', label: 'Efectivo', hint: 'Lo que tenés en la mano o en el cajón.' },
];

const kindLabel = (kind: AccountKind) => KINDS.find((option) => option.value === kind)?.label ?? kind;

const empty = (currency: CurrencyCode): AccountInput => ({
  name: '',
  currency,
  kind: 'savings',
  balance: 0,
  institution: '',
  notes: '',
  include_in_net_worth: true,
});

/**
 * Dónde está la plata.
 *
 * El saldo lo declara la persona y se actualiza cuando quiere. Es a propósito:
 * nadie carga en una app de gastos cada rendimiento del FIMA ni cada
 * transferencia entre cuentas propias, así que un saldo deducido de los
 * movimientos daría un número falso con dos decimales de precisión.
 */
export default function AccountsPage() {
  const { client, userId, profile, rates, revision, bumpRevision } = useWorkspace();
  const toast = useToast();
  const base = profile.base_currency;

  const accounts = useAsync(() => client.listAccounts(userId), [userId, revision]);

  const [editing, setEditing] = React.useState<Account | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [removing, setRemoving] = React.useState<Account | null>(null);
  const [draft, setDraft] = React.useState<AccountInput>(() => empty(base));
  const [amount, setAmount] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const rows = accounts.data ?? [];
  const total = rows
    .filter((account) => account.include_in_net_worth)
    .reduce((acc, account) => acc + account.balance * (rates[account.currency] ?? 1), 0);
  const excluded = rows.filter((account) => !account.include_in_net_worth).length;

  const openNew = () => {
    setDraft(empty(base));
    setAmount('');
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (account: Account) => {
    setDraft({
      name: account.name,
      currency: account.currency,
      kind: account.kind,
      balance: account.balance,
      institution: account.institution ?? '',
      notes: account.notes ?? '',
      include_in_net_worth: account.include_in_net_worth,
    });
    setAmount(String(account.balance));
    setEditing(account);
    setCreating(true);
  };

  const submit = async () => {
    const balance = Number(String(amount).replace(/\./g, '').replace(',', '.'));
    if (!draft.name.trim()) {
      toast.error('Ponele un nombre a la cuenta.');
      return;
    }
    if (!Number.isFinite(balance)) {
      toast.error('El saldo tiene que ser un número.');
      return;
    }

    setSaving(true);
    try {
      const input = { ...draft, balance };
      if (editing) {
        await client.updateAccount(editing.id, input);
        toast.success('Cuenta actualizada');
      } else {
        await client.createAccount(userId, input);
        toast.success('Cuenta agregada');
      }
      setCreating(false);
      setEditing(null);
      bumpRevision();
      await accounts.reload();
    } catch (error) {
      toast.error('No pude guardar', error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cuentas</h1>
          <p className="text-sm text-muted-foreground">
            Dónde está tu plata: el banco, el FIMA, la billetera, los dólares del cajón.
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4" />
          Agregar cuenta
        </Button>
      </header>

      {accounts.error ? <ErrorNote error={accounts.error} onRetry={accounts.reload} /> : null}

      {accounts.loading && !accounts.data ? (
        <SkeletonCard />
      ) : rows.length ? (
        <>
          <Card className="clay-tinted">
            <CardHeader>
              <CardTitle>Tenés en total</CardTitle>
              <CardDescription>
                Sumando {rows.length - excluded} {rows.length - excluded === 1 ? 'cuenta' : 'cuentas'}, convertidas a{' '}
                {base} con tus cotizaciones.
                {excluded ? ` ${excluded} quedan afuera del total a pedido tuyo.` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="num text-3xl font-semibold tracking-tight">{formatMoney(total, { currency: base })}</p>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            {rows.map((account) => (
              <Card key={account.id}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{account.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {kindLabel(account.kind)}
                        {account.institution ? ` · ${account.institution}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(account)} aria-label={`Editar ${account.name}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setRemoving(account)} aria-label={`Archivar ${account.name}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <p className="num text-2xl font-semibold tracking-tight">
                    {formatMoney(account.balance, { currency: account.currency })}
                  </p>

                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    {account.currency !== base ? (
                      <p>≈ {formatMoney(account.balance * (rates[account.currency] ?? 1), { currency: base })}</p>
                    ) : null}
                    {account.balance_updated_at ? (
                      <p>Saldo al {formatDateFull(account.balance_updated_at)}</p>
                    ) : null}
                    {!account.include_in_net_worth ? <p>No suma al total.</p> : null}
                    {account.notes ? <p className="text-muted-foreground">{account.notes}</p> : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            El saldo lo ponés vos y lo actualizás cuando querés. No se calcula a partir de tus movimientos, porque
            nadie carga acá los rendimientos del fondo ni los pases entre cuentas propias: preferimos un número que
            sabés que es tuyo antes que uno inventado con dos decimales.
          </p>
        </>
      ) : (
        <EmptyState
          icon={Landmark}
          title="Todavía no cargaste dónde tenés la plata"
          description="Agregá la caja de ahorro, el FIMA, Reservas de Mercado Pago, los dólares en efectivo. Cada una con su saldo, y la app te dice cuánto tenés en total."
          action={{ label: 'Agregar cuenta', onClick: openNew }}
        />
      )}

      <Dialog
        open={creating}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? 'Editar cuenta' : 'Nueva cuenta'}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="account-name">Nombre</Label>
            <Input
              id="account-name"
              autoFocus
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Ej: FIMA Premium"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account-institution">Dónde está</Label>
            <Input
              id="account-institution"
              value={draft.institution ?? ''}
              onChange={(event) => setDraft({ ...draft, institution: event.target.value })}
              placeholder="Ej: Galicia, Mercado Pago"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account-kind">Tipo</Label>
            <Select
              id="account-kind"
              value={draft.kind}
              onChange={(event) => setDraft({ ...draft, kind: event.target.value as AccountKind })}
            >
              {KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{KINDS.find((k) => k.value === draft.kind)?.hint}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account-balance">Saldo de hoy</Label>
            <div className="flex gap-2">
              <Input
                id="account-balance"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0"
              />
              <CurrencySelector
                value={draft.currency}
                onChange={(currency) => setDraft({ ...draft, currency })}
                className="w-32"
              />
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="account-notes">Notas</Label>
            <Textarea
              id="account-notes"
              rows={2}
              value={draft.notes ?? ''}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              placeholder="Opcional"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md bg-accent/40 p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Sumar al total</p>
              <p className="text-xs text-muted-foreground">
                Apagalo si es una cuenta que mirás pero no es tuya, o si no querés que entre en el patrimonio.
              </p>
            </div>
            <Switch
              checked={draft.include_in_net_worth ?? true}
              onCheckedChange={(value) => setDraft({ ...draft, include_in_net_worth: value })}
              label="Sumar esta cuenta al total"
            />
          </div>

          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button
              variant="outline"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={submit} loading={saving}>
              {editing ? 'Guardar cambios' : 'Agregar'}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Archivar cuenta"
        message={`«${removing?.name ?? ''}» deja de aparecer y de sumar al total. Los movimientos que tenga asociados no se tocan.`}
        confirmLabel="Archivar"
        onConfirm={async () => {
          if (!removing) return;
          await client.archiveAccount(removing.id);
          setRemoving(null);
          bumpRevision();
          await accounts.reload();
          toast.success('Cuenta archivada');
        }}
      />
    </div>
  );
}

