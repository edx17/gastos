/**
 * Proxy de modelos de IA.
 *
 * Existe para que las API keys vivan en el servidor y nunca lleguen al navegador.
 * Recibe {provider, model, system, user} y devuelve {text}.
 */
import { checkAiQuota, corsHeaders, jsonResponse, rateLimit, requireUser } from '../_shared/cors.ts';

interface CompletionRequest {
  provider: 'openai' | 'anthropic' | 'gemini';
  model?: string;
  system: string;
  user: string;
}

const MAX_INPUT_CHARS = 8000;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  const caller = await requireUser(request);
  if (!caller) return jsonResponse({ error: 'Necesitás iniciar sesión para usar la IA.' }, 401);
  if (!rateLimit(`ai:${caller.id}`, 40)) {
    return jsonResponse({ error: 'Demasiados pedidos seguidos. Probá de nuevo en un minuto.' }, 429);
  }

  // El cupo del plan se controla acá, antes de pagarle al proveedor.
  const overQuota = await checkAiQuota(caller.token);
  if (overQuota) return jsonResponse({ error: overQuota, code: 'PLAN_LIMIT' }, 402);

  let body: CompletionRequest;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'El pedido no es JSON válido.' }, 400);
  }

  const system = String(body.system ?? '').slice(0, MAX_INPUT_CHARS);
  const user = String(body.user ?? '').slice(0, MAX_INPUT_CHARS);
  if (!user) return jsonResponse({ error: 'Falta el texto a interpretar.' }, 400);

  const provider = body.provider ?? (Deno.env.get('AI_PROVIDER') as CompletionRequest['provider']) ?? 'openai';

  try {
    const text = await complete(provider, body.model, system, user);
    return jsonResponse({ text });
  } catch (error) {
    console.error('ai-complete', provider, error instanceof Error ? error.message : 'error');
    return jsonResponse({ error: 'El proveedor de IA no respondió. Probá de nuevo en unos segundos.' }, 502);
  }
});

async function complete(
  provider: CompletionRequest['provider'],
  model: string | undefined,
  system: string,
  user: string,
): Promise<string> {
  if (provider === 'anthropic') {
    const key = requireKey('ANTHROPIC_API_KEY');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: model ?? Deno.env.get('AI_MODEL') ?? 'claude-sonnet-4-5',
        max_tokens: 1024,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    const data = await expectOk(response, 'Anthropic');
    return (data.content ?? []).map((block: { text?: string }) => block.text ?? '').join('');
  }

  if (provider === 'gemini') {
    const key = requireKey('GEMINI_API_KEY');
    const name = model ?? Deno.env.get('AI_MODEL') ?? 'gemini-1.5-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${name}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      },
    );
    const data = await expectOk(response, 'Gemini');
    return (data.candidates?.[0]?.content?.parts ?? []).map((part: { text?: string }) => part.text ?? '').join('');
  }

  const key = requireKey('OPENAI_API_KEY');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model ?? Deno.env.get('AI_MODEL') ?? 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const data = await expectOk(response, 'OpenAI');
  return data.choices?.[0]?.message?.content ?? '';
}

function requireKey(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta configurar ${name} en las variables de la Edge Function.`);
  return value;
}

async function expectOk(response: Response, provider: string) {
  if (!response.ok) {
    // El cuerpo puede traer datos del pedido: no se registra.
    throw new Error(`${provider} respondió ${response.status}`);
  }
  return response.json();
}
