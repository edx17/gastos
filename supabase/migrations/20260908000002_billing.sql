-- Planes, suscripciones y límites de uso
--
-- Los límites se aplican acá, en la base. La interfaz los muestra y evita que la
-- persona choque contra una pared, pero quien intente saltarse el front se choca
-- igual: un plan gratis no puede escribir más de lo que su plan permite.

create table if not exists public.plans (
  code text primary key,
  name text not null,
  price numeric(12,2) not null default 0,
  currency text not null default 'ARS',
  limits jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_code text not null references public.plans(code),
  status text not null default 'active'
    check (status in ('trialing', 'active', 'past_due', 'canceled', 'paused')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  /** Proveedor de cobro: mercadopago, stripe, manual… */
  provider text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists subscriptions_status_idx on public.subscriptions (status, current_period_end);

-- Registro de cobros, para poder responder "¿por qué me cobraron esto?".
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete cascade,
  kind text not null,
  provider text not null default 'manual',
  external_id text,
  amount numeric(12,2),
  currency text,
  payload jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists touch_plans on public.plans;
create trigger touch_plans before update on public.plans
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_subscriptions on public.subscriptions;
create trigger touch_subscriptions before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------- RLS

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;
alter table public.subscription_events enable row level security;
alter table public.subscription_events force row level security;

-- El catálogo de planes es público: la pantalla de precios lo lee sin sesión.
drop policy if exists "plans_read" on public.plans;
create policy "plans_read" on public.plans for select using (is_active);

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
  for select using (user_id = auth.uid());

-- Nadie se cambia el plan desde el navegador: eso lo hace el webhook de cobro
-- con la clave de servicio, que no pasa por estas policies.
drop policy if exists "subscription_events_select_own" on public.subscription_events;
create policy "subscription_events_select_own" on public.subscription_events
  for select using (user_id = auth.uid());

-- ------------------------------------------------------- plan y límites

/** Código del plan vigente para una cuenta. Sin suscripción activa: gratis. */
create or replace function public.plan_code_for(target uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.plan_code
      from public.subscriptions s
      where s.user_id = target
        and s.status in ('active', 'trialing')
        and (s.current_period_end is null or s.current_period_end > now())
      limit 1
    ),
    'free'
  );
$$;

create or replace function public.current_plan_code()
returns text
language sql
stable
as $$
  select public.plan_code_for(auth.uid());
$$;

create or replace function public.plan_limits_for(target uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.limits, '{}'::jsonb)
  from public.plans p
  where p.code = public.plan_code_for(target);
$$;

/** Un límite puntual. `null` significa "sin tope". */
create or replace function public.plan_limit(target uuid, key text)
returns numeric
language sql
stable
as $$
  select case
    when jsonb_typeof(public.plan_limits_for(target) -> key) in ('null', 'undefined') then null
    when public.plan_limits_for(target) -> key is null then null
    when jsonb_typeof(public.plan_limits_for(target) -> key) = 'boolean'
      then case when (public.plan_limits_for(target) ->> key)::boolean then 1 else 0 end
    else (public.plan_limits_for(target) ->> key)::numeric
  end;
$$;

-- Las cargas masivas (datos de ejemplo, importaciones del propio sistema) no
-- consumen cupo: no son uso real de la persona.
create or replace function public.quota_bypassed()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('crocante.skip_quota', true), '') = 'on';
$$;

-- --------------------------------------------------------------- uso

/** Uso del mes en curso para una cuenta. */
create or replace function public.plan_usage_for(target uuid)
returns table (
  transactions integer,
  receipts integer,
  ai_queries integer,
  budgets integer,
  goals integer,
  household_members integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer from public.transactions t
      where t.user_id = target
        and t.source <> 'seed'
        and t.created_at >= date_trunc('month', now())),
    (select count(*)::integer from public.receipts r
      where r.user_id = target and r.created_at >= date_trunc('month', now())),
    (select count(*)::integer from public.ai_interactions a
      where a.user_id = target
        and (a.kind = 'query' or a.provider <> 'mock')
        and a.created_at >= date_trunc('month', now())),
    (select count(*)::integer from public.budgets b where b.user_id = target and b.is_active),
    (select count(*)::integer from public.goals g where g.user_id = target and not g.is_archived),
    (select count(*)::integer from public.household_members m
      join public.households h on h.id = m.household_id
      where h.owner_id = target and m.is_active);
$$;

create or replace function public.plan_usage()
returns table (
  transactions integer,
  receipts integer,
  ai_queries integer,
  budgets integer,
  goals integer,
  household_members integer
)
language sql
stable
as $$
  select * from public.plan_usage_for(auth.uid());
$$;

-- ------------------------------------------------------- aplicación

/**
 * Corta la operación cuando el plan no da para más.
 * El mensaje es para leer; el hint lleva la marca que usa la interfaz para
 * ofrecer la mejora de plan.
 */
create or replace function public.deny_over_quota(feature text, message text)
returns void
language plpgsql
as $$
begin
  raise exception '%', message using hint = 'PLAN_LIMIT:' || feature, errcode = 'P0001';
end;
$$;

create or replace function public.enforce_transaction_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed numeric;
  used integer;
