-- Saldo inicial: poder decir «al 1 de septiembre tenía tanto»
--
-- El saldo declarado ya servía como punto de partida, pero siempre quedaba
-- fechado hoy. Eso alcanza para arrancar de cero hacia adelante y no alcanza
-- para lo que hace todo el mundo: sentarse un martes, poner cuánto había el
-- primero del mes y cargar lo que pasó desde entonces.
--
-- Ahora la fecha del saldo se puede elegir. Con eso el ancla queda atrás y los
-- movimientos posteriores construyen el saldo de hoy solos.

create or replace function public.stamp_account_balance()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.balance is not distinct from old.balance
     and new.balance_updated_at is not distinct from old.balance_updated_at then
    return new;
  end if;

  -- Si quien escribe eligió una fecha, se respeta; si no, es de hoy. Nunca
  -- adelante: un saldo del futuro no es un saldo, es un pronóstico.
  if tg_op = 'INSERT' then
    new.balance_updated_at := least(coalesce(new.balance_updated_at, current_date), current_date);
  elsif new.balance_updated_at is distinct from old.balance_updated_at then
    new.balance_updated_at := least(coalesce(new.balance_updated_at, current_date), current_date);
  else
    new.balance_updated_at := current_date;
  end if;

  -- Con fecha de hoy vale la hora exacta, para distinguir lo que se cargue
  -- después. Con una fecha vieja, el ancla es el arranque de ese día: todo lo
  -- de esa jornada es posterior al saldo.
  new.balance_declared_at := case
    when new.balance_updated_at = current_date then now()
    else new.balance_updated_at::timestamptz
  end;

  return new;
end;
$$;

/**
 * El historial guarda el saldo en la fecha que corresponde, no en la de carga.
 * Si no, cargar hoy el saldo del primero del mes dejaría el punto en el lugar
 * equivocado y la evolución mentiría.
 */
create or replace function public.log_account_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.balance is not distinct from old.balance
     and new.balance_updated_at is not distinct from old.balance_updated_at then
    return null;
  end if;

  insert into public.account_balances (account_id, user_id, balance, recorded_on)
  values (new.id, new.user_id, new.balance, new.balance_updated_at)
  on conflict (account_id, recorded_on) do update set balance = excluded.balance;

  return null;
end;
$$;

-- El disparador tiene que escuchar también los cambios de fecha, no sólo los
-- de importe: mover el ancla sin tocar el número es una operación válida.
drop trigger if exists stamp_account_balance on public.accounts;
drop trigger if exists log_account_balance on public.accounts;

create trigger stamp_account_balance
  before insert or update of balance, balance_updated_at on public.accounts
  for each row execute function public.stamp_account_balance();

create trigger log_account_balance
  after insert or update of balance, balance_updated_at on public.accounts
  for each row execute function public.log_account_balance();
