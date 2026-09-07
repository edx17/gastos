-- Crocante · esquema inicial
-- Todas las tablas llevan id uuid, created_at y (cuando corresponde) updated_at.

create extension if not exists "pgcrypto";
create extension if not exists "unaccent";

-- ---------------------------------------------------------------- enums

do $$ begin
  create type transaction_type as enum ('expense', 'income', 'transfer', 'refund', 'adjustment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transaction_source as enum ('manual', 'natural_language', 'receipt', 'import', 'ai', 'seed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type category_kind as enum ('expense', 'income', 'transfer', 'investment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type budget_period as enum ('weekly', 'monthly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_kind as enum ('cash', 'debit', 'credit', 'transfer', 'wallet', 'other');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------ utilities

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Texto normalizado (sin acentos, minúsculas) usado para comparar comercios.
create or replace function public.normalize_text(value text)
returns text
language sql
immutable
as $$
  select coalesce(lower(unaccent(trim(value))), '');
$$;

-- --------------------------------------------------------------- tables

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null default 'Mi cuenta',
  avatar_url text,
  base_currency text not null default 'ARS',
  locale text not null default 'es-AR',
  timezone text not null default 'America/Argentina/Buenos_Aires',
  ai_preferences jsonb not null default jsonb_build_object(
    'autosave_threshold', 0.9,
    'ask_threshold', 0.7,
    'learn_from_corrections', true,
    'share_data_with_ai', true
  ),
  onboarding_done boolean not null default false,
  favorite_category_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  base_currency text not null default 'ARS',
  split_mode text not null default 'equal' check (split_mode in ('equal', 'income_ratio', 'custom')),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member', 'viewer')),
  display_name text not null default '',
  share numeric(5,4) not null default 0.5,
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  kind category_kind not null default 'expense',
  icon text not null default 'Tag',
  color text not null default '#0f766e',
  position integer not null default 0,
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (user_id, slug)
);

create table if not exists public.subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (category_id, slug)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  currency text not null default 'ARS',
  kind text not null default 'checking' check (kind in ('checking', 'savings', 'cash', 'investment', 'wallet')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind payment_kind not null default 'other',
  issuer text,
  -- Solo los últimos 4 dígitos: nunca se guarda un número de tarjeta completo.
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  default_category_id uuid references public.categories(id) on delete set null,
  default_subcategory_id uuid references public.subcategories(id) on delete set null,
  tax_id text,
  created_at timestamptz not null default now(),
  unique (user_id, normalized_name)
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid,
  storage_path text,
  thumbnail_path text,
  merchant_name text,
  merchant_tax_id text,
  receipt_number text,
  receipt_date date,
  currency text not null default 'ARS',
  subtotal numeric(14,2),
  discount numeric(14,2),
  tax numeric(14,2),
  total numeric(14,2),
  ocr_raw_text text,
  ocr_confidence numeric(4,3),
  ocr_provider text not null default 'mock',
  parsed_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  type transaction_type not null default 'expense',
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'ARS',
  base_amount numeric(14,2) not null,
  base_currency text not null default 'ARS',
  exchange_rate numeric(14,6) not null default 1,
  description text not null,
  merchant_id uuid references public.merchants(id) on delete set null,
  merchant_name text,
  category_id uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.subcategories(id) on delete set null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  transaction_date date not null default current_date,
  notes text,
  source transaction_source not null default 'manual',
  ai_confidence numeric(4,3),
  receipt_id uuid references public.receipts(id) on delete set null,
  is_recurring boolean not null default false,
  recurring_id uuid,
  paid_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.receipts
  drop constraint if exists receipts_transaction_id_fkey,
  add constraint receipts_transaction_id_fkey
    foreign key (transaction_id) references public.transactions(id) on delete set null;

create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  description text not null,
  quantity numeric(10,3) not null default 1,
  unit_price numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  category_id uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.subcategories(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  description text not null,
  quantity numeric(10,3) not null default 1,
  unit_price numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  category_id uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.subcategories(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  period budget_period not null default 'monthly',
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'ARS',
  category_id uuid references public.categories(id) on delete cascade,
  subcategory_id uuid references public.subcategories(id) on delete cascade,
  alert_thresholds numeric(3,2)[] not null default '{0.8,0.9,1}',
  starts_on date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Presupuestos que abarcan varias categorías a la vez.
create table if not exists public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (budget_id, category_id)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  description text,
  target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0,
  currency text not null default 'ARS',
  target_date date,
  monthly_contribution numeric(14,2),
  icon text not null default 'Target',
  color text not null default '#0f766e',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null,
  currency text not null default 'ARS',
  note text,
  contributed_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  base_currency text not null default 'ARS',
  quote_currency text not null,
  rate numeric(16,6) not null check (rate > 0),
  rate_date date not null default current_date,
  source text not null default 'manual' check (source in ('manual', 'api', 'seed')),
  created_at timestamptz not null default now(),
  unique (user_id, base_currency, quote_currency, rate_date)
);

create table if not exists public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null,
  match_type text not null default 'contains' check (match_type in ('exact', 'contains')),
  category_id uuid not null references public.categories(id) on delete cascade,
  subcategory_id uuid references public.subcategories(id) on delete set null,
  strategy text not null default 'ask' check (strategy in ('always', 'ask')),
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (user_id, pattern)
);

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  label text not null,
  average_amount numeric(14,2),
  currency text not null default 'ARS',
  cadence text,
  occurrences integer not null default 0,
  last_date date,
  next_estimated_date date,
  category_id uuid references public.categories(id) on delete set null,
  confirmed boolean,
  created_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('parse', 'categorize', 'insight', 'query', 'receipt')),
  provider text not null,
  model text not null default '',
  input text not null default '',
  output text not null default '',
  confidence numeric(4,3),
  latency_ms integer not null default 0,
  success boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'system' check (kind in ('budget_alert', 'goal_progress', 'recurring_detected', 'system')),
  title text not null,
  body text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------- indexes

create index if not exists transactions_user_date_idx on public.transactions (user_id, transaction_date desc);
create index if not exists transactions_user_category_idx on public.transactions (user_id, category_id);
create index if not exists transactions_user_type_idx on public.transactions (user_id, type);
create index if not exists transactions_household_idx on public.transactions (household_id) where household_id is not null;
create index if not exists transactions_merchant_idx on public.transactions (user_id, merchant_name);
create index if not exists transaction_items_tx_idx on public.transaction_items (transaction_id);
create index if not exists receipts_user_idx on public.receipts (user_id, created_at desc);
create index if not exists receipt_items_receipt_idx on public.receipt_items (receipt_id);
create index if not exists categories_user_idx on public.categories (user_id, position);
create index if not exists subcategories_category_idx on public.subcategories (category_id, position);
create index if not exists budgets_user_idx on public.budgets (user_id) where is_active;
create index if not exists goals_user_idx on public.goals (user_id) where not is_archived;
create index if not exists ai_interactions_user_idx on public.ai_interactions (user_id, created_at desc);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ------------------------------------------------------------- triggers

do $$
declare
  target text;
begin
  foreach target in array array[
    'profiles', 'households', 'categories', 'subcategories', 'transactions',
    'budgets', 'goals', 'categorization_rules'
  ] loop
    execute format(
      'drop trigger if exists touch_%1$s on public.%1$s;
       create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();',
      target
    );
  end loop;
end $$;
