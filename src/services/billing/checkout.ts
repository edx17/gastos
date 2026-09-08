import { env } from '@/config/env';
import { getSupabase } from '@/services/data/supabase-client';
import { err } from '@/types/common';
import type { PlanCode } from '@/constants/plans';

export interface CheckoutSession {
  /** A dónde mandar a la persona para pagar. */
  url: string;
  provider: string;
}

/**
 * Arranca el alta de la suscripción.
 *
 * El cobro lo resuelve la Edge Function `create-subscription`, que es la única que
 * conoce las credenciales del proveedor. Acá sólo se pide el enlace y se redirige.
 */
export async function startCheckout(plan: PlanCode): Promise<CheckoutSession> {
  if (!env.hasSupabase) {
    throw err(
      'billing/demo-mode',
      'Estás en modo demo: el cobro necesita el backend configurado.',
      'Cuando conectes Supabase y el proveedor de pagos, este botón lleva al checkout.',
    );
  }

  const { data: session } = await getSupabase().auth.getSession();
  const token = session.session?.access_token;
  if (!token) {
    throw err('billing/no-session', 'Iniciá sesión para cambiar de plan.');
  }

  const response = await fetch(`${env.supabaseUrl}/functions/v1/create-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan, return_url: `${window.location.origin}/app/settings` }),
  });

  if (response.status === 404 || response.status === 501) {
    throw err(
      'billing/not-configured',
      'El cobro todavía no está habilitado.',
      'Falta desplegar la función create-subscription con las credenciales del proveedor.',
    );
  }

  const payload = (await response.json().catch(() => ({}))) as { url?: string; provider?: string; error?: string };

  if (!response.ok || !payload.url) {
    throw err(
      'billing/checkout-failed',
      payload.error ?? 'No pude iniciar el pago. Probá de nuevo en unos minutos.',
    );
  }

  return { url: payload.url, provider: payload.provider ?? 'mercadopago' };
}
