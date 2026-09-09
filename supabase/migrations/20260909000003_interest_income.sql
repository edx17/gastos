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
  for person in select id from public.profiles loop
    perform public.seed_user_defaults(person);
  end loop;
end $$;
