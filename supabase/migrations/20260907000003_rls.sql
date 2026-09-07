-- Crocante · Row Level Security
-- Regla base: cada persona ve y modifica únicamente sus propios datos.
-- Los datos compartidos se habilitan sólo a través de household_members.

-- Miembro de un hogar (security definer para evitar recursión en las policies).
create or replace function public.is_household_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = target and m.user_id = auth.uid()
  );
$$;

create or replace function public.owns_transaction(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.transactions t
    where t.id = target
      and (t.user_id = auth.uid() or (t.household_id is not null and public.is_household_member(t.household_id)))
  );
$$;

create or replace function public.owns_receipt(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.receipts r where r.id = target and r.user_id = auth.uid());
$$;

create or replace function public.owns_goal(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.goals g where g.id = target and g.user_id = auth.uid());
$$;

create or replace function public.owns_budget(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.budgets b where b.id = target and b.user_id = auth.uid());
$$;

-- RLS activo en todas las tablas. Nunca se desactiva "para que funcione".
do $$
declare
  target text;
begin
  foreach target in array array[
    'profiles', 'households', 'household_members', 'categories', 'subcategories',
    'accounts', 'payment_methods', 'merchants', 'transactions', 'transaction_items',
    'receipts', 'receipt_items', 'budgets', 'budget_categories', 'goals',
    'goal_contributions', 'exchange_rates', 'categorization_rules',
    'recurring_expenses', 'ai_interactions', 'notifications'
  ] loop
    execute format('alter table public.%I enable row level security;', target);
    execute format('alter table public.%I force row level security;', target);
  end loop;
end $$;

-- Tablas con columna user_id: dueño directo.
do $$
declare
  target text;
begin
  foreach target in array array[
    'profiles', 'categories', 'subcategories', 'accounts', 'payment_methods',
    'merchants', 'receipts', 'budgets', 'goals', 'goal_contributions',
    'exchange_rates', 'categorization_rules', 'recurring_expenses',
    'ai_interactions', 'notifications'
  ] loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$s;', target);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$s;', target);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$s;', target);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$s;', target);

    execute format(
      'create policy "%1$s_select_own" on public.%1$s for select using (user_id = auth.uid());', target);
    execute format(
      'create policy "%1$s_insert_own" on public.%1$s for insert with check (user_id = auth.uid());', target);
    execute format(
      'create policy "%1$s_update_own" on public.%1$s for update using (user_id = auth.uid()) with check (user_id = auth.uid());', target);
    execute format(
      'create policy "%1$s_delete_own" on public.%1$s for delete using (user_id = auth.uid());', target);
  end loop;
end $$;

-- Movimientos: propios o del hogar al que pertenezco.
drop policy if exists "transactions_select" on public.transactions;
create policy "transactions_select" on public.transactions
  for select using (
    user_id = auth.uid()
    or (household_id is not null and public.is_household_member(household_id))
  );

drop policy if exists "transactions_insert" on public.transactions;
create policy "transactions_insert" on public.transactions
  for insert with check (
    user_id = auth.uid()
    and (household_id is null or public.is_household_member(household_id))
  );

-- Editar y borrar sólo lo propio, aunque el hogar permita verlo.
drop policy if exists "transactions_update" on public.transactions;
create policy "transactions_update" on public.transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "transactions_delete" on public.transactions;
create policy "transactions_delete" on public.transactions
  for delete using (user_id = auth.uid());

-- Tablas hijas: heredan el permiso del padre.
drop policy if exists "transaction_items_all" on public.transaction_items;
create policy "transaction_items_all" on public.transaction_items
  for all using (public.owns_transaction(transaction_id))
  with check (public.owns_transaction(transaction_id));

drop policy if exists "receipt_items_all" on public.receipt_items;
create policy "receipt_items_all" on public.receipt_items
  for all using (public.owns_receipt(receipt_id))
  with check (public.owns_receipt(receipt_id));

drop policy if exists "budget_categories_all" on public.budget_categories;
create policy "budget_categories_all" on public.budget_categories
  for all using (public.owns_budget(budget_id))
  with check (public.owns_budget(budget_id));

-- Hogares.
drop policy if exists "households_select" on public.households;
create policy "households_select" on public.households
  for select using (owner_id = auth.uid() or public.is_household_member(id));

drop policy if exists "households_insert" on public.households;
create policy "households_insert" on public.households
  for insert with check (owner_id = auth.uid());

drop policy if exists "households_update" on public.households;
create policy "households_update" on public.households
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "households_delete" on public.households;
create policy "households_delete" on public.households
  for delete using (owner_id = auth.uid());

drop policy if exists "household_members_select" on public.household_members;
create policy "household_members_select" on public.household_members
  for select using (user_id = auth.uid() or public.is_household_member(household_id));

drop policy if exists "household_members_insert" on public.household_members;
create policy "household_members_insert" on public.household_members
  for insert with check (
    user_id = auth.uid()
    or exists (select 1 from public.households h where h.id = household_id and h.owner_id = auth.uid())
  );

drop policy if exists "household_members_delete" on public.household_members;
create policy "household_members_delete" on public.household_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.households h where h.id = household_id and h.owner_id = auth.uid())
  );
