/**
 * Confirmación de cobro.
 *
 * Es el único lugar donde una cuenta cambia de plan. Verifica la firma del
 * proveedor antes de tocar nada: sin esa verificación, cualquiera que descubra la
 * URL podría regalarse el plan más caro con un POST.
 */
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const STATUS_MAP: Record<string, string> = {
  authorized: 'active',
  pending: 'past_due',
  paused: 'paused',
  cancelled: 'canceled',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  const raw = await request.text();
  let event: { type?: string; action?: string; data?: { id?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: 'Cuerpo inválido.' }, 400);
  }

  const resourceId = event.data?.id;
  if (!resourceId) return jsonResponse({ received: true });

  if (!(await signatureIsValid(request, resourceId))) {
    console.error('subscription-webhook: firma inválida');
    return jsonResponse({ error: 'Firma inválida.' }, 401);
  }

  // Sólo interesan las suscripciones.
  const kind = event.type ?? event.action ?? '';
  if (!kind.includes('preapproval') && !kind.includes('subscription')) {
    return jsonResponse({ received: true });
  }

  const token = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
  if (!token) return jsonResponse({ error: 'Cobro no configurado.' }, 501);

  // Se vuelve a consultar al proveedor: el cuerpo del webhook no es fuente de verdad.
  const lookup = await fetch(`https://api.mercadopago.com/preapproval/${resourceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!lookup.ok) {
    console.error('subscription-webhook: no pude leer la preaprobación', lookup.status);
    return jsonResponse({ error: 'No pude verificar el cobro.' }, 502);
  }

  const preapproval = (await lookup.json()) as {
    status?: string;
    external_reference?: string;
    next_payment_date?: string;
    auto_recurring?: { transaction_amount?: number; currency_id?: string };
  };

  const [userId, planCode] = (preapproval.external_reference ?? '').split(':');
  if (!userId || !planCode) return jsonResponse({ received: true });

  const status = STATUS_MAP[preapproval.status ?? ''] ?? 'past_due';
  const periodEnd = preapproval.next_payment_date ?? null;

  await adminRequest('subscriptions', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([
      {
        user_id: userId,
        plan_code: planCode,
        status,
        current_period_end: periodEnd,
        provider: 'mercadopago',
        external_id: String(resourceId),
        updated_at: new Date().toISOString(),
      },
    ]),
  });

  await adminRequest('subscription_events', {
    method: 'POST',
    body: JSON.stringify([
      {
        user_id: userId,
        kind: `mercadopago.${preapproval.status ?? 'unknown'}`,
        provider: 'mercadopago',
        external_id: String(resourceId),
        amount: preapproval.auto_recurring?.transaction_amount ?? null,
        currency: preapproval.auto_recurring?.currency_id ?? 'ARS',
        payload: preapproval,
      },
    ]),
  });

  return jsonResponse({ received: true, status });
});

/**
 * Firma de Mercado Pago: `x-signature: ts=...,v1=...` sobre el manifiesto
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
 */
async function signatureIsValid(request: Request, resourceId: string): Promise<boolean> {
  const secret = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET');
  if (!secret) {
    console.error('subscription-webhook: falta MERCADOPAGO_WEBHOOK_SECRET');
    return false;
  }

  const header = request.headers.get('x-signature') ?? '';
  const requestId = request.headers.get('x-request-id') ?? '';
  const parts = Object.fromEntries(
    header.split(',').map((piece) => piece.split('=').map((value) => value.trim()) as [string, string]),
  );
  const ts = parts.ts;
  const received = parts.v1;
  if (!ts || !received) return false;

  // Una firma vieja no sirve: evita que alguien reenvíe un webhook capturado.
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 600) return false;

  const manifest = `id:${resourceId};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const expected = Array.from(new Uint8Array(signed))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(expected, received);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Escritura con la clave de servicio: es la única forma de tocar `subscriptions`. */
async function adminRequest(table: string, init: RequestInit) {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/${table}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    console.error(`subscription-webhook: fallo al escribir ${table}`, response.status);
  }
  return response;
}
