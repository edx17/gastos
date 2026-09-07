import { env } from '@/config/env';
import { AiProviderError } from '../provider';
import { edgeComplete, postJson, shouldUseEdge } from '../transport';
import { BaseModelProvider } from './base';

export class GeminiProvider extends BaseModelProvider {
  readonly id = 'gemini' as const;
  readonly model = env.aiModel || 'gemini-1.5-flash';

  protected async complete(system: string, user: string): Promise<string> {
    if (shouldUseEdge()) {
      return edgeComplete({ provider: 'gemini', model: this.model, system, user });
    }
    if (!env.geminiApiKey) {
      throw new AiProviderError('Falta configurar la API key de Gemini.', 'gemini');
    }
    const data = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${env.geminiApiKey}`,
      {},
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      },
      'gemini',
    );
    return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  }
}
