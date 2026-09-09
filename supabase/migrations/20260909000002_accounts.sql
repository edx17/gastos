-- Dónde está la plata: cuentas y ahorros
--
-- La tabla `accounts` existía desde el principio pero nadie la usaba. Le falta
-- lo único que importa para responder «¿cuánto tengo y dónde?»: el saldo.
--
-- El saldo es declarado, no deducido de los movimientos. Es una decisión, no
-- una limitación: nadie carga en una app de gastos cada rendimiento del FIMA ni
-- cada transferencia entre sus propias cuentas, así que un saldo calculado a
-- partir de eso sería falso con precisión de dos decimales. Se declara, se
-- actualiza cuando uno quiere, y cada actualización queda guardada para poder
-- ver la evolución.

alter table public.accounts
  add column if not exists balance numeric(16,2) not null default 0,
  add column if not exists balance_updated_at date,
  add column if not exists institution text,
  add column if not exists notes text,
  add column if not exists sort_order integer not null default 0,
  -- Una tarjeta de crédito o una cuenta ajena puede querer verse sin sumar.
  add column if not exists include_in_net_worth boolean not null default true;

comment on column public.accounts.balance is
  'Saldo declarado por la persona, en la moneda de la cuenta.';

create index if not exists accounts_user_idx on public.accounts (user_id, sort_order, created_at);

-- ------------------------------------------------------------- historial

create table if not exists public.account_balances (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  balance numeric(16,2) not null,
  recorded_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists account_balances_account_idx
  on public.account_balances (account_id, recorded_on desc);

-- Un saldo por cuenta y por día: corregir un número el mismo día lo pisa en vez
-- de dejar dos verdades para la misma fecha.
create unique index if not exists account_balances_one_per_day
  on public.account_balances (account_id, recorded_on);

alter table public.account_balances enable row level security;
alter table public.account_balances force row level security;

drop policy if exists "account_balances_select_own" on public.account_balances;
drop policy if exists "account_balances_insert_own" on public.account_balances;
drop policy if exists "account_balances_update_own" on public.account_balances;
drop policy if exists "account_balances_delete_own" on public.account_balances;

create policy "account_balances_select_own" on public.account_balances
  for select using (user_id = auth.uid());
create policy "account_balances_insert_own" on public.account_balances
  for insert with check (user_id = auth.uid());
create policy "account_balances_update_own" on public.account_balances
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "account_balances_delete_own" on public.account_balances
  for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.account_balances to authenticated;

-- Cada vez que cambia el saldo queda registrado, sin que la app tenga que
-- acordarse de hacerlo. Van dos disparadores porque la fila tiene que existir
-- antes de que el historial pueda apuntarle: la fecha se sella antes de
-- guardar, el historial se escribe después.

create or replace function public.stamp_account_balance()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.balance is not distinct from old.balance then
    return new;
  end if;
  new.balance_updated_at := current_date;
  return new;
end;
$$;

create or replace function public.log_account_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.balance is not distinct from old.balance then
    return null;
  end if;

  insert into public.account_balances (account_id, user_id, balance, recorded_on)
  values (new.id, new.user_id, new.balance, current_date)
  on conflict (account_id, recorded_on) do update set balance = excluded.balance;

  return null;
end;
$$;

drop trigger if exists track_account_balance on public.accounts;
drop trigger if exists stamp_account_balance on public.accounts;
drop trigger if exists log_account_balance on public.accounts;

create trigger stamp_account_balance
  before insert or update of balance on public.accounts
  for each row execute function public.stamp_account_balance();

create trigger log_account_balance
  after insert or update of balance on public.accounts
  for each row execute function public.log_account_balance();

-- ------------------------------------------------------------- patrimonio

/**
 * El total de lo que hay, pasado a la moneda base con las cotizaciones que la
 * persona tenga cargadas. Las cuentas son pocas, pero la conversión se hace acá
 * para que el número sea el mismo lo consulte quien lo consulte.
 */
create or replace function public.net_worth()
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    a.balance * coalesce(
      -- Hay una cotización por fecha: vale la última cargada.
      (select r.rate from public.exchange_rates r
        where r.user_id = a.user_id and r.quote_currency = a.currency
        order by r.rate_date desc, r.created_at desc
        limit 1),
      1
    )
  ), 0)::numeric
  from public.accounts a
  where a.user_id = auth.uid()
    and a.is_active
    and a.include_in_net_worth;
$$;

grant execute on function public.net_worth() to authenticated;
