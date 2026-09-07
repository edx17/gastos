-- Crocante · funciones de negocio y de reportes
-- Las agregaciones viven en SQL: el navegador nunca descarga miles de filas para sumar.

-- ------------------------------------------------- alta de nueva cuenta

create or replace function public.seed_user_defaults(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  taxonomy jsonb := public.default_category_taxonomy();
  category jsonb;
  sub jsonb;
  new_category_id uuid;
  category_index integer := 0;
  sub_index integer;
begin
  for category in select * from jsonb_array_elements(taxonomy) loop
    insert into public.categories (user_id, name, slug, kind, icon, color, position, is_system)
    values (
      target,
      category->>'name',
      category->>'slug',
      (category->>'kind')::category_kind,
      category->>'icon',
      category->>'color',
      category_index,
      true
    )
    on conflict (user_id, slug) do update set name = excluded.name
    returning id into new_category_id;

    sub_index := 0;
    for sub in select * from jsonb_array_elements(category->'subcategories') loop
      insert into public.subcategories (category_id, user_id, name, slug, position, keywords)
      values (
        new_category_id,
        target,
        sub->>'name',
        sub->>'slug',
        sub_index,
        coalesce(array(select jsonb_array_elements_text(sub->'keywords')), '{}')
      )
      on conflict (category_id, slug) do nothing;
      sub_index := sub_index + 1;
    end loop;

    category_index := category_index + 1;
  end loop;

  insert into public.payment_methods (user_id, name, kind, is_default)
  values
    (target, 'Efectivo', 'cash', true),
    (target, 'Débito', 'debit', false),
    (target, 'Crédito', 'credit', false),
    (target, 'Transferencia', 'transfer', false),
    (target, 'Mercado Pago', 'wallet', false)
  on conflict do nothing;

  insert into public.accounts (user_id, name, currency, kind)
  values (target, 'Cuenta principal', 'ARS', 'checking')
  on conflict do nothing;

  insert into public.exchange_rates (user_id, base_currency, quote_currency, rate, source)
  values (target, 'ARS', 'USD', 1480, 'seed'), (target, 'ARS', 'EUR', 1620, 'seed')
  on conflict do nothing;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Mi cuenta')
  )
  on conflict (user_id) do nothing;

  perform public.seed_user_defaults(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantiene el monto acumulado de una meta al día con sus aportes.
create or replace function public.sync_goal_amount()
returns trigger
language plpgsql
as $$
begin
  update public.goals g
  set current_amount = coalesce((
    select sum(c.amount) from public.goal_contributions c where c.goal_id = g.id
  ), 0)
  where g.id = coalesce(new.goal_id, old.goal_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_goal_after_contribution on public.goal_contributions;
create trigger sync_goal_after_contribution
  after insert or update or delete on public.goal_contributions
  for each row execute function public.sync_goal_amount();

create or replace function public.reorder_categories(p_ids uuid[])
returns void
language sql
as $$
  update public.categories c
  set position = idx.position - 1
  from unnest(p_ids) with ordinality as idx(id, position)
  where c.id = idx.id and c.user_id = auth.uid();
$$;

-- ------------------------------------------------------------- reportes

create or replace function public.report_summary(p_from date, p_to date)
returns table (income numeric, expense numeric, transaction_count integer)
language sql
stable
as $$
  select
    coalesce(sum(base_amount) filter (where type in ('income', 'refund')), 0)::numeric as income,
    coalesce(sum(base_amount) filter (where type = 'expense'), 0)::numeric as expense,
    count(*)::integer as transaction_count
  from public.transactions
  where user_id = auth.uid() and transaction_date between p_from and p_to;
$$;

create or replace function public.report_by_category(p_from date, p_to date)
returns table (
  category_id uuid,
  category_name text,
  color text,
  icon text,
  amount numeric,
  transaction_count integer
)
language sql
stable
as $$
  select
    t.category_id,
    coalesce(c.name, 'Sin categoría') as category_name,
    coalesce(c.color, '#94a3b8') as color,
    coalesce(c.icon, 'Tag') as icon,
    sum(t.base_amount)::numeric as amount,
    count(*)::integer as transaction_count
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.user_id = auth.uid()
    and t.type = 'expense'
    and t.transaction_date between p_from and p_to
  group by t.category_id, c.name, c.color, c.icon
  order by amount desc;
$$;

create or replace function public.report_by_subcategory(p_from date, p_to date)
returns table (
  category_id uuid,
  category_name text,
  subcategory_id uuid,
  subcategory_name text,
  color text,
  amount numeric,
  transaction_count integer
)
language sql
stable
as $$
  select
    t.category_id,
    coalesce(c.name, 'Sin categoría') as category_name,
    t.subcategory_id,
    coalesce(s.name, 'Sin subcategoría') as subcategory_name,
    coalesce(c.color, '#94a3b8') as color,
    sum(t.base_amount)::numeric as amount,
    count(*)::integer as transaction_count
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  left join public.subcategories s on s.id = t.subcategory_id
  where t.user_id = auth.uid()
    and t.type = 'expense'
    and t.transaction_date between p_from and p_to
  group by t.category_id, c.name, t.subcategory_id, s.name, c.color
  order by amount desc;
$$;

create or replace function public.report_monthly(p_from date, p_to date)
returns table (month text, income numeric, expense numeric)
language sql
stable
as $$
  select
    to_char(months.month, 'YYYY-MM') as month,
    coalesce(sum(t.base_amount) filter (where t.type in ('income', 'refund')), 0)::numeric as income,
    coalesce(sum(t.base_amount) filter (where t.type = 'expense'), 0)::numeric as expense
  from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') as months(month)
  left join public.transactions t
    on t.user_id = auth.uid()
   and date_trunc('month', t.transaction_date) = months.month
  group by months.month
  order by months.month;
$$;

create or replace function public.report_daily(p_from date, p_to date)
returns table (day date, income numeric, expense numeric, transaction_count integer)
language sql
stable
as $$
  select
    days.day::date,
    coalesce(sum(t.base_amount) filter (where t.type in ('income', 'refund')), 0)::numeric as income,
    coalesce(sum(t.base_amount) filter (where t.type = 'expense'), 0)::numeric as expense,
    count(t.id)::integer as transaction_count
  from generate_series(p_from, p_to, interval '1 day') as days(day)
  left join public.transactions t
    on t.user_id = auth.uid() and t.transaction_date = days.day::date
  group by days.day
  order by days.day;
$$;

create or replace function public.report_merchants(p_from date, p_to date, p_limit integer default 10)
returns table (merchant text, amount numeric, transaction_count integer, last_date date)
language sql
stable
as $$
  select
    coalesce(nullif(trim(t.merchant_name), ''), t.description) as merchant,
    sum(t.base_amount)::numeric as amount,
    count(*)::integer as transaction_count,
    max(t.transaction_date) as last_date
  from public.transactions t
  where t.user_id = auth.uid()
    and t.type = 'expense'
    and t.transaction_date between p_from and p_to
  group by 1
  order by amount desc
  limit p_limit;
$$;

create or replace function public.report_payment_methods(p_from date, p_to date)
returns table (name text, amount numeric, transaction_count integer)
language sql
stable
as $$
  select
    coalesce(p.name, 'Sin especificar') as name,
    sum(t.base_amount)::numeric as amount,
    count(*)::integer as transaction_count
  from public.transactions t
  left join public.payment_methods p on p.id = t.payment_method_id
  where t.user_id = auth.uid()
    and t.type = 'expense'
    and t.transaction_date between p_from and p_to
  group by p.name
  order by amount desc;
$$;

-- Gastos hormiga: el umbral se calcula sobre el propio gasto de la persona.
create or replace function public.report_ants(p_from date, p_to date)
returns table (threshold numeric, label text, total numeric, transaction_count integer)
language sql
stable
as $$
  with scope as (
    select * from public.transactions
    where user_id = auth.uid() and type = 'expense' and transaction_date between p_from and p_to
  ),
  limits as (
    -- Percentil 35 del gasto propio: estable aunque haya pagos grandes puntuales.
    select greatest(1000, percentile_cont(0.35) within group (order by base_amount)) as threshold
    from scope
  ),
  ants as (
    select coalesce(nullif(trim(merchant_name), ''), description) as label, base_amount
    from scope, limits
    where scope.base_amount <= limits.threshold
  )
  select
    (select threshold from limits)::numeric as threshold,
    ants.label,
    sum(ants.base_amount)::numeric as total,
    count(*)::integer as transaction_count
  from ants
  group by ants.label
  having count(*) >= 2
  order by total desc
  limit 12;
$$;

create or replace function public.budget_spent(p_reference date default current_date)
returns table (budget_id uuid, spent numeric)
language sql
stable
as $$
  select
    b.id as budget_id,
    coalesce(sum(t.base_amount), 0)::numeric as spent
  from public.budgets b
  left join public.transactions t
    on t.user_id = b.user_id
   and t.type = 'expense'
   and (b.category_id is null or t.category_id = b.category_id)
   and (b.subcategory_id is null or t.subcategory_id = b.subcategory_id)
   and t.transaction_date between
       case when b.period = 'monthly' then date_trunc('month', p_reference)::date
            else (date_trunc('week', p_reference))::date end
       and
       case when b.period = 'monthly' then (date_trunc('month', p_reference) + interval '1 month - 1 day')::date
            else (date_trunc('week', p_reference) + interval '6 days')::date end
  where b.user_id = auth.uid() and b.is_active
  group by b.id;
$$;

create or replace function public.account_balance()
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    case
      when type in ('income', 'refund') then base_amount
      when type = 'expense' then -base_amount
      else 0
    end
  ), 0)::numeric
  from public.transactions
  where user_id = auth.uid();
