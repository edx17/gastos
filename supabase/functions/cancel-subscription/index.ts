/**
 * Baja de la suscripción.
 *
 * La persona la pide desde Ajustes y se corta la renovación en el proveedor.
 * El acceso al plan sigue hasta el final del período ya pagado: dar de baja no
 * es perder lo que se pagó.
 */
import { corsHeaders, jsonResponse, rateLimit, requireUser } from '../_shared/cors.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  const caller = await requireUser(request);
  if (!caller) return jsonResponse({ error: 'Iniciá sesión para dar de baja tu plan.' }, 401);
  if (!rateLimit(`cancel:${caller.id}`, 5)) {
    return jsonResponse({ error: 'Demasiados intentos seguidos. Esperá un minuto.' }, 429);
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const base = Deno.env.get('SUPABASE_URL');

  const lookup = await fetch(
    `${base}/rest/v1/subscriptions?user_id=eq.${caller.id}&select=id,external_id,provider,current_period_end`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  const rows = (await lookup.json().catch(() => [])) as {
    id: string;
    external_id: string | null;
    provider: string;
    current_period_end: string | null;
  }[];
  const subscription = rows[0];

  if (!subscription) {
    return jsonResponse({ error: 'No encontramos una suscripción activa en tu cuenta.' }, 404);
  }

  // Cortar la renovación en Mercado Pago.
  if (subscription.provider === 'mercadopago' && subscription.external_id) {
    const token = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (token) {
      const cancelled = await fetch(`https://api.mercadopago.com/preapproval/${subscription.external_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!cancelled.ok) {
        console.error('cancel-subscription: el proveedor respondió', cancelled.status);
        return jsonResponse(
          { error: 'No pude cortar la renovación con el proveedor. Escribinos y lo resolvemos a mano.' },
          502,
        );
      }
    }
  }

  await fetch(`${base}/rest/v1/subscriptions?user_id=eq.${caller.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ cancel_at_period_end: true, updated_at: new Date().toISOString() }),
  });

  return jsonResponse({ ok: true, access_until: subscription.current_period_end });
});
