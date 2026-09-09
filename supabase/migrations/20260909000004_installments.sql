-- Cuotas, deudas y saldo al día de hoy
--
-- Comprar en seis cuotas no es gastar todo hoy: es deber seis veces. Así que
-- una compra en cuotas se guarda como seis gastos, uno por mes, cada uno por lo
-- que toca. Cada mes muestra lo que realmente pesa ese mes, el resumen de la
-- tarjeta cierra, y los límites y reportes funcionan sin saber nada de cuotas.
--
-- Las tres columnas alcanzan: un id que agrupa el plan, en qué cuota va cada
-- fila y de cuántas. No hace falta una tabla de planes: cada fila ya es un gasto
-- de verdad y lo pendiente son las filas con fecha futura.

alter table public.transactions
  add column if not exists installment_id uuid,
  add column if not exists installment_number smallint,
  add column if not exists installment_count smallint;

alter table public.transactions
  drop constraint if exists transactions_installments_check;

alter table public.transactions
  add constraint transactions_installments_check check (
    (installment_id is null and installment_number is null and installment_count is null)
    or (
      installment_id is not null
      and installment_number between 1 and installment_count
      and installment_count between 2 and 120
    )
  );

create index if not exists transactions_installment_idx
  on public.transactions (user_id, installment_id, installment_number)
  where installment_id is not null;

-- Lo que falta pagar vive en el futuro: hace falta poder recortarlo por fecha.
create index if not exists transactions_future_idx
  on public.transactions (user_id, transaction_date)
  where installment_id is not null;

-- ------------------------------------------------------- saldo al día de hoy

/**
 * Un gasto con fecha futura —la cuota de noviembre— todavía no salió del
 * bolsillo. El saldo se corta en el día de hoy; lo que viene se mira aparte,
 * en las cuotas pendientes.
 */
create or replace function public.account_balance()
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    case
      when type in ('income', 'refund') then base_amount
      when type = 'expense' then -base_amount
      when exchange_kind = 'buy' then -base_amount
      when exchange_kind = 'sell' then base_amount
      else 0
    end
  ), 0)::numeric
  from public.transactions
  where user_id = auth.uid()
    and transaction_date <= current_date;
$$;

-- --------------------------------------------------------- cuotas pendientes

/**
 * Lo que falta pagar, un renglón por compra.
 *
 * Se agrupa en la base y viaja una fila por plan, no las cuotas una por una.
 * «Pendiente» es lo que vence después de hoy: la cuota de este mes, si ya pasó
 * su fecha, es un gasto hecho y no una deuda.
 */
create or replace function public.pending_installments()
returns table (
  installment_id uuid,
  description text,
  installment_count smallint,
  paid_count bigint,
  pending_count bigint,
  pending_amount numeric,
  next_date date
)
language sql
stable
as $$
  select
    t.installment_id,
    min(t.description) as description,
    max(t.installment_count) as installment_count,
    count(*) filter (where t.transaction_date <= current_date) as paid_count,
    count(*) filter (where t.transaction_date > current_date) as pending_count,
    coalesce(sum(t.base_amount) filter (where t.transaction_date > current_date), 0)::numeric as pending_amount,
    min(t.transaction_date) filter (where t.transaction_date > current_date) as next_date
  from public.transactions t
  where t.user_id = auth.uid()
    and t.installment_id is not null
  group by t.installment_id
  having count(*) filter (where t.transaction_date > current_date) > 0
  order by min(t.transaction_date) filter (where t.transaction_date > current_date);
$$;

grant execute on function public.pending_installments() to authenticated;

-- ------------------------------------------------------------------ deudas

-- Un préstamo o el saldo de la tarjeta también es «dónde está la plata», con el
-- signo al revés. Se carga como una cuenta más, con saldo negativo, y resta del
-- patrimonio sin ningún caso especial.
alter table public.accounts
  drop constraint if exists accounts_kind_check;

alter table public.accounts
  add constraint accounts_kind_check
    check (kind in ('checking', 'savings', 'cash', 'investment', 'wallet', 'debt'));
