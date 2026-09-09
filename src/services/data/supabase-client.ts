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

/** Lo mínimo que devuelve PostgREST cuando algo sale mal. */
export type DbErrorLike = {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

/** Columnas que apuntan a otra tabla, dichas como las diría una persona. */
const FIELD_LABELS: Record<string, string> = {
  account_id: 'la cuenta',
  budget_id: 'el presupuesto',
  category_id: 'la categoría',
  created_by: 'la persona que lo cargó',
  goal_id: 'la meta',
  household_id: 'el hogar',
  merchant_id: 'el comercio',
  paid_by: 'la persona que pagó',
  payment_method_id: 'el medio de pago',
  plan_id: 'el plan',
  receipt_id: 'el ticket',
  subcategory_id: 'la subcategoría',
  transaction_id: 'el movimiento',
  user_id: 'la cuenta',
};

const TABLE_LABELS: Record<string, string> = {
  accounts: 'cuentas',
  budgets: 'presupuestos',
  categories: 'categorías',
  goals: 'metas',
  household_members: 'integrantes del hogar',
  merchants: 'comercios',
  payment_methods: 'medios de pago',
  receipts: 'tickets',
  subcategories: 'subcategorías',
  transaction_items: 'ítems de tickets',
  transactions: 'movimientos',
};

/** `Key (category_id)=(...)` → `la categoría`. */
function fieldLabel(details?: string | null): string | null {
  const match = /Key \(([^)]+)\)/.exec(details ?? '');
  if (!match) return null;
  const column = match[1].split(',')[0].trim().replace(/^"|"$/g, '');
  return FIELD_LABELS[column] ?? null;
}

/** `is still referenced from table "transactions"` → `movimientos`. */
function tableLabel(details?: string | null): string | null {
  const match = /referenced from table "([^"]+)"/.exec(details ?? '');
  if (!match) return null;
  return TABLE_LABELS[match[1]] ?? null;
}

/**
 * Turns PostgREST errors into messages a person can act on.
 *
 * El detalle que manda Postgres dice exactamente qué campo falló, así que lo
 * usamos en vez de tirar un “ocurrió un problema”. Cuando no sabemos traducir,
 * pasamos el texto original completo: es feo, pero es información.
 */
export function describeDbError(error: DbErrorLike | null): string {
  if (!error) return 'Ocurrió un problema al guardar. Probá de nuevo.';
  const code = error.code ?? '';
  const details = error.details ?? '';

  // Los topes de plan ya vienen con un mensaje escrito para leer.
  if (error.hint?.startsWith('PLAN_LIMIT:')) return error.message ?? 'Llegaste al límite de tu plan.';

  if (code === '23505') {
    const field = fieldLabel(details);
    return field ? `Ya hay un registro con ${field} que elegiste.` : 'Ese registro ya existe.';
  }

  if (code === '23503') {
    const field = fieldLabel(details);
    // Al insertar falta la fila apuntada; al borrar, sobra quien la apunta.
    if (details.includes('is not present in table')) {
      const what = field ?? 'uno de los datos que estoy guardando';
      return `No pude guardarlo porque ${what} ya no existe. Recargá la página y probá de nuevo.`;
    }
    const table = tableLabel(details);
    return table
      ? `No puedo borrarlo porque todavía lo usan tus ${table}.`
      : 'No puedo borrarlo porque hay datos que dependen de él.';
  }

  if (code === '23514') return 'Alguno de los valores no es válido. Revisá el importe y la fecha.';
  if (code === '23502') return 'Falta completar un dato obligatorio.';
  if (code === '22P02' || code === '22007') return 'Alguno de los datos tiene un formato que no puedo leer.';
  if (code === '42501' || code === 'PGRST301') return 'No tenés permiso sobre esos datos.';
  if (code === 'PGRST116') return 'No encontré ese registro.';
  if (error.message?.includes('Failed to fetch')) return 'No pude conectarme al servidor. Revisá tu conexión.';

  const raw = [error.message, details].filter(Boolean).join(' ').trim();
  return raw || 'Ocurrió un problema al guardar. Probá de nuevo.';
}
