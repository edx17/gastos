import { env, type OcrProviderId } from '@/config/env';
import type { OcrProvider } from './provider';
import { MockOcrProvider } from './providers/mock';
import { AzureVisionProvider, GoogleVisionProvider, OcrSpaceProvider, VisionModelOcrProvider } from './providers/http';

export * from './provider';

let cached: { id: OcrProviderId; instance: OcrProvider } | null = null;

export function getOcrProvider(override?: OcrProviderId): OcrProvider {
  const id = override ?? env.ocrProvider ?? 'mock';
  if (cached?.id === id) return cached.instance;
  const instance = createOcrProvider(id);
  cached = { id, instance };
  return instance;
}

function createOcrProvider(id: OcrProviderId): OcrProvider {
  switch (id) {
    case 'ocrspace':
      return new OcrSpaceProvider();
    case 'google_vision':
      return new GoogleVisionProvider();
    case 'azure_vision':
      return new AzureVisionProvider();
    case 'openai_vision':
      return new VisionModelOcrProvider('openai_vision', 'OpenAI Vision');
    case 'gemini_vision':
      return new VisionModelOcrProvider('gemini_vision', 'Gemini Vision');
    default:
      return new MockOcrProvider();
  }
}

export const OCR_PROVIDER_LABELS: Record<OcrProviderId, string> = {
  mock: 'Demo (sin proveedor)',
  ocrspace: 'OCR.space',
  google_vision: 'Google Cloud Vision',
  azure_vision: 'Azure Computer Vision',
  openai_vision: 'OpenAI Vision',
  gemini_vision: 'Gemini Vision',
};
