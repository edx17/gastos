import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vite incrusta las variables VITE_* al compilar, no al abrir la página: si al
 * momento del build no están, la aplicación queda en modo demo para siempre en
 * esa versión. Este aviso lo grita en el registro del deploy, que es donde uno
 * lo puede ver a tiempo.
 */
function warnMissingBackendEnv(env: Record<string, string>): Plugin {
  return {
    name: 'crocante:warn-missing-backend-env',
    apply: 'build',
    buildStart() {
      const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((key) => !env[key]?.trim());
      if (!missing.length) return;

      const line = '─'.repeat(70);
      console.warn(
        `\n\x1b[33m${line}\n` +
          '  ATENCIÓN: se está compilando SIN backend.\n' +
          `  Faltan: ${missing.join(', ')}\n\n` +
          '  La aplicación va a arrancar en MODO DEMO: los datos quedan en el\n' +
          '  navegador de cada visitante y no hay acceso con Google.\n\n' +
          '  Si esto es un despliegue de verdad, cargá esas variables en el\n' +
          '  proveedor (en Vercel: Settings → Environment Variables, marcando\n' +
          '  Production) y volvé a desplegar: agregarlas no alcanza, hay que\n' +
          '  compilar de nuevo.\n' +
          `${line}\x1b[0m\n`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  plugins: [react(), warnMissingBackendEnv(env)],
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
