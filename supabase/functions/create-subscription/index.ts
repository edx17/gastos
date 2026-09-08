/**
 * Alta de suscripción.
 *
 * Crea la preaprobación en el proveedor de cobro y devuelve el enlace de pago.
 * Nunca cambia el plan: eso sólo pasa cuando el proveedor confirma el pago, en
 * `subscription-webhook`. Así, quien llame a esta función mil veces no consigue
 * nada más que mil enlaces sin pagar.
 */
import { corsHeaders, jsonResponse, rateLimit, requireUser } from '../_shared/cors.ts';

interface CheckoutRequest {
  plan: string;
  return_url?: string;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  const caller = await requireUser(request);
  if (!caller) return jsonResponse({ error: 'Iniciá sesión para cambiar de plan.' }, 401);
  if (!rateLimit(`checkout:${caller.id}`, 10)) {
    return jsonResponse({ error: 'Demasiados intentos seguidos. Esperá un minuto.' }, 429);
  }

  let body: CheckoutRequest;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'El pedido no es JSON válido.' }, 400);
  }

  const token = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
  if (!token) {
    return jsonResponse({ error: 'El cobro todavía no está configurado.' }, 501);
  }

  // El precio sale de la base, no del navegador: si viniera del cliente,
  // cualquiera podría suscribirse al plan más caro pagando un peso.
  const plan = await fetchPlan(body.plan);
  if (!plan) return jsonResponse({ error: 'Ese plan no existe.' }, 400);
  if (Number(plan.price) <= 0) {
    return jsonResponse({ error: 'El plan gratis no necesita pago.' }, 400);
  }

  const backUrl = safeReturnUrl(body.return_url);

  const response = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      reason: `Crocante · plan ${plan.name}`,
      // Con esto el webhook sabe a qué cuenta y plan corresponde el cobro.
      external_reference: `${caller.id}:${plan.code}`,
      payer_email: caller.email,
      back_url: backUrl,
      status: 'pending',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: Number(plan.price),
        currency_id: plan.currency ?? 'ARS',
      },
    }),
  });

  if (!response.ok) {
    console.error('create-subscription', response.status);
    return jsonResponse({ error: 'No pude iniciar el pago. Probá de nuevo en unos minutos.' }, 502);
  }

  const preapproval = (await response.json()) as { init_point?: string; sandbox_init_point?: string };
  const url = preapproval.init_point ?? preapproval.sandbox_init_point;
  if (!url) return jsonResponse({ error: 'El proveedor no devolvió un enlace de pago.' }, 502);

  return jsonResponse({ url, provider: 'mercadopago' });
});

async function fetchPlan(code: string) {
  const response = await fetch(
    `${Deno.env.get('SUPABASE_URL')}/rest/v1/plans?code=eq.${encodeURIComponent(code)}&select=code,name,price,currency`,
    {
      headers: {
        apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY') ?? ''}`,
      },
    },
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as { code: string; name: string; price: number; currency: string }[];
  return rows[0] ?? null;
}

/** Sólo se vuelve a nuestro propio sitio: un back_url arbitrario es un redirect abierto. */
function safeReturnUrl(candidate?: string): string {
  const allowed = (Deno.env.get('ALLOWED_ORIGIN') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
  const fallback = allowed[0] ?? 'https://localhost:5173';
  if (!candidate) return `${fallback}/app/settings`;
  try {
    const url = new URL(candidate);
    return allowed.includes(url.origin) ? url.toString() : `${fallback}/app/settings`;
  } catch {
    return `${fallback}/app/settings`;
  }
}