begin
  if public.quota_bypassed() or new.source = 'seed' then
    return new;
  end if;

  allowed := public.plan_limit(new.user_id, 'transactions_per_month');
  if allowed is null then
    return new;
  end if;

  select count(*) into used
  from public.transactions t
  where t.user_id = new.user_id
    and t.source <> 'seed'
    and t.created_at >= date_trunc('month', now());

  if used >= allowed then
    perform public.deny_over_quota(
      'transactions',
      format('Llegaste a los %s movimientos de este mes que incluye tu plan.', allowed)
    );
  end if;
  return new;
end;
$$;

create or replace function public.enforce_receipt_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed numeric;
  used integer;
begin
  if public.quota_bypassed() then
    return new;
  end if;

  allowed := public.plan_limit(new.user_id, 'receipts_per_month');

  if allowed is not null and allowed <= 0 then
    perform public.deny_over_quota(
      'receipts',
      'La lectura de tickets por foto está disponible desde el plan Personal.'
    );
  end if;

  if allowed is not null then
    select count(*) into used
    from public.receipts r
    where r.user_id = new.user_id and r.created_at >= date_trunc('month', now());

    if used >= allowed then
      perform public.deny_over_quota(
        'receipts',
        format('Llegaste a los %s tickets de este mes que incluye tu plan.', allowed)
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_budget_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed numeric;
  used integer;
begin
  if public.quota_bypassed() then
    return new;
  end if;

  allowed := public.plan_limit(new.user_id, 'budgets');
  if allowed is null then
    return new;
  end if;

  select count(*) into used from public.budgets b where b.user_id = new.user_id and b.is_active;
  if used >= allowed then
    perform public.deny_over_quota(
      'budgets',
      format('Tu plan incluye %s límite(s) de gasto. Podés editar el que tenés o pasar a Personal.', allowed)
    );
  end if;
  return new;
end;
$$;

create or replace function public.enforce_goal_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed numeric;
  used integer;
begin
  if public.quota_bypassed() then
    return new;
  end if;

  allowed := public.plan_limit(new.user_id, 'goals');
  if allowed is null then
    return new;
  end if;

  select count(*) into used from public.goals g where g.user_id = new.user_id and not g.is_archived;
  if used >= allowed then
    perform public.deny_over_quota(
      'goals',
      format('Tu plan incluye %s meta(s) de ahorro. Podés editar la que tenés o pasar a Personal.', allowed)
    );
  end if;
  return new;
end;
$$;

create or replace function public.enforce_household_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
  allowed numeric;
  used integer;
begin
  if public.quota_bypassed() then
    return new;
  end if;

  select h.owner_id into owner from public.households h where h.id = new.household_id;
  if owner is null then
    return new;
  end if;

  allowed := public.plan_limit(owner, 'household_members');

  if allowed is not null and allowed <= 0 then
    perform public.deny_over_quota(
      'household',
      'Los gastos compartidos están disponibles desde el plan Hogar.'
    );
  end if;

  if allowed is not null then
    select count(*) into used
    from public.household_members m
    where m.household_id = new.household_id and m.is_active;

    if used >= allowed then
      perform public.deny_over_quota(
        'household',
        format('Tu plan permite %s integrantes en el hogar.', allowed)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists quota_transactions on public.transactions;
create trigger quota_transactions before insert on public.transactions
  for each row execute function public.enforce_transaction_quota();

drop trigger if exists quota_receipts on public.receipts;
create trigger quota_receipts before insert on public.receipts
  for each row execute function public.enforce_receipt_quota();

drop trigger if exists quota_budgets on public.budgets;
create trigger quota_budgets before insert on public.budgets
  for each row execute function public.enforce_budget_quota();

drop trigger if exists quota_goals on public.goals;
create trigger quota_goals before insert on public.goals
  for each row execute function public.enforce_goal_quota();

drop trigger if exists quota_household on public.household_members;
create trigger quota_household before insert on public.household_members
  for each row execute function public.enforce_household_quota();

/**
 * Cupo de consultas a modelos de IA. Lo llaman las Edge Functions ANTES de
 * gastar plata en el proveedor, no después.
 */
create or replace function public.consume_ai_quota()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed numeric;
  used integer;
begin
  allowed := public.plan_limit(auth.uid(), 'ai_queries_per_month');
  if allowed is null then
    return -1; -- sin tope
  end if;

  select count(*) into used
  from public.ai_interactions a
  where a.user_id = auth.uid()
    and (a.kind = 'query' or a.provider <> 'mock')
    and a.created_at >= date_trunc('month', now());

  if used >= allowed then
    perform public.deny_over_quota(
      'ai_queries',
      format('Usaste las %s consultas con IA de este mes que incluye tu plan.', allowed)
    );
  end if;

  return (allowed - used)::integer;
end;
$$;

do $$
declare
  target text;
begin
  foreach target in array array[
    'current_plan_code()', 'plan_usage()', 'consume_ai_quota()'
  ] loop
    execute format('revoke all on function public.%s from public, anon;', target);
    execute format('grant execute on function public.%s to authenticated;', target);
  end loop;
end $$;

grant select on public.plans to anon, authenticated;
