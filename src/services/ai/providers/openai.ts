import { env } from '@/config/env';
import { AiProviderError } from '../provider';
import { edgeComplete, postJson, shouldUseEdge } from '../transport';
import { BaseModelProvider } from './base';

export class OpenAiProvider extends BaseModelProvider {
  readonly id = 'openai' as const;
  readonly model = env.aiModel || 'gpt-4o-mini';

  protected async complete(system: string, user: string): Promise<string> {
    if (shouldUseEdge()) {
      return edgeComplete({ provider: 'openai', model: this.model, system, user });
    }
    if (!env.openaiApiKey) {
      throw new AiProviderError('Falta configurar la API key de OpenAI.', 'openai');
    }
    const data = await postJson(
      'https://api.openai.com/v1/chat/completions',
      { Authorization: `Bearer ${env.openaiApiKey}` },
      {
        model: this.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      'openai',
    );
    return data?.choices?.[0]?.message?.content ?? '';
  }
}
