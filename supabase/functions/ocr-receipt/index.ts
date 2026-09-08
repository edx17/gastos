/**
 * Proxy de OCR / Vision.
 *
 * Recibe {provider, image} (base64 sin encabezado) y devuelve {text, confidence}.
 * El parsing del ticket ocurre en el cliente: acá sólo se transcribe.
 */
import { checkAiQuota, corsHeaders, jsonResponse, rateLimit, requireUser } from '../_shared/cors.ts';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const VISION_PROMPT = `Transcribí COMPLETO el texto de este ticket o factura, respetando líneas y columnas.
No resumas, no interpretes, no agregues comentarios. Devolvé solamente el texto.`;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  const caller = await requireUser(request);
  if (!caller) return jsonResponse({ error: 'Necesitás iniciar sesión para procesar tickets.' }, 401);
  if (!rateLimit(`ocr:${caller.id}`, 20)) {
    return jsonResponse({ error: 'Demasiadas imágenes seguidas. Esperá un minuto.' }, 429);
  }

  // El cupo del plan se controla acá, antes de pagarle al proveedor de visión.
  const overQuota = await checkAiQuota(caller.token);
  if (overQuota) return jsonResponse({ error: overQuota, code: 'PLAN_LIMIT' }, 402);

  let body: { provider?: string; image?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'El pedido no es JSON válido.' }, 400);
  }

  const image = (body.image ?? '').replace(/^data:image\/\w+;base64,/, '');
  if (!image) return jsonResponse({ error: 'Falta la imagen del ticket.' }, 400);
  if (image.length * 0.75 > MAX_IMAGE_BYTES) {
    return jsonResponse({ error: 'La imagen es demasiado grande. Reducí la resolución.' }, 413);
  }

  const provider = body.provider ?? Deno.env.get('OCR_PROVIDER') ?? 'ocrspace';

  try {
    const result = await recognize(provider, image);
    if (!result.text.trim()) {
      return jsonResponse({ error: 'No pude leer texto en esa foto. Probá con más luz y el ticket derecho.' }, 422);
    }
    return jsonResponse(result);
  } catch (error) {
    console.error('ocr-receipt', provider, error instanceof Error ? error.message : 'error');
    return jsonResponse({ error: 'El servicio de OCR no respondió. Probá de nuevo en unos segundos.' }, 502);
  }
});

async function recognize(provider: string, image: string): Promise<{ text: string; confidence: number }> {
  if (provider === 'google_vision') {
    const key = requireKey('OCR_API_KEY');
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          { image: { content: image }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], imageContext: { languageHints: ['es'] } },
        ],
      }),
    });
    const data = await expectOk(response, 'Google Vision');
    return { text: data?.responses?.[0]?.fullTextAnnotation?.text ?? '', confidence: 0.9 };
  }

  if (provider === 'azure_vision') {
    const key = requireKey('OCR_API_KEY');
    const endpoint = requireKey('OCR_ENDPOINT').replace(/\/$/, '');
    const bytes = Uint8Array.from(atob(image), (c) => c.charCodeAt(0));
    const response = await fetch(
      `${endpoint}/computervision/imageanalysis:analyze?features=read&api-version=2024-02-01&language=es`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'Ocp-Apim-Subscription-Key': key },
        body: bytes,
      },
    );
    const data = await expectOk(response, 'Azure');
    const lines = (data?.readResult?.blocks ?? []).flatMap((block: any) => block.lines ?? []);
    return { text: lines.map((line: any) => line.text).join('\n'), confidence: 0.88 };
  }

  if (provider === 'openai_vision') {
    const key = requireKey('OPENAI_API_KEY');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: Deno.env.get('AI_MODEL') ?? 'gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VISION_PROMPT },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
            ],
          },
        ],
      }),
    });
    const data = await expectOk(response, 'OpenAI');
    return { text: data?.choices?.[0]?.message?.content ?? '', confidence: 0.85 };
  }

  if (provider === 'gemini_vision') {
    const key = requireKey('GEMINI_API_KEY');
    const model = Deno.env.get('AI_MODEL') ?? 'gemini-1.5-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: VISION_PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: image } }] }],
          generationConfig: { temperature: 0 },
        }),
      },
    );
    const data = await expectOk(response, 'Gemini');
    const text = (data?.candidates?.[0]?.content?.parts ?? []).map((part: any) => part.text ?? '').join('');
    return { text, confidence: 0.85 };
  }

  // OCR.space por defecto.
  const key = requireKey('OCR_API_KEY');
  const form = new FormData();
  form.append('base64Image', `data:image/jpeg;base64,${image}`);
  form.append('language', 'spa');
  form.append('isTable', 'true');
  form.append('OCREngine', '2');

  const response = await fetch(Deno.env.get('OCR_ENDPOINT') ?? 'https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: key },
    body: form,
  });
  const data = await expectOk(response, 'OCR.space');
  if (data.IsErroredOnProcessing) throw new Error('OCR.space no pudo procesar la imagen');
  return { text: data?.ParsedResults?.[0]?.ParsedText ?? '', confidence: 0.75 };
}

function requireKey(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta configurar ${name} en las variables de la Edge Function.`);
  return value;
}

async function expectOk(response: Response, provider: string) {
  if (!response.ok) throw new Error(`${provider} respondió ${response.status}`);
  return response.json();
}
