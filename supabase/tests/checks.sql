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

-- Planes: los límites se aplican en la base, no sólo en la interfaz.
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  plan text;
  usage record;
begin
  select public.current_plan_code() into plan;
  assert plan = 'free', format('Sin suscripción debería ser gratis, es %s', plan);

  select * into usage from public.plan_usage();
  -- Los datos de ejemplo no consumen cupo.
  assert usage.transactions = 0, format('El seed no debería consumir cupo, cuenta %s', usage.transactions);

  raise notice 'OK · plan: cuenta sin suscripción cae en gratis y el seed no gasta cupo';
end $$;

-- Una cuenta gratis no puede leer tickets por foto.
do $$
declare
  blocked boolean := false;
begin
  begin
    insert into public.receipts (user_id, currency, total)
    values ('11111111-1111-4111-8111-111111111111', 'ARS', 1000);
  exception when others then
    blocked := true;
    assert sqlerrm like '%plan Personal%', format('Mensaje inesperado: %s', sqlerrm);
  end;
  assert blocked, 'Una cuenta gratis pudo guardar un ticket';
  raise notice 'OK · plan: los tickets quedan fuera del plan gratis';
end $$;

-- Y tampoco puede pasarse de los movimientos del mes.
do $$
declare
  cat uuid;
  i integer;
  blocked boolean := false;
begin
  select id into cat from public.categories
  where user_id = '11111111-1111-4111-8111-111111111111' and slug = 'alimentacion';

  for i in 1..30 loop
    insert into public.transactions (user_id, type, amount, base_amount, description, category_id, transaction_date, source)
    values ('11111111-1111-4111-8111-111111111111', 'expense', 100, 100, 'Prueba de cupo', cat, current_date, 'manual');
  end loop;

  begin
    insert into public.transactions (user_id, type, amount, base_amount, description, category_id, transaction_date, source)
    values ('11111111-1111-4111-8111-111111111111', 'expense', 100, 100, 'Uno de más', cat, current_date, 'manual');
  exception when others then
    blocked := true;
  end;

  assert blocked, 'El plan gratis dejó pasar el movimiento 31 del mes';
  raise notice 'OK · plan: el movimiento 31 del mes se corta en la base';
end $$;

-- Nadie se mejora el plan solo desde el navegador.
do $$
declare
  inserted integer := 0;
begin
  begin
    with intento as (
      insert into public.subscriptions (user_id, plan_code, status)
      values ('11111111-1111-4111-8111-111111111111', 'empresarial', 'active')
      returning 1
    )
    select count(*) into inserted from intento;
  exception when others then
    inserted := 0;
  end;
  assert inserted = 0, 'Una cuenta pudo darse a sí misma un plan pago';
  raise notice 'OK · plan: no se puede auto-asignar una suscripción';
end $$;

reset role;

-- El cobro (webhook) sí puede: corre con la clave de servicio, fuera de las policies.
insert into public.subscriptions (user_id, plan_code, status, current_period_end, provider, external_id)
values ('11111111-1111-4111-8111-111111111111', 'hogar', 'active', now() + interval '30 days', 'mercadopago', 'preapproval-test')
on conflict (user_id) do update set plan_code = excluded.plan_code, status = excluded.status;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  plan text;
begin
  select public.current_plan_code() into plan;
  assert plan = 'hogar', format('Con suscripción activa debería ser hogar, es %s', plan);
  raise notice 'OK · plan: la suscripción activa desbloquea el plan Hogar';
end $$;

-- Modo hogar: quién puso cuánto y quién le debe a quién.
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  hid uuid;
  ana uuid;
  beto uuid;
  cat uuid;
  row record;