$$;

-- Detección de gastos recurrentes: mismo comercio, cadencia e importe estables.
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
    where user_id = auth.uid() and type = 'expense'
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

-- Avisos automáticos cuando un límite llega a su umbral.
create or replace function public.check_budget_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row record;
begin
  for row in
    select b.id, b.name, b.amount, s.spent
    from public.budgets b
    join public.budget_spent(new.transaction_date) s on s.budget_id = b.id
    where b.user_id = new.user_id and b.is_active and b.amount > 0
  loop
    if row.spent >= row.amount then
      insert into public.notifications (user_id, kind, title, body, link)
      select new.user_id, 'budget_alert',
             format('Excediste el límite de %s', row.name),
             format('Llevás gastado %s de %s.', round(row.spent), round(row.amount)),
             format('%s:%s:exceeded', row.id, to_char(new.transaction_date, 'YYYY-MM'))
      where not exists (
        select 1 from public.notifications n
        where n.user_id = new.user_id
          and n.link = format('%s:%s:exceeded', row.id, to_char(new.transaction_date, 'YYYY-MM'))
      );
    elsif row.spent >= row.amount * 0.9 then
      insert into public.notifications (user_id, kind, title, body, link)
      select new.user_id, 'budget_alert',
             format('Vas por el 90%% de %s', row.name),
             format('Llevás gastado %s de %s.', round(row.spent), round(row.amount)),
             format('%s:%s:danger', row.id, to_char(new.transaction_date, 'YYYY-MM'))
      where not exists (
        select 1 from public.notifications n
        where n.user_id = new.user_id
          and n.link = format('%s:%s:danger', row.id, to_char(new.transaction_date, 'YYYY-MM'))
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists budget_alerts_after_transaction on public.transactions;
create trigger budget_alerts_after_transaction
  after insert on public.transactions
  for each row when (new.type = 'expense')
  execute function public.check_budget_alerts();

-- Sólo usuarios autenticados pueden ejecutar los reportes; cada función filtra por auth.uid().
do $$
declare
  target text;
begin
  foreach target in array array[
    'report_summary(date,date)', 'report_by_category(date,date)', 'report_by_subcategory(date,date)',
    'report_monthly(date,date)', 'report_daily(date,date)', 'report_merchants(date,date,integer)',
    'report_payment_methods(date,date)', 'report_ants(date,date)', 'budget_spent(date)',
    'account_balance()', 'detect_recurring()', 'reorder_categories(uuid[])'
  ] loop
    execute format('revoke all on function public.%s from public, anon;', target);
    execute format('grant execute on function public.%s to authenticated;', target);
  end loop;
end $$;
