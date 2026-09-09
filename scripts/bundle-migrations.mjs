/**
 * Junta todas las migraciones en un único archivo, en orden, para poder aplicarlas
 * pegándolas una sola vez en el SQL Editor de Supabase (sin instalar la CLI).
 *
 *   node scripts/bundle-migrations.mjs
 *
 * El archivo lo escribe el script, no la consola. Redirigir la salida
 * (`node ... > archivo.sql`) rompe los acentos en PowerShell: la consola
 * reinterpreta los bytes UTF-8 con la página de códigos local y «Débito» llega
 * a la base como «D├®bito». Escribiéndolo desde acá el texto sale en UTF-8
 * pase lo que pase.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = fileURLToPath(new URL('../supabase/migrations', import.meta.url));
// Sólo migraciones numeradas: así el bundle no se incluye a sí mismo si alguien
// lo dejó dentro de la carpeta.
const files = (await readdir(dir))
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();

if (!files.length) {
  console.error('No encontré migraciones en supabase/migrations.');
  process.exit(1);
}

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

const target = fileURLToPath(new URL('../crocante-migraciones.sql', import.meta.url));
const sql = parts.join('\n');

await writeFile(target, sql, 'utf8');

// El aviso va por stderr para no ensuciar el archivo si alguien igual redirige.
process.stderr.write(
  `Escrito crocante-migraciones.sql (${files.length} migraciones, ${(Buffer.byteLength(sql) / 1024).toFixed(0)} kB).\n` +
    'Pegá ese archivo completo en el SQL Editor de Supabase.\n',
);
