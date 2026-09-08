export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Simple per-user, per-minute limiter kept in memory of the running instance. */
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

/** Resolves the caller from the Authorization header; anonymous callers are rejected. */
export async function requireUser(request: Request): Promise<{ id: string; email: string; token: string } | null> {
  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!token || token === anonKey) return null;

  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? { id: user.id, email: user.email ?? '', token } : null;
}

/**
 * Descuenta una consulta del cupo del plan ANTES de gastar en el proveedor.
 * Devuelve el mensaje de error cuando no queda cupo, o null si se puede seguir.
 */
export async function checkAiQuota(token: string): Promise<string | null> {
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/consume_ai_quota`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      Authorization: `Bearer ${token}`,
    },
    body: '{}',
  });

  if (response.ok) return null;

  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  return payload.message ?? 'Se agotaron las consultas con IA de tu plan.';
}
