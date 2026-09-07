-- Comprobaciones sobre una base recién migrada.
-- Verifican: alta de usuario, RLS entre cuentas, seed y reportes.

\set ON_ERROR_STOP on

-- Dos usuarios distintos.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'ana@crocante.test', '{"display_name":"Ana"}'),
  ('22222222-2222-4222-8222-222222222222', 'beto@crocante.test', '{"display_name":"Beto"}')
on conflict do nothing;

do $$
declare
  categories integer;
  methods integer;
begin
  select count(*) into categories from public.categories where user_id = '11111111-1111-4111-8111-111111111111';
  select count(*) into methods from public.payment_methods where user_id = '11111111-1111-4111-8111-111111111111';
  assert categories >= 12, format('Se esperaban las categorías por defecto, hay %s', categories);
  assert methods >= 5, format('Se esperaban los medios de pago por defecto, hay %s', methods);
  raise notice 'OK · alta de cuenta: % categorías, % medios de pago', categories, methods;
end $$;

-- Datos de ejemplo para Ana.
do $$
declare
  inserted integer;
begin
  select public.seed_demo_data('11111111-1111-4111-8111-111111111111') into inserted;
  assert inserted between 120 and 320, format('Se esperaban ~200 movimientos, se generaron %s', inserted);
  raise notice 'OK · seed: % movimientos', inserted;
end $$;

-- Reportes en el contexto de Ana.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  summary record;
  categories integer;
  monthly integer;
  ants integer;
  recurring integer;
  balance numeric;
begin
  select * into summary from public.report_summary((current_date - interval '30 days')::date, current_date);
  assert summary.expense > 0, 'El reporte de gastos vino vacío';
  assert summary.transaction_count > 0, 'El resumen no contó movimientos';

  select count(*) into categories from public.report_by_category((current_date - interval '180 days')::date, current_date);
  select count(*) into monthly from public.report_monthly((current_date - interval '180 days')::date, current_date);
  select count(*) into ants from public.report_ants((current_date - interval '180 days')::date, current_date);
  select count(*) into recurring from public.detect_recurring();
  select public.account_balance() into balance;

  assert categories > 3, 'Faltan categorías en el reporte';
  assert monthly = 7, format('Se esperaban 7 meses en la serie, hay %s', monthly);
  assert recurring > 0, 'No se detectó ningún gasto recurrente';
  raise notice 'OK · reportes: % categorías, % meses, % grupos hormiga, % recurrentes, saldo %',
    categories, monthly, ants, recurring, round(balance);
end $$;

-- Los presupuestos calculan lo gastado en el período.
do $$
declare
  spent numeric;
begin
  select coalesce(max(s.spent), 0) into spent from public.budget_spent(current_date) s;
  assert spent >= 0, 'El cálculo de presupuesto falló';
  raise notice 'OK · presupuestos: máximo gastado %', round(spent);
end $$;

-- RLS: Beto no puede ver ni tocar los datos de Ana.
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

do $$
declare
  visible integer;
  updated integer;
begin
  select count(*) into visible from public.transactions;
  assert visible = 0, format('Beto no debería ver movimientos de Ana, ve %s', visible);

  with attempt as (
    update public.transactions set description = 'hackeado' returning 1
  )
  select count(*) into updated from attempt;
  assert updated = 0, 'Beto pudo modificar movimientos ajenos';

  select count(*) into visible from public.categories where user_id = '11111111-1111-4111-8111-111111111111';
  assert visible = 0, 'Beto ve categorías ajenas';

  raise notice 'OK · RLS: aislamiento entre cuentas verificado';
end $$;

-- Un usuario sí ve lo propio.
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare
  visible integer;
begin
  select count(*) into visible from public.transactions;
  assert visible > 100, format('Ana debería ver sus movimientos, ve %s', visible);
  raise notice 'OK · RLS: Ana ve % movimientos propios', visible;
end $$;

reset role;