begin
  insert into public.households (name, owner_id)
  values ('Casa', '11111111-1111-4111-8111-111111111111')
  returning id into hid;

  insert into public.household_members (household_id, user_id, role, display_name, share)
  values (hid, '11111111-1111-4111-8111-111111111111', 'owner', 'Ana', 0.5)
  returning id into ana;

  -- Beto participa del hogar aunque no tenga cuenta en la app.
  insert into public.household_members (household_id, user_id, role, display_name, share, invite_email)
  values (hid, null, 'member', 'Beto', 0.5, 'beto@crocante.test')
  returning id into beto;

  select id into cat from public.categories
  where user_id = '11111111-1111-4111-8111-111111111111' and slug = 'alimentacion';

  insert into public.transactions (user_id, household_id, type, amount, base_amount, description,
    category_id, transaction_date, paid_by, source)
  values
    ('11111111-1111-4111-8111-111111111111', hid, 'expense', 600000, 600000, 'Supermercado', cat, current_date, ana, 'manual'),
    ('11111111-1111-4111-8111-111111111111', hid, 'expense', 450000, 450000, 'Expensas', cat, current_date, beto, 'manual');

  for row in
    select * from public.household_balance(hid, current_date - 30, current_date)
  loop
    if row.display_name = 'Ana' then
      assert row.paid = 600000, format('Ana puso %s', row.paid);
      assert row.balance = 75000, format('Ana debería estar +75000, está en %s', row.balance);
    else
      assert row.paid = 450000, format('Beto puso %s', row.paid);
      assert row.balance = -75000, format('Beto debería estar -75000, está en %s', row.balance);
    end if;
  end loop;

  raise notice 'OK · hogar: gastos compartidos y balance 50/50 calculados';
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

-- Compra y venta de moneda extranjera: los pesos salen del saldo, los dólares
-- se acumulan como tenencia.
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  ana uuid := '11111111-1111-4111-8111-111111111111';
  before numeric;
  after numeric;
  holding record;
  found_usd boolean := false;
begin
  select public.account_balance() into before;

  -- Compra 100 a 1450 y otra de 50 a 1550: 200.000 pesos por 150 dólares.
  insert into public.transactions (user_id, type, amount, currency, base_amount, base_currency,
    exchange_rate, exchange_kind, description, transaction_date, source)
  values
    (ana, 'transfer', 100, 'USD', 145000, 'ARS', 1450, 'buy', 'Compra de dólares', current_date, 'manual'),
    (ana, 'transfer', 50, 'USD', 77500, 'ARS', 1550, 'buy', 'Compra de dólares', current_date, 'manual'),
    (ana, 'transfer', 30, 'USD', 48000, 'ARS', 1600, 'sell', 'Venta de dólares', current_date, 'manual');

  select public.account_balance() into after;
  -- Salieron 145000 + 77500 y volvieron 48000.
  assert after - before = -174500, format('El saldo debería bajar 174500, cambió %s', after - before);

  for holding in select * from public.currency_holdings() loop
    if holding.currency = 'USD' then
      found_usd := true;
      assert holding.amount = 120, format('Deberían quedar 120 dólares, hay %s', holding.amount);
      assert holding.invested = 174500, format('Puso 174500, dice %s', holding.invested);
      -- 222500 pesos por 150 dólares comprados.
      assert holding.avg_rate = 1483.33, format('El promedio de compra debería ser 1483.33, es %s', holding.avg_rate);
    end if;
  end loop;
  assert found_usd, 'La tenencia en dólares no apareció';

  raise notice 'OK · cambio: 120 dólares en cartera, saldo en pesos descontado';
end $$;

-- Un cambio de moneda no es ni gasto ni ingreso: no puede ensuciar el resumen.
do $$
declare
  spent numeric;
begin
  select expense into spent from public.report_summary(current_date - 1, current_date + 1);
  assert spent is not null, 'El resumen no devolvió gastos';
  assert not exists (
    select 1 from public.transactions
    where exchange_kind is not null and type <> 'transfer'
  ), 'Un cambio de moneda quedó guardado con un tipo que no es transferencia';
  raise notice 'OK · cambio: las compras de dólares no cuentan como gasto';
end $$;

-- La restricción no deja marcar como cambio algo que no es transferencia.
do $$
declare
  ana uuid := '11111111-1111-4111-8111-111111111111';
