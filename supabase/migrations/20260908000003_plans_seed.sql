-- Generado por scripts/generate-plan-seed.mjs — no editar a mano.
-- Fuente de verdad: src/constants/plans.ts

insert into public.plans (code, name, price, currency, limits) values
    ('free', 'Gratis', 0, 'ARS', '{"transactions_per_month":30,"receipts_per_month":0,"ai_queries_per_month":10,"household_members":0,"budgets":1,"goals":1,"report_history_months":1,"csv_export":false,"ai_insights":false,"multi_currency":false}'::jsonb),
    ('personal', 'Personal', 5000, 'ARS', '{"transactions_per_month":null,"receipts_per_month":40,"ai_queries_per_month":200,"household_members":0,"budgets":null,"goals":null,"report_history_months":24,"csv_export":true,"ai_insights":true,"multi_currency":true}'::jsonb),
    ('hogar', 'Hogar', 9000, 'ARS', '{"transactions_per_month":null,"receipts_per_month":100,"ai_queries_per_month":500,"household_members":6,"budgets":null,"goals":null,"report_history_months":36,"csv_export":true,"ai_insights":true,"multi_currency":true}'::jsonb),
    ('empresarial', 'Equipos', 20000, 'ARS', '{"transactions_per_month":null,"receipts_per_month":400,"ai_queries_per_month":2000,"household_members":25,"budgets":null,"goals":null,"report_history_months":60,"csv_export":true,"ai_insights":true,"multi_currency":true}'::jsonb)
on conflict (code) do update
set name = excluded.name,
    price = excluded.price,
    currency = excluded.currency,
    limits = excluded.limits,
    updated_at = now();
