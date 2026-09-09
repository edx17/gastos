-- Compra y venta de moneda extranjera
--
-- Comprar dólares no es un gasto: la plata no se consume, cambia de moneda.
-- Por eso el movimiento es una transferencia, y lo único que hace falta guardar
-- es hacia dónde fue el cambio.
--
--   compro 100 dólares a 1450  →  type = 'transfer'
--                                 currency = 'USD',  amount = 100
--                                 exchange_rate = 1450
--                                 base_amount = 145000   (los pesos que salieron)
--                                 exchange_kind = 'buy'
--
-- Con eso alcanza: la tenencia en cada moneda es lo comprado menos lo vendido,
-- y los pesos movidos salen de `base_amount`. No hace falta una segunda fila ni
-- una tabla de saldos.

alter table public.transactions
  add column if not exists exchange_kind text;

alter table public.transactions
  drop constraint if exists transactions_exchange_kind_check;

alter table public.transactions
  add constraint transactions_exchange_kind_check
    check (exchange_kind is null or (exchange_kind in ('buy', 'sell') and type = 'transfer'));

comment on column public.transactions.exchange_kind is
  'buy/sell cuando el movimiento es un cambio de moneda; null en todo lo demás.';

create index if not exists transactions_exchange_idx
  on public.transactions (user_id, currency, transaction_date)
  where exchange_kind is not null;

-- ------------------------------------------------------------ saldo acumulado

/**
 * Lo que quedó disponible en la moneda base.
 *
 * Comprar moneda extranjera descuenta los pesos que salieron y venderla los
 * suma. El resto de las transferencias no mueven el saldo: son plata que va de
 * un bolsillo propio a otro.
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
  where user_id = auth.uid();
$$;

-- --------------------------------------------------------------- tenencias

/**
 * Cuánto tiene la persona de cada moneda que compró, cuánto puso para juntarlo
 * y a qué precio promedio lo compró.
 *
 * La suma se hace acá y no en el navegador: lo que viaja es una fila por
 * moneda, no el historial entero.
 *
 * `invested` es lo que efectivamente salió del bolsillo: compras menos ventas.
 * Puede quedar negativo si alguien vendió más caro de lo que compró, y eso es
 * información, no un error.
 */
create or replace function public.currency_holdings()
returns table (
  currency text,
  amount numeric,
  invested numeric,
  avg_rate numeric
)
language sql
stable
as $$
  with moves as (
    select
      t.currency,
      case when t.exchange_kind = 'buy' then t.amount else -t.amount end as signed_amount,
      case when t.exchange_kind = 'buy' then t.base_amount else -t.base_amount end as signed_base,
      case when t.exchange_kind = 'buy' then t.amount else 0 end as bought_amount,
      case when t.exchange_kind = 'buy' then t.base_amount else 0 end as bought_base
    from public.transactions t
    where t.user_id = auth.uid()
      and t.exchange_kind is not null
  )
  select
    m.currency,
    round(sum(m.signed_amount)::numeric, 2) as amount,
    round(sum(m.signed_base)::numeric, 2) as invested,
    case
      when sum(m.bought_amount) > 0 then round((sum(m.bought_base) / sum(m.bought_amount))::numeric, 2)
      else null
    end as avg_rate
  from moves m
  group by m.currency
  having round(sum(m.signed_amount)::numeric, 2) <> 0
  order by m.currency;
$$;

grant execute on function public.currency_holdings() to authenticated;
