-- Los intereses que cobrás son un ingreso, no un gasto
--
-- La taxonomía tenía «Finanzas · Intereses», que son los que uno PAGA
-- (punitorios, financiación de la tarjeta). Faltaba dónde poner los que uno
-- COBRA: el rendimiento de la caja de ahorro, de Reservas de Mercado Pago, del
-- plazo fijo, del FIMA.
--
-- La subcategoría nueva sale de src/constants/categories.ts y ya está en
-- `default_category_taxonomy()`. Esto la reparte entre las cuentas que se
-- crearon antes: `seed_user_defaults` es idempotente, así que volver a correrlo
-- agrega lo que falta sin tocar lo que la persona haya renombrado o creado.

do $$
declare
  person uuid;
begin
  -- Ojo con la columna: `profiles.id` es la fila del perfil; la cuenta es
  -- `profiles.user_id`, que es lo que apuntan las claves foráneas.
  -- El join contra auth.users saltea perfiles huérfanos, que existen si alguna
  -- vez se borró una cuenta a mano desde el panel.
  for person in
    select p.user_id
    from public.profiles p
    join auth.users u on u.id = p.user_id
  loop
    perform public.seed_user_defaults(person);
  end loop;
end $$;
