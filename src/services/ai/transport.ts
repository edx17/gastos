import { env } from '@/config/env';
import { AiProviderError } from './provider';

export interface EdgeCompletionRequest {
  provider: string;
  model: string;
  system: string;
  user: string;
}

/**
 * In production the API keys live in Supabase Edge Functions, never in the bundle.
 * `VITE_*_API_KEY` values are a development shortcut and are ignored when the
 * `ai-complete` function is available.
 */
export function shouldUseEdge(): boolean {
  return env.useEdgeFunctions && env.hasSupabase;
}

export async function edgeComplete(request: EdgeCompletionRequest, accessToken?: string): Promise<string> {
  const response = await fetch(`${env.supabaseUrl}/functions/v1/ai-complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${accessToken || env.supabaseAnonKey}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AiProviderError(
      `El servicio de IA respondió ${response.status}. ${describeStatus(response.status)}`,
      request.provider,
      detail,
    );
  }

  const payload = (await response.json()) as { text?: string; error?: string };
  if (payload.error) throw new AiProviderError(payload.error, request.provider);
  return payload.text ?? '';
}

export function describeStatus(status: number): string {
  if (status === 401 || status === 403) return 'Revisá la API key configurada.';
  if (status === 429) return 'Se alcanzó el límite de pedidos, probá en unos segundos.';
  if (status >= 500) return 'El proveedor está con problemas, intentá de nuevo.';
  return 'Revisá la configuración de IA en Ajustes.';
}

export async function postJson(url: string, headers: Record<string, string>, body: unknown, provider: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AiProviderError(`${provider} respondió ${response.status}. ${describeStatus(response.status)}`, provider, detail);
  }
  return response.json() as Promise<any>;
}
