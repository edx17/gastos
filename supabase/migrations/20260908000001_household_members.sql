-- Modo hogar / pareja
--
-- Una persona del hogar puede no tener cuenta en Crocante (mi pareja no usa la app,
-- pero paga la mitad del supermercado). Por eso los miembros existen por sí mismos y
-- el vínculo con una cuenta es opcional, y por eso "quién pagó" apunta al miembro.

alter table public.household_members
  alter column user_id drop not null,
  add column if not exists invite_email text,
  add column if not exists color text not null default '#2f9e8f',
  add column if not exists is_active boolean not null default true;

-- Un mismo usuario no puede estar dos veces en el hogar, pero sí puede haber varios
-- miembros sin cuenta asociada: un índice único parcial permite varios NULL.
alter table public.household_members
  drop constraint if exists household_members_household_id_user_id_key;

create unique index if not exists household_members_unique_account
  on public.household_members (household_id, user_id)
  where user_id is not null;

-- "Pagado por" pasa a referirse al miembro del hogar, no a una cuenta.
alter table public.transactions
  drop constraint if exists transactions_paid_by_fkey;

alter table public.transactions
  add constraint transactions_paid_by_fkey
    foreign key (paid_by) references public.household_members(id) on delete set null;

create index if not exists household_members_household_idx on public.household_members (household_id);
create index if not exists transactions_paid_by_idx on public.transactions (paid_by) where paid_by is not null;

-- El dueño del hogar administra los miembros; cada quien se ve a sí mismo.
drop policy if exists "household_members_select" on public.household_members;
create policy "household_members_select" on public.household_members
  for select using (user_id = auth.uid() or public.is_household_member(household_id));

drop policy if exists "household_members_insert" on public.household_members;
create policy "household_members_insert" on public.household_members
  for insert with check (
    exists (select 1 from public.households h where h.id = household_id and h.owner_id = auth.uid())
    or user_id = auth.uid()
  );

drop policy if exists "household_members_update" on public.household_members;
create policy "household_members_update" on public.household_members
  for update using (
    exists (select 1 from public.households h where h.id = household_id and h.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.households h where h.id = household_id and h.owner_id = auth.uid())
  );

/**
 * Balance del hogar en un período.
 *
 * Devuelve, por miembro: cuánto puso y cuánto le correspondía según su parte.
 * Un balance positivo significa que puso de más y el resto le debe.
 */
create or replace function public.household_balance(p_household uuid, p_from date, p_to date)
returns table (
  member_id uuid,
  display_name text,
  color text,
  share numeric,
  paid numeric,
  owed numeric,
  balance numeric
)
language sql
stable
as $$
  with members as (
    select m.id, m.display_name, m.color, m.share
    from public.household_members m
    where m.household_id = p_household and m.is_active
  ),
  scope as (
    select t.paid_by, t.base_amount
    from public.transactions t
    where t.household_id = p_household
      and t.type = 'expense'
      and t.transaction_date between p_from and p_to
  ),
  totals as (
    select coalesce(sum(base_amount), 0) as total from scope
  ),
  shares as (
    select coalesce(nullif(sum(share), 0), 1) as total_share from members
  )
  select
    m.id as member_id,
    m.display_name,
    m.color,
    round(m.share / shares.total_share, 4) as share,
    coalesce((select sum(s.base_amount) from scope s where s.paid_by = m.id), 0)::numeric as paid,
    round(totals.total * (m.share / shares.total_share), 2) as owed,
    round(
      coalesce((select sum(s.base_amount) from scope s where s.paid_by = m.id), 0)
      - totals.total * (m.share / shares.total_share),
      2
    ) as balance
  from members m, totals, shares
  order by paid desc;
$$;

revoke all on function public.household_balance(uuid, date, date) from public, anon;
grant execute on function public.household_balance(uuid, date, date) to authenticated;
