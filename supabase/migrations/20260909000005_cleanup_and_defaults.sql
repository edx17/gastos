-- Duplicados, acentos rotos y medio de pago por defecto
--
-- Tres problemas que salieron de usar la app de verdad.
--
-- 1. `seed_user_defaults` inserta los medios de pago y la cuenta inicial con
--    `on conflict do nothing`, pero esas tablas nunca tuvieron una restricción
--    de unicidad: el `on conflict` no tenía contra qué chocar, así que cada
--    corrida agregaba cinco medios de pago más. Con la migración que repartió
--    la subcategoría de rendimientos eso se ejecutó para todas las cuentas, y
--    quien aplicó el paquete varias veces terminó con la lista triplicada.
--
-- 2. Los nombres con acento llegaron rotos cuando el archivo se generó
--    redirigiendo la salida en PowerShell: la consola reinterpreta los bytes
--    UTF-8 con la página de códigos local. Los slugs son ASCII y sobrevivieron,
--    así que alcanzan para reponer los nombres desde la taxonomía.
--
-- 3. «Efectivo» como medio de pago por defecto no representa a nadie hoy.

-- ------------------------------------------------- 1. acentos de la taxonomía

update public.categories c
set name = t.name
from (
  select
    item->>'slug' as slug,
    item->>'name' as name
  from jsonb_array_elements(public.default_category_taxonomy()) as item
) t
where c.slug = t.slug and c.name <> t.name and c.is_system;

update public.subcategories s
set name = t.name
from (
  select
    parent->>'slug' as category_slug,
    sub->>'slug' as slug,
    sub->>'name' as name
  from jsonb_array_elements(public.default_category_taxonomy()) as parent,
       jsonb_array_elements(parent->'subcategories') as sub
) t
join public.categories c on c.slug = t.category_slug
where s.category_id = c.id and s.slug = t.slug and s.name <> t.name;

-- Los cinco medios de pago que crea el alta: se reponen por tipo, que es ASCII.
update public.payment_methods
set name = case kind
  when 'cash' then 'Efectivo'
  when 'debit' then 'Débito'
  when 'credit' then 'Crédito'
  when 'transfer' then 'Transferencia'
  when 'wallet' then 'Mercado Pago'
end
where name ~ '[^\x20-\x7E]'                    -- tiene algo fuera del ASCII visible
  and name !~ '[áéíóúñÁÉÍÓÚÑüÜ]'               -- y no es un acento de verdad
  and kind in ('cash', 'debit', 'credit', 'transfer', 'wallet');

-- ------------------------------------------------------------ 2. duplicados

/**
 * Deja una sola fila por nombre en las tablas que el alta rellena, y reapunta
 * los movimientos a la que sobrevive.
 *
 * La comparación ignora los acentos para que «Débito» y la versión con el
 * acento roto cuenten como la misma. Sobrevive la más vieja, que es la que ya
 * venían usando los movimientos.
 *
 * Es una función y no un bloque suelto para poder probarla: una migración que
 * corre sobre una base vacía no demuestra nada.
 */
create or replace function public.dedupe_reference_data()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  fila record;
  borradas integer := 0;
begin
  for fila in
    select
      (array_agg(id order by created_at, id))[1] as sobrevive,
      array_agg(id order by created_at, id) as todos
    from public.payment_methods
    group by user_id, lower(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g'))
    having count(*) > 1
  loop
    update public.transactions
    set payment_method_id = fila.sobrevive
    where payment_method_id = any(fila.todos) and payment_method_id <> fila.sobrevive;

    delete from public.payment_methods
    where id = any(fila.todos) and id <> fila.sobrevive;
    borradas := borradas + array_length(fila.todos, 1) - 1;
  end loop;

  for fila in
    select
      (array_agg(id order by created_at, id))[1] as sobrevive,
      array_agg(id order by created_at, id) as todos
    from public.accounts
    group by user_id, lower(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g'))
    having count(*) > 1
  loop
    update public.transactions
    set account_id = fila.sobrevive
    where account_id = any(fila.todos) and account_id <> fila.sobrevive;

    delete from public.accounts
    where id = any(fila.todos) and id <> fila.sobrevive;
    borradas := borradas + array_length(fila.todos, 1) - 1;
  end loop;

  return borradas;
end;
$$;

select public.dedupe_reference_data();

-- Ahora sí el `on conflict do nothing` del alta tiene contra qué chocar.
create unique index if not exists payment_methods_unique_name
  on public.payment_methods (user_id, name);

create unique index if not exists accounts_unique_name
  on public.accounts (user_id, name);

-- ------------------------------------------------- 3. medio de pago elegido

alter table public.profiles
  add column if not exists default_payment_method_id uuid
    references public.payment_methods(id) on delete set null,
  -- Cuando está en true, un movimiento sin medio de pago no se guarda.
  add column if not exists require_payment_method boolean not null default false;

comment on column public.profiles.default_payment_method_id is
  'Con qué se paga habitualmente. Reemplaza al «Efectivo» que traía el alta.';

-- ------------------------------------------- 4. las cuotas no son recurrentes

/**
 * Seis cuotas iguales, una por mes, parecen un gasto fijo pero no lo son: se
 * terminan. Marcarlas como recurrentes llenaría la lista de suscripciones
 * falsas cada vez que alguien compra algo en cuotas.
 */
create or replace function public.detect_recurring()
returns table (
  merchant_key text,
  label text,
  average_amount numeric,
  occurrences integer,
  avg_gap_days numeric,
  last_date date,
  category_id uuid,
  confirmed boolean
)
language sql
stable
as $$
  with scope as (
    select
      public.normalize_text(coalesce(nullif(trim(merchant_name), ''), description)) as merchant_key,
      coalesce(nullif(trim(merchant_name), ''), description) as label,
      base_amount,
      transaction_date,
      category_id
    from public.transactions
    where user_id = auth.uid()
      and type = 'expense'
      and installment_id is null
      and transaction_date <= current_date
  ),
  gaps as (
    select
      merchant_key,
      transaction_date - lag(transaction_date) over (partition by merchant_key order by transaction_date) as gap
    from scope
  ),
  stats as (
    select
      s.merchant_key,
      max(s.label) as label,
      avg(s.base_amount) as average_amount,
      stddev_pop(s.base_amount) as spread,
      count(*)::integer as occurrences,
      max(s.transaction_date) as last_date,
      mode() within group (order by s.category_id) as category_id
    from scope s
    group by s.merchant_key
    having count(*) >= 3
  ),
  cadence as (
    select merchant_key, avg(gap)::numeric as avg_gap_days
    from gaps
    where gap is not null
    group by merchant_key
  )
  select
    stats.merchant_key,
    stats.label,
    round(stats.average_amount, 2) as average_amount,
    stats.occurrences,
    round(cadence.avg_gap_days, 1) as avg_gap_days,
    stats.last_date,
    stats.category_id,
    r.confirmed
  from stats
  join cadence using (merchant_key)
  left join public.recurring_expenses r
    on r.user_id = auth.uid() and r.merchant_key = stats.merchant_key
  -- Mismas bandas de cadencia que usa el cliente: semanal, mensual, bimestral o anual.
  where (cadence.avg_gap_days between 5 and 9
      or cadence.avg_gap_days between 24 and 38
      or cadence.avg_gap_days between 50 and 75
      or cadence.avg_gap_days between 330 and 400)
    and (stats.average_amount = 0 or coalesce(stats.spread, 0) / nullif(stats.average_amount, 0) <= 0.45)
  order by average_amount desc;
$$;
