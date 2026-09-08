/**
 * Orígenes habilitados en ALLOWED_ORIGIN.
 * Ejemplo: `https://crocante.vercel.app,http://localhost:5173`
 *
 * Se acepta coma, espacio o punto y coma como separador: PowerShell interpreta
 * la coma de un argumento sin comillas como separador de lista y termina
 * guardando los valores unidos por espacios, y eso no debería romper nada.
 *
 * Sin la variable se permite cualquier origen, útil sólo mientras se prueba.
 */
function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(/[\s,;]+/)
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export { allowedOrigins };

/**
 * El navegador exige UN solo origen en la respuesta, no una lista: por eso se
 * devuelve el del pedido cuando está habilitado, en vez de la variable entera.
 */
export function corsHeaders(request?: Request): Record<string, string> {
  const allowed = allowedOrigins();
  const origin = (request?.headers.get('Origin') ?? '').replace(/\/$/, '');

  const value = !allowed.length ? '*' : allowed.includes(origin) ? origin : allowed[0];

  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Sin esto, una caché intermedia podría servirle a un origen la respuesta de otro.
    Vary: 'Origin',
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Envuelve el manejador: resuelve el preflight y pega las cabeceras CORS en
 * toda respuesta, así ninguna función se olvida de hacerlo.
 */
export function withCors(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const headers = corsHeaders(request);
    if (request.method === 'OPTIONS') return new Response('ok', { headers });

    const response = await handler(request);
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
    return response;
  };
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
