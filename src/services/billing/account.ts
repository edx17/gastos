import { env } from '@/config/env';
import { getSupabase } from '@/services/data/supabase-client';
import { err } from '@/types/common';

async function callFunction(name: string, body: unknown) {
  if (!env.hasSupabase) {
    throw err('billing/demo-mode', 'Estás en modo demo: esta acción necesita el backend configurado.');
  }

  const { data: session } = await getSupabase().auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw err('auth/no-session', 'Tu sesión expiró. Volvé a iniciar sesión.');

  const response = await fetch(`${env.supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw err(
      'billing/failed',
      typeof payload.error === 'string' ? payload.error : 'No pude completar la operación. Probá de nuevo.',
    );
  }
  return payload;
}

/** Corta la renovación. El acceso sigue hasta que termine el período pago. */
export async function cancelSubscription(): Promise<{ accessUntil: string | null }> {
  const payload = await callFunction('cancel-subscription', {});
  return { accessUntil: (payload.access_until as string | null) ?? null };
}

/** Elimina la cuenta y todo lo que hay dentro. No se puede deshacer. */
export async function deleteAccount(): Promise<void> {
  await callFunction('delete-account', { confirm: 'ELIMINAR' });
  await getSupabase().auth.signOut();
}
