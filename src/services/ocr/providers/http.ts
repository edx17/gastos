import { env, type OcrProviderId } from '@/config/env';
import { fileToBase64 } from '@/lib/files';
import type { OcrResult } from '@/types/receipt';
import { OcrError, type OcrProvider } from '../provider';

const VISION_PROMPT = `Transcribí COMPLETO el texto de este ticket o factura, respetando líneas y columnas.
No resumas, no interpretes, no agregues comentarios. Devolvé solamente el texto.`;

async function edgeOcr(base64: string, provider: string): Promise<OcrResult> {
  const response = await fetch(`${env.supabaseUrl}/functions/v1/ocr-receipt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${env.supabaseAnonKey}`,
    },
    body: JSON.stringify({ provider, image: base64 }),
  });
  if (!response.ok) {
    throw new OcrError(`El servicio de OCR respondió ${response.status}.`, provider);
  }
  const payload = (await response.json()) as { text?: string; confidence?: number; error?: string };
  if (payload.error) throw new OcrError(payload.error, provider);
  return { text: payload.text ?? '', confidence: payload.confidence ?? 0.7, provider };
}

const useEdge = () => env.useEdgeFunctions && env.hasSupabase;

export class OcrSpaceProvider implements OcrProvider {
  readonly id = 'ocrspace' as const;
  readonly label = 'OCR.space';
  readonly isMock = false;

  async recognize(file: Blob): Promise<OcrResult> {
    const base64 = await fileToBase64(file);
    if (useEdge()) return edgeOcr(base64, this.id);
    if (!env.ocrApiKey) throw new OcrError('Falta configurar la API key de OCR.', this.id);

    const body = new FormData();
    body.append('base64Image', `data:image/jpeg;base64,${base64}`);
    body.append('language', 'spa');
    body.append('isTable', 'true');
    body.append('OCREngine', '2');

    const response = await fetch(env.ocrEndpoint || 'https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { apikey: env.ocrApiKey },
      body,
    });
    if (!response.ok) throw new OcrError(`OCR.space respondió ${response.status}.`, this.id);
    const data = (await response.json()) as any;
    if (data.IsErroredOnProcessing) {
      throw new OcrError(String(data.ErrorMessage ?? 'OCR.space no pudo leer la imagen.'), this.id);
    }
    return {
      text: data?.ParsedResults?.[0]?.ParsedText ?? '',
      confidence: 0.75,
      provider: this.id,
    };
  }
}

export class GoogleVisionProvider implements OcrProvider {
  readonly id = 'google_vision' as const;
  readonly label = 'Google Cloud Vision';
  readonly isMock = false;

  async recognize(file: Blob): Promise<OcrResult> {
    const base64 = await fileToBase64(file);
    if (useEdge()) return edgeOcr(base64, this.id);
    if (!env.ocrApiKey) throw new OcrError('Falta configurar la API key de Google Vision.', this.id);

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${env.ocrApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: { languageHints: ['es'] },
          },
        ],
      }),
    });
    if (!response.ok) throw new OcrError(`Google Vision respondió ${response.status}.`, this.id);
    const data = (await response.json()) as any;
    const annotation = data?.responses?.[0]?.fullTextAnnotation;
    return { text: annotation?.text ?? '', confidence: 0.9, provider: this.id };
  }
}

export class AzureVisionProvider implements OcrProvider {
  readonly id = 'azure_vision' as const;
  readonly label = 'Azure Computer Vision';
  readonly isMock = false;

  async recognize(file: Blob): Promise<OcrResult> {
    const base64 = await fileToBase64(file);
    if (useEdge()) return edgeOcr(base64, this.id);
    if (!env.ocrApiKey || !env.ocrEndpoint) {
      throw new OcrError('Falta configurar el endpoint y la API key de Azure.', this.id);
    }
    const response = await fetch(`${env.ocrEndpoint.replace(/\/$/, '')}/computervision/imageanalysis:analyze?features=read&api-version=2024-02-01&language=es`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Ocp-Apim-Subscription-Key': env.ocrApiKey },
      body: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
    });
    if (!response.ok) throw new OcrError(`Azure respondió ${response.status}.`, this.id);
    const data = (await response.json()) as any;
    const lines = (data?.readResult?.blocks ?? []).flatMap((b: any) => b.lines ?? []);
    return {
      text: lines.map((l: any) => l.text).join('\n'),
      confidence: 0.88,
      provider: this.id,
    };
  }
}

/** Vision-capable LLMs used as OCR. Same contract, different transport. */
export class VisionModelOcrProvider implements OcrProvider {
  readonly isMock = false;
  constructor(
    readonly id: OcrProviderId,
    readonly label: string,
  ) {}

  async recognize(file: Blob): Promise<OcrResult> {
    const base64 = await fileToBase64(file);
    if (useEdge()) return edgeOcr(base64, this.id);

    if (this.id === 'openai_vision') {
      if (!env.openaiApiKey) throw new OcrError('Falta configurar la API key de OpenAI.', this.id);
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.openaiApiKey}` },
        body: JSON.stringify({
          model: env.aiModel || 'gpt-4o-mini',
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: VISION_PROMPT },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
              ],
            },
          ],
        }),
      });
      if (!response.ok) throw new OcrError(`OpenAI respondió ${response.status}.`, this.id);
      const data = (await response.json()) as any;
      return { text: data?.choices?.[0]?.message?.content ?? '', confidence: 0.85, provider: this.id };
    }

    if (!env.geminiApiKey) throw new OcrError('Falta configurar la API key de Gemini.', this.id);
    const model = env.aiModel || 'gemini-1.5-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: VISION_PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: base64 } }],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
      },
    );
    if (!response.ok) throw new OcrError(`Gemini respondió ${response.status}.`, this.id);
    const data = (await response.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
    return { text, confidence: 0.85, provider: this.id };
  }
}
