import * as React from 'react';
import { ArrowRight, Home, Plus, Trash2, Users } from 'lucide-react';
import { formatMoney, formatPercent } from '@/lib/money';
import { monthRange } from '@/lib/date';
import { settleBalances } from '@/services/data/local';
import { useWorkspace } from '@/providers/workspace-provider';
import { useAsync } from '@/hooks/use-async';
import { useToast } from '@/components/ui/toast';
import type { HouseholdMember } from '@/types/user';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { DateRangePicker } from '@/components/finance/date-range-picker';
import { TransactionRow } from '@/components/finance/transaction-row';
import { ErrorNote } from '@/components/finance/error-note';

/**
 * Modo pareja / hogar: qué se gastó entre todos, quién puso cuánto y quién le
 * debe a quién. Una persona del hogar puede no tener cuenta en la app.
 */
export default function HouseholdPage() {
  const { client, userId, profile, categories, history, household, householdMembers, refreshHousehold, revision, bumpRevision } =
    useWorkspace();
  const toast = useToast();
  const currency = profile.base_currency;

  const [range, setRange] = React.useState(() => monthRange());
  const [creating, setCreating] = React.useState(false);
  const [householdName, setHouseholdName] = React.useState('Casa');
  const [addingMember, setAddingMember] = React.useState(false);
  const [memberName, setMemberName] = React.useState('');
  const [memberEmail, setMemberEmail] = React.useState('');
  const [removing, setRemoving] = React.useState<HouseholdMember | null>(null);

  const balances = useAsync(
    () => (household ? client.getHouseholdBalance(household.id, range) : Promise.resolve([])),
    [household?.id, range.from, range.to, revision],
  );

  const sharedRows = React.useMemo(
    () =>
      history.filter(
        (row) =>
          row.household_id === household?.id &&
          row.transaction_date >= range.from &&
          row.transaction_date <= range.to,
      ),
    [history, household?.id, range],
  );

  const total = (balances.data ?? []).reduce((acc, row) => acc + row.paid, 0);
  const settlements = React.useMemo(() => settleBalances(balances.data ?? []), [balances.data]);

  if (!household) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Hogar</h1>
          <p className="text-sm text-muted-foreground">
            Para gastos compartidos: quién puso qué y cómo quedan las cuentas.
          </p>
        </header>

        <EmptyState
          icon={Users}
          title="Todavía no creaste un hogar"
          description="Sirve para convivientes, pareja o cualquiera con quien compartas gastos. La otra persona no necesita tener cuenta."
          action={{ label: 'Crear hogar', onClick: () => setCreating(true) }}
        />

        <Dialog open={creating} onClose={() => setCreating(false)} title="Nuevo hogar" size="sm">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="household-name">Nombre</Label>
              <Input
                id="household-name"
                autoFocus
                value={householdName}
                onChange={(event) => setHouseholdName(event.target.value)}
                placeholder="Ej: Casa, Depto de Palermo"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
              <Button
                onClick={async () => {
                  if (!householdName.trim()) return;
                  await client.createHousehold(userId, householdName.trim());
                  await refreshHousehold();
                  bumpRevision();
                  setCreating(false);
                  toast.success('Hogar creado', 'Ahora agregá a las personas con las que compartís gastos.');
                }}
              >
                Crear
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{household.name}</h1>
          <p className="text-sm text-muted-foreground">
            {sharedRows.length
              ? `${sharedRows.length} gastos compartidos en ${range.label}`
              : `Sin gastos compartidos en ${range.label}`}
          </p>
        </div>
        <Button size="sm" onClick={() => setAddingMember(true)}>
          <Plus className="h-4 w-4" />
          Agregar persona
        </Button>
      </header>

      <DateRangePicker value={range} onChange={setRange} />

      {balances.error ? <ErrorNote error={balances.error} onRetry={balances.reload} /> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Quién puso cuánto</CardTitle>
            <CardDescription>
              Total compartido: {formatMoney(total, { currency })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {balances.loading && !balances.data ? (
              <SkeletonCard />
            ) : (
              (balances.data ?? []).map((row) => (
                <div key={row.member_id} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className="h-3 w-3 rounded-full" style={{ background: row.color }} />
                      {row.display_name}
                      <span className="text-xs font-normal text-muted-foreground">
                        le toca {formatPercent(row.share * 100, 0)}
                      </span>
                    </span>
                    <span className="num text-sm">
                      puso <strong>{formatMoney(row.paid, { currency })}</strong>
                      <span className="text-muted-foreground"> de {formatMoney(row.owed, { currency })}</span>
                    </span>
                  </div>
                  <Progress
                    value={row.owed > 0 ? Math.min(100, (row.paid / row.owed) * 100) : 0}
                    label={row.display_name}
                    indicatorClassName={row.balance < 0 ? 'bg-warning' : undefined}
                  />
                  <p className="text-xs text-muted-foreground">
                    {Math.abs(row.balance) < 1
                      ? 'Está a mano.'
                      : row.balance > 0
                        ? `Puso ${formatMoney(row.balance, { currency })} de más.`
                        : `Le falta poner ${formatMoney(Math.abs(row.balance), { currency })}.`}
                  </p>
                </div>
              ))
            )}
            {!balances.loading && !(balances.data ?? []).length ? (
              <p className="text-sm text-muted-foreground">
                Agregá personas al hogar para repartir los gastos.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Para quedar a mano</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {settlements.length ? (
              settlements.map((settlement, index) => (
                <div key={index} className="clay-inset rounded-md p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <strong>{settlement.from}</strong>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <strong>{settlement.to}</strong>
                  </p>
                  <p className="num mt-1 text-lg font-semibold">
                    {formatMoney(settlement.amount, { currency })}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {total > 0 ? 'Las cuentas están equilibradas.' : 'Todavía no hay gastos compartidos en el período.'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Integrantes</CardTitle>
          <Badge variant="outline">{householdMembers.length}</Badge>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {householdMembers.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-md bg-accent/30 p-3">
              <span
                className="clay-sm flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ background: member.color }}
              >
                {member.display_name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.display_name}
                  {member.role === 'owner' ? <span className="ml-1 text-xs text-muted-foreground">· vos</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {member.user_id ? 'Con cuenta propia' : member.invite_email || 'Sin cuenta en la app'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Select
                  className="h-9 w-24"
                  value={String(member.share)}
                  aria-label={`Parte de ${member.display_name}`}
                  onChange={async (event) => {
                    await client.updateHouseholdMember(member.id, { share: Number(event.target.value) });
                    await refreshHousehold();
                    balances.reload();
                  }}
                >
                  {[0.25, 0.3333, 0.4, 0.5, 0.6, 0.6667, 0.75].map((value) => (
                    <option key={value} value={value}>
                      {Math.round(value * 100)}%
                    </option>
                  ))}
                </Select>
                {member.role !== 'owner' ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Quitar a ${member.display_name}`}
                    onClick={() => setRemoving(member)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gastos compartidos</CardTitle>
          <CardDescription>
            Marcá «Gasto de {household.name}» al cargar un movimiento para que entre acá.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 pb-2">
          {sharedRows.length ? (
            sharedRows
              .slice(0, 15)
              .map((row) => (
                <TransactionRow
                  key={row.id}
                  transaction={row}
                  categories={categories}
                  paymentMethodName={householdMembers.find((m) => m.id === row.paid_by)?.display_name}
                />
              ))
          ) : (
            <EmptyState
              icon={Home}
              title="Todavía no hay gastos del hogar"
              description={`Cuando cargues un gasto, activá «Gasto de ${household.name}» y elegí quién lo pagó.`}
              className="m-3"
            />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={addingMember}
        onClose={() => setAddingMember(false)}
        title="Agregar persona"
        description="No hace falta que tenga cuenta en Crocante."
        size="sm"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="member-name">Nombre</Label>
            <Input
              id="member-name"
              autoFocus
              value={memberName}
              onChange={(event) => setMemberName(event.target.value)}
              placeholder="Ej: Sofi"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-email">Email (opcional)</Label>
            <Input
              id="member-email"
              type="email"
              value={memberEmail}
              onChange={(event) => setMemberEmail(event.target.value)}
              placeholder="Para vincular su cuenta cuando se registre"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddingMember(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!memberName.trim()) return;
                await client.addHouseholdMember(household.id, {
                  display_name: memberName.trim(),
                  invite_email: memberEmail.trim() || null,
                });
                await refreshHousehold();
                bumpRevision();
                setMemberName('');
                setMemberEmail('');
                setAddingMember(false);
                toast.success('Persona agregada al hogar');
              }}
            >
              Agregar
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Quitar del hogar"
        message={`${removing?.display_name ?? ''} sale del hogar. Los gastos compartidos quedan, pero dejan de estar atribuidos a esa persona.`}
        confirmLabel="Quitar"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await client.removeHouseholdMember(removing.id);
          await refreshHousehold();
          bumpRevision();
          toast.success('Persona quitada del hogar');
        }}
      />
    </div>
  );
}
