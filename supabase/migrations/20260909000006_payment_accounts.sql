-- De qué cuenta sale cada medio de pago
--
-- «Pagué con débito Galicia» tiene que descontar de la caja de ahorro del
-- Galicia sin que haya que elegir la cuenta en cada movimiento. Se linkea una
-- vez el medio de pago con la cuenta y listo.
--
-- El saldo declarado NO se pisa. Sigue siendo el ancla: la persona dice cuánto
-- tiene y cuándo, y a partir de ahí la app suma los movimientos posteriores y
-- muestra un estimado. Cuando el estimado se aleja de la realidad, se vuelve a
-- declarar el saldo y el ancla se corre. Pisar el número declarado en silencio
-- sería peor: bastaría un movimiento mal cargado para arruinar el único dato
-- que la persona sabe que es cierto.

alter table public.payment_methods
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

comment on column public.payment_methods.account_id is
  'De qué cuenta sale la plata cuando se paga con esto. Las tarjetas de crédito no descuentan al comprar: se paga el resumen.';

create index if not exists payment_methods_account_idx
  on public.payment_methods (account_id) where account_id is not null;

-- El ancla necesita hora, no sólo fecha: si alguien declara el saldo a la
-- mañana y a la tarde carga el café, ese café tiene que contar. Con la fecha
-- sola no se distingue de un gasto que ya estaba reflejado cuando declaró.
alter table public.accounts
  add column if not exists balance_declared_at timestamptz;

update public.accounts
set balance_declared_at = coalesce(balance_declared_at, balance_updated_at::timestamptz, created_at);

create or replace function public.stamp_account_balance()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.balance is not distinct from old.balance then
    return new;
  end if;
  new.balance_updated_at := current_date;
  new.balance_declared_at := now();
  return new;
end;
$$;

/**
 * Cuánto se movió cada cuenta desde que se declaró su saldo.
 *
 * Reglas:
 *   · Sale de la cuenta lo que se gastó y lo que se usó para comprar moneda.
 *   · Entra lo que se cobró y lo que se recuperó vendiendo moneda.
 *   · Una tarjeta de crédito NO descuenta al comprar: el consumo se paga en el
 *     resumen, y ese pago sí sale de la cuenta desde la que se transfiere.
 *   · Lo que todavía no venció no se cuenta: la cuota de noviembre no salió.
 *   · Si la moneda del movimiento es la de la cuenta se usa el importe tal
 *     cual; si no, el importe en moneda base. Convertir dos veces sólo agrega
 *     error.
 *   · Del día en que se declaró el saldo entra sólo lo que se cargó después:
 *     lo anterior ya estaba reflejado en el número que la persona dio.
 */
create or replace function public.account_movement_deltas()
returns table (account_id uuid, delta numeric, movements bigint)
language sql
stable
as $$
  select
    a.id as account_id,
    coalesce(sum(
      case
        when t.type in ('income', 'refund') then 1
        when t.type = 'expense' then -1
        when t.exchange_kind = 'buy' then -1
        when t.exchange_kind = 'sell' then 1
        else 0
      end
      * case when t.currency = a.currency then t.amount else t.base_amount end
    ), 0)::numeric as delta,
    count(t.id) as movements
  from public.accounts a
  left join public.payment_methods p
    on p.account_id = a.id and p.kind <> 'credit'
  left join public.transactions t
    on t.payment_method_id = p.id
   and t.user_id = a.user_id
   and t.transaction_date <= current_date
   and (
     t.transaction_date > coalesce(a.balance_updated_at, a.created_at::date)
     or (
       t.transaction_date = a.balance_updated_at
       and t.created_at > coalesce(a.balance_declared_at, a.created_at)
     )
   )
  where a.user_id = auth.uid() and a.is_active
  group by a.id;
$$;

grant execute on function public.account_movement_deltas() to authenticated;
