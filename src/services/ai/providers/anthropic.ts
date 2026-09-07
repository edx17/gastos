import { env } from '@/config/env';
import { AiProviderError } from '../provider';
import { edgeComplete, postJson, shouldUseEdge } from '../transport';
import { BaseModelProvider } from './base';

export class AnthropicProvider extends BaseModelProvider {
  readonly id = 'anthropic' as const;
  readonly model = env.aiModel || 'claude-sonnet-4-5';

  protected async complete(system: string, user: string): Promise<string> {
    if (shouldUseEdge()) {
      return edgeComplete({ provider: 'anthropic', model: this.model, system, user });
    }
    if (!env.anthropicApiKey) {
      throw new AiProviderError('Falta configurar la API key de Anthropic.', 'anthropic');
    }
    const data = await postJson(
      'https://api.anthropic.com/v1/messages',
      {
        'x-api-key': env.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      {
        model: this.model,
        max_tokens: 1024,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: user }],
      },
      'anthropic',
    );
    const blocks = data?.content ?? [];
    return blocks.map((b: { text?: string }) => b.text ?? '').join('');
  }
}
