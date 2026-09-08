/**
 * Junta todas las migraciones en un único archivo, en orden, para poder aplicarlas
 * pegándolas una sola vez en el SQL Editor de Supabase (sin instalar la CLI).
 *
 *   node scripts/bundle-migrations.mjs > crocante-migraciones.sql
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = fileURLToPath(new URL('../supabase/migrations', import.meta.url));
const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();

const parts = [
  `-- Crocante · todas las migraciones en orden`,
  `-- Generado por scripts/bundle-migrations.mjs el ${new Date().toISOString().slice(0, 10)}`,
  `-- Pegar completo en el SQL Editor de Supabase y ejecutar una sola vez.`,
  `-- Es idempotente: volver a correrlo no rompe nada.`,
  '',
];

for (const file of files) {
  const sql = await readFile(path.join(dir, file), 'utf8');
  parts.push(
    '',
    `-- ${'='.repeat(72)}`,
    `-- ${file}`,
    `-- ${'='.repeat(72)}`,
    '',
    sql.trimEnd(),
    '',
  );
}

process.stdout.write(parts.join('\n'));