begin
  begin
    insert into public.transactions (user_id, type, amount, currency, base_amount, base_currency,
      exchange_kind, description, transaction_date, source)
    values (ana, 'expense', 100, 'USD', 145000, 'ARS', 'buy', 'Mal cargado', current_date, 'manual');
    raise exception 'Se pudo guardar un gasto marcado como cambio de moneda';
  exception
    when check_violation then
      raise notice 'OK · cambio: un gasto no puede marcarse como compra de moneda';
  end;
end $$;

-- Cuentas: saldo declarado, historial automático y patrimonio convertido.
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  ana uuid := '11111111-1111-4111-8111-111111111111';
  fima uuid;
  verdes uuid;
  snapshots integer;
  total numeric;
  stamped date;
begin
  insert into public.accounts (user_id, name, currency, kind, balance, institution)
  values (ana, 'FIMA Premium', 'ARS', 'investment', 2500000, 'Galicia')
  returning id into fima;

  insert into public.accounts (user_id, name, currency, kind, balance)
  values (ana, 'Dólares en casa', 'USD', 'cash', 1000)
  returning id into verdes;

  -- El alta ya deja el primer punto del historial y sella la fecha.
  select count(*) into snapshots from public.account_balances where account_id = fima;
  assert snapshots = 1, format('El alta debería dejar un saldo en el historial, dejó %s', snapshots);

  select balance_updated_at into stamped from public.accounts where id = fima;
  assert stamped = current_date, format('La fecha del saldo quedó en %s', stamped);

  -- Corregir el saldo el mismo día pisa el punto, no agrega uno nuevo.
  update public.accounts set balance = 2600000 where id = fima;
  select count(*) into snapshots from public.account_balances where account_id = fima;
  assert snapshots = 1, format('Dos saldos para el mismo día: %s', snapshots);
  assert (select balance from public.account_balances where account_id = fima) = 2600000,
    'El historial no tomó la corrección';

  -- Renombrar no toca el historial.
  update public.accounts set name = 'FIMA' where id = fima;
  select count(*) into snapshots from public.account_balances where account_id = fima;
  assert snapshots = 1, format('Renombrar agregó un saldo: %s', snapshots);

  -- Patrimonio: los pesos tal cual, los dólares a la cotización cargada.
  insert into public.exchange_rates (user_id, base_currency, quote_currency, rate, rate_date)
  values (ana, 'ARS', 'USD', 1500, current_date)
  on conflict (user_id, base_currency, quote_currency, rate_date)
  do update set rate = excluded.rate;

  select public.net_worth() into total;
  -- 2.600.000 + 1000 × 1500, más la cuenta principal que crea el alta (en cero).
  assert total = 4100000, format('El patrimonio debería ser 4100000, da %s', total);

  -- Una cuenta marcada para no sumar queda afuera.
  update public.accounts set include_in_net_worth = false where id = verdes;
  select public.net_worth() into total;
  assert total = 2600000, format('Sin los dólares debería quedar 2600000, da %s', total);

  raise notice 'OK · cuentas: saldo declarado, historial por día y patrimonio convertido';
end $$;

-- El historial de otra persona no se ve. Beto tiene el suyo (el alta le crea una
-- cuenta), así que lo que se cuenta son los de Ana.
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

do $$
declare
  ajenos integer;
  updated integer;
begin
  select count(*) into ajenos from public.account_balances
  where user_id = '11111111-1111-4111-8111-111111111111';
  assert ajenos = 0, format('Beto ve %s saldos de Ana', ajenos);

  select count(*) into ajenos from public.accounts
  where user_id = '11111111-1111-4111-8111-111111111111';
  assert ajenos = 0, format('Beto ve %s cuentas de Ana', ajenos);

  with attempt as (
    update public.accounts set balance = 999999 returning 1
  )
  select count(*) into updated from attempt;
  assert updated <= 1, 'Beto pudo tocar saldos ajenos';

  raise notice 'OK · RLS: las cuentas y su historial no cruzan entre personas';
end $$;

reset role;
