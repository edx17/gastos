/**
 * Borrado de cuenta.
 *
 * Derecho de supresión: la persona pide irse y se va. Al eliminar el usuario de
 * auth, las tablas caen por cascada, así que no quedan movimientos huérfanos.
 */
import { jsonResponse, rateLimit, requireUser, withCors } from '../_shared/cors.ts';

Deno.serve(withCors(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  const caller = await requireUser(request);
  if (!caller) return jsonResponse({ error: 'Iniciá sesión para eliminar tu cuenta.' }, 401);
  if (!rateLimit(`delete:${caller.id}`, 3)) {
    return jsonResponse({ error: 'Demasiados intentos seguidos. Esperá un minuto.' }, 429);
  }

  // Confirmación explícita: que no se borre una cuenta por un clic perdido.
  const body = (await request.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== 'ELIMINAR') {
    return jsonResponse({ error: 'Falta la confirmación.' }, 400);
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const base = Deno.env.get('SUPABASE_URL');

  // Las imágenes de tickets viven en Storage: no se borran por cascada.
  const listing = await fetch(`${base}/storage/v1/object/list/receipts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ prefix: `${caller.id}/`, limit: 1000 }),
  });

  if (listing.ok) {
    const files = (await listing.json().catch(() => [])) as { name: string }[];
    if (files.length) {
      await fetch(`${base}/storage/v1/object/receipts`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ prefixes: files.map((file) => `${caller.id}/${file.name}`) }),
      });
    }
  }

  const deleted = await fetch(`${base}/auth/v1/admin/users/${caller.id}`, {
    method: 'DELETE',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });

  if (!deleted.ok) {
    console.error('delete-account: fallo al eliminar', deleted.status);
    return jsonResponse({ error: 'No pude eliminar la cuenta. Escribinos y lo hacemos a mano.' }, 502);
  }

  return jsonResponse({ ok: true });
}));
