import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vite incrusta las variables VITE_* al compilar, no al abrir la página: si al
 * momento del build no están, la aplicación queda en modo demo para siempre en
 * esa versión. Este aviso lo grita en el registro del deploy, que es donde uno
 * lo puede ver a tiempo.
 */
function warnMissingBackendEnv(backend: { url: string; anonKey: string }): Plugin {
  return {
    name: 'crocante:warn-missing-backend-env',
    apply: 'build',
    buildStart() {
      const missing = [
        !backend.url && 'la URL del proyecto',
        !backend.anonKey && 'la clave anon',
      ].filter(Boolean);
      if (!missing.length) return;

      const line = '─'.repeat(70);
      console.warn(
        `\n\x1b[33m${line}\n` +
          '  ATENCIÓN: se está compilando SIN backend.\n' +
          `  Falta: ${missing.join(' y ')}\n\n` +
          '  La aplicación va a arrancar en MODO DEMO: los datos quedan en el\n' +
          '  navegador de cada visitante y no hay acceso con Google.\n\n' +
          '  Si esto es un despliegue de verdad, cargá esas variables en el\n' +
          '  Cargá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el proveedor\n' +
          '  (en Vercel: Settings → Environment Variables, marcando Production)\n' +
          '  y volvé a desplegar: agregarlas no alcanza, hay que compilar de\n' +
          '  nuevo. También se aceptan SUPABASE_URL y SUPABASE_ANON_KEY, que es\n' +
          '  como las deja la integración de Supabase con Vercel.\n' +
          `${line}\x1b[0m\n`,
      );
    },
  };
}

/**
 * La integración oficial de Supabase con Vercel deja las credenciales con
 * nombres pensados para Next.js (`SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`).
 * Vite sólo expone lo que empieza con `VITE_`, así que se aceptan esos nombres
 * como alternativa: quien ya tenga la integración no necesita duplicar nada.
 */
function resolveBackendEnv(env: Record<string, string>) {
  const pick = (...keys: string[]) => keys.map((key) => env[key]?.trim()).find(Boolean) ?? '';

  const url = pick('VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = pick(
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  );

  const source = env.VITE_SUPABASE_URL?.trim() ? 'variables VITE_*' : url ? 'integración de Supabase' : 'ninguna';
  return { url, anonKey, source };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = resolveBackendEnv(env);

  if (backend.url) {
    console.log(`\x1b[36m  Backend: ${backend.url} (tomado de ${backend.source})\x1b[0m`);
  }

  return {
  plugins: [react(), warnMissingBackendEnv(backend)],
    // Se fijan explícitamente para que valgan también cuando vienen de la
    // integración, que no usa el prefijo VITE_.
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(backend.url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(backend.anonKey),
    },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173, host: true },
  build: {
    // Recharts y Supabase pesan más que el resto de la app: en chunks aparte se
    // cachean por separado y no se vuelven a bajar con cada deploy.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  } as any;
});
