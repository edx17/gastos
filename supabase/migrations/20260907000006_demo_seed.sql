-- Crocante · datos de ejemplo
-- Genera ~200 movimientos con contexto argentino para probar reportes.
-- Uso:  select public.seed_demo_data(auth.uid());

create or replace function public.seed_demo_data(target uuid, months_back integer default 6)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  pattern record;
  month_offset integer;
  month_start date;
  days_in_month integer;
  last_day integer;
  inflation numeric;
  occurrences integer;
  i integer;
  day_of_month integer;
  amount numeric;
  merchant text;
  cat_id uuid;
  sub_id uuid;
  method_id uuid;
  inserted integer := 0;
begin
  if target is null then
    raise exception 'Necesito un user_id para generar los datos de ejemplo.';
  end if;

  -- Los datos de ejemplo no son uso real: no consumen el cupo del plan.
  perform set_config('crocante.skip_quota', 'on', true);

  perform public.seed_user_defaults(target);

  create temporary table if not exists demo_patterns (
    category_slug text,
    subcategory_slug text,
    merchants text[],
    min_amount numeric,
    max_amount numeric,
    per_month numeric,
    recurring boolean,
    label text
  ) on commit drop;
  delete from demo_patterns;

  insert into demo_patterns values
    ('alimentacion','supermercado', array['Carrefour','Coto','Día%','Jumbo'], 28000, 96000, 2, false, null),
    ('alimentacion','verduleria', array['Verdulería del barrio'], 6000, 18000, 1.5, false, null),
    ('alimentacion','carniceria', array['Carnicería La Estrella'], 12000, 38000, 1, false, null),
    ('alimentacion','panaderia', array['Panadería Los Dos Hermanos'], 2500, 7000, 2, false, null),
    ('alimentacion','delivery', array['PedidosYa','Rappi'], 9000, 26000, 2, false, null),
    ('alimentacion','restaurante', array['Parrilla Don Julio','Sushi Club'], 18000, 62000, 1, false, null),
    ('alimentacion','cafe', array['Starbucks','Havanna','Café de la esquina'], 3000, 9000, 2.5, false, null),
    ('alimentacion','comida-rapida', array['McDonald''s','Mostaza'], 7000, 19000, 1, false, null),
    ('transporte','combustible', array['YPF','Shell','Axion'], 22000, 48000, 1.5, false, null),
    ('transporte','transporte-publico', array['SUBE'], 3000, 9000, 1, false, null),
    ('transporte','apps-movilidad', array['Uber','Cabify','DiDi'], 4000, 16000, 2, false, null),
    ('transporte','peajes', array['Telepase'], 1800, 4500, 1, false, null),
    ('hogar','alquiler', array['Inmobiliaria Rivas'], 450000, 450000, 1, true, 'Alquiler'),
    ('hogar','expensas', array['Consorcio'], 85000, 105000, 1, true, 'Expensas'),
    ('hogar','electricidad', array['Edesur'], 28000, 62000, 1, true, 'Factura de luz'),
    ('hogar','gas', array['Metrogas'], 12000, 39000, 1, true, 'Factura de gas'),
    ('hogar','internet', array['Fibertel'], 32000, 36000, 1, true, 'Internet'),
    ('hogar','telefonia', array['Personal'], 14000, 18000, 1, true, 'Celular'),
    ('salud','obra-social', array['OSDE'], 118000, 132000, 1, true, 'Prepaga'),
    ('salud','farmacia', array['Farmacity'], 4000, 26000, 1, false, null),
    ('entretenimiento','streaming', array['Netflix'], 9500, 9500, 1, true, 'Netflix'),
    ('entretenimiento','streaming', array['Spotify'], 5900, 5900, 1, true, 'Spotify'),
    ('entretenimiento','salidas', array['Bar Nómade'], 12000, 48000, 1, false, null),
    ('deporte','gimnasio', array['SportClub'], 28000, 32000, 1, true, 'Cuota del gym'),
    ('deporte','futbol', array['Cancha El Potrero'], 6000, 12000, 1.5, false, 'Fútbol de los jueves'),
    ('ropa','indumentaria', array['Zara','Kevingston'], 25000, 120000, 0.5, false, null),
    ('personal','cuidado-personal', array['Peluquería'], 8000, 26000, 0.5, false, null),
    ('personal','mascotas', array['Veterinaria San Roque'], 12000, 42000, 0.5, false, null),
    ('finanzas','impuestos', array['ARCA'], 32000, 68000, 1, true, 'Monotributo');

  select id into method_id from public.payment_methods where user_id = target order by is_default desc limit 1;

  for month_offset in reverse (months_back - 1)..0 loop
    month_start := date_trunc('month', current_date - (month_offset || ' months')::interval)::date;
    days_in_month := extract(day from (month_start + interval '1 month - 1 day'));
    last_day := case when month_offset = 0 then least(extract(day from current_date)::integer, days_in_month) else days_in_month end;
    inflation := 1 + (months_back - 1 - month_offset) * 0.035;

    -- Ingresos del mes.
    select c.id, s.id into cat_id, sub_id
    from public.categories c
    join public.subcategories s on s.category_id = c.id
    where c.user_id = target and c.slug = 'ingresos' and s.slug = 'sueldo';

    if last_day >= 5 then
      amount := round(((1650000 + random() * 250000) * inflation)::numeric, 2);
      insert into public.transactions (user_id, type, amount, currency, base_amount, base_currency, exchange_rate,
        description, category_id, subcategory_id, payment_method_id, transaction_date, source)
      values (target, 'income', amount, 'ARS', amount, 'ARS', 1,
        'Sueldo', cat_id, sub_id, method_id, month_start + 4, 'seed');
      inserted := inserted + 1;
    end if;

    if last_day >= 18 then
      select c.id, s.id into cat_id, sub_id
      from public.categories c
      join public.subcategories s on s.category_id = c.id
      where c.user_id = target and c.slug = 'ingresos' and s.slug = 'freelance';

      amount := round(((180000 + random() * 340000) * inflation)::numeric, 2);
      insert into public.transactions (user_id, type, amount, currency, base_amount, base_currency, exchange_rate,
        description, category_id, subcategory_id, payment_method_id, transaction_date, source)
      values (target, 'income', amount, 'ARS', amount, 'ARS', 1,
        'Proyecto freelance', cat_id, sub_id, method_id, month_start + 17, 'seed');
      inserted := inserted + 1;
    end if;

    -- Gastos del mes.
    for pattern in select * from demo_patterns loop
      select c.id, s.id into cat_id, sub_id
      from public.categories c
      join public.subcategories s on s.category_id = c.id
      where c.user_id = target and c.slug = pattern.category_slug and s.slug = pattern.subcategory_slug;

      if cat_id is null then
        continue;
      end if;

      if pattern.recurring then
        occurrences := 1;
      else
        occurrences := round(pattern.per_month
          * (case when month_offset = 0 then last_day::numeric / days_in_month else 1 end)
          * (0.7 + random() * 0.6)::numeric);
      end if;

      for i in 1..greatest(occurrences, 0) loop
        day_of_month := case when pattern.recurring then least(last_day, 3 + floor(random() * 5)::integer)
                             else 1 + floor(random() * last_day)::integer end;
        if day_of_month > last_day then
          continue;
        end if;

        amount := round(((pattern.min_amount + random() * (pattern.max_amount - pattern.min_amount)) * inflation)::numeric, 2);
        merchant := pattern.merchants[1 + floor(random() * array_length(pattern.merchants, 1))::integer];

        insert into public.transactions (user_id, type, amount, currency, base_amount, base_currency, exchange_rate,
          description, merchant_name, category_id, subcategory_id, payment_method_id, transaction_date, source)
        values (target, 'expense', amount, 'ARS', amount, 'ARS', 1,
          coalesce(pattern.label, merchant), merchant, cat_id, sub_id, method_id,
          month_start + (day_of_month - 1), 'seed');
        inserted := inserted + 1;
      end loop;
    end loop;
  end loop;

  -- Un par de movimientos en dólares para ver el multimoneda funcionando.
  select c.id, s.id into cat_id, sub_id
  from public.categories c
  join public.subcategories s on s.category_id = c.id
  where c.user_id = target and c.slug = 'inversiones' and s.slug = 'dolar';

  insert into public.transactions (user_id, type, amount, currency, base_amount, base_currency, exchange_rate,
    description, category_id, subcategory_id, payment_method_id, transaction_date, source)
  values (target, 'expense', 200, 'USD', 296000, 'ARS', 1480,
    'Compra de dólares', cat_id, sub_id, method_id, current_date - 30, 'seed');
  inserted := inserted + 1;

  -- Límites y metas de ejemplo.
  insert into public.budgets (user_id, name, period, amount, currency, category_id)
  select target, 'Alimentación', 'monthly', 400000, 'ARS', c.id
  from public.categories c where c.user_id = target and c.slug = 'alimentacion'
  on conflict do nothing;

  insert into public.budgets (user_id, name, period, amount, currency, category_id)
  values (target, 'Gasto total del mes', 'monthly', 1600000, 'ARS', null)
  on conflict do nothing;

  insert into public.goals (user_id, name, description, target_amount, current_amount, currency, target_date, monthly_contribution)
  values
    (target, 'Vacaciones', 'Costa atlántica en enero', 2000000, 850000, 'ARS', current_date + 150, 250000),
    (target, 'Fondo de emergencia', 'Tres meses de gastos', 3600000, 1150000, 'ARS', current_date + 330, 200000)
  on conflict do nothing;

  return inserted;
end;
$$;

revoke all on function public.seed_demo_data(uuid, integer) from public, anon;
grant execute on function public.seed_demo_data(uuid, integer) to authenticated;
