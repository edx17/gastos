import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/config/env';

let client: SupabaseClient | null = null;

/** Single shared browser client. Auth state is persisted and refreshed automatically. */
export function getSupabase(): SupabaseClient {
  if (!env.hasSupabase) {
    throw new Error('Supabase no está configurado. Definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  }
  client ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { headers: { 'x-application-name': 'crocante' } },
  });
  return client;
}

/** Turns PostgREST errors into messages a person can act on. */
export function describeDbError(error: { message?: string; code?: string } | null): string {
  if (!error) return 'Ocurrió un problema al guardar. Probá de nuevo.';
  const code = error.code ?? '';
  if (code === '23505') return 'Ese registro ya existe.';
  if (code === '23503') return 'No puedo hacerlo porque hay datos relacionados.';
  if (code === '42501' || code === 'PGRST301') return 'No tenés permiso sobre esos datos.';
  if (code === 'PGRST116') return 'No encontré ese registro.';
  if (error.message?.includes('Failed to fetch')) return 'No pude conectarme al servidor. Revisá tu conexión.';
  return error.message ?? 'Ocurrió un problema al guardar. Probá de nuevo.';
}
