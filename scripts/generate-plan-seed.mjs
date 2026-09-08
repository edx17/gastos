/**
 * Genera la tabla de planes en SQL desde src/constants/plans.ts, para que los
 * límites que aplica la base y los que muestra la interfaz no puedan divergir.
 *
 *   node scripts/generate-plan-seed.mjs > supabase/migrations/<n>_plans.sql
 */
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const source = await readFile(new URL('../src/constants/plans.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const rows = module.PLANS.map((plan) => {
  const limits = JSON.stringify(plan.limits).replace(/'/g, "''");
  const name = plan.name.replace(/'/g, "''");
  return `    ('${plan.code}', '${name}', ${plan.price}, '${plan.currency}', '${limits}'::jsonb)`;
}).join(',\n');

process.stdout.write(`-- Generado por scripts/generate-plan-seed.mjs — no editar a mano.
-- Fuente de verdad: src/constants/plans.ts

insert into public.plans (code, name, price, currency, limits) values
${rows}
on conflict (code) do update
set name = excluded.name,
    price = excluded.price,
    currency = excluded.currency,
    limits = excluded.limits,
    updated_at = now();
`);
