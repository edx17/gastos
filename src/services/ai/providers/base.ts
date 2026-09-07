import { round } from '@/lib/utils';
import type { AiParseRequest, AiParseResponse } from '@/types/ai';
import type { ReceiptItemDraft } from '@/types/receipt';
import type { AiProviderId } from '@/types/user';
import { AiProviderError, type AiItemCategorizationRequest, type AiNarrationRequest, type AiProvider } from '../provider';
import {
  ITEMS_SYSTEM_PROMPT,
  NARRATION_SYSTEM_PROMPT,
  PARSE_SYSTEM_PROMPT,
  buildParseUserPrompt,
} from '../prompts';

/** Shared behaviour for every hosted model: prompt building, JSON extraction, validation. */
export abstract class BaseModelProvider implements AiProvider {
  abstract readonly id: AiProviderId;
  abstract readonly model: string;
  readonly isMock = false;

  protected abstract complete(system: string, user: string): Promise<string>;

  async parse(request: AiParseRequest): Promise<AiParseResponse> {
    const raw = await this.complete(PARSE_SYSTEM_PROMPT, buildParseUserPrompt(request));
    const json = extractJson<Record<string, unknown>>(raw, this.id);
    return normalizeParseResponse(json, request);
  }

  async categorizeItems(request: AiItemCategorizationRequest): Promise<ReceiptItemDraft[]> {
    const catalogue = request.categories
      .map((c) => `- ${c.name}: ${c.subcategories.map((s) => s.name).join(', ')}`)
      .join('\n');
    const user = `Comercio: ${request.merchant ?? 'desconocido'}

Categorías:
${catalogue}

Productos:
${request.items.map((i, index) => `${index + 1}. ${i.description} — ${i.total}`).join('\n')}`;

    const raw = await this.complete(ITEMS_SYSTEM_PROMPT, user);
    const parsed = extractJson<{ description: string; category: string; subcategory?: string; confidence?: number }[]>(
      raw,
      this.id,
    );
    const rows = Array.isArray(parsed) ? parsed : [];

    return request.items.map((item, index) => {
      const match = rows[index] ?? rows.find((r) => r?.description === item.description);
      const category = request.categories.find((c) => c.name === match?.category);
      const subcategory = category?.subcategories.find((s) => s.name === match?.subcategory);
      return {
        description: item.description,
        quantity: 1,
        unit_price: item.total,
        total: item.total,
        category_id: category?.id ?? null,
        subcategory_id: subcategory?.id ?? null,
        category_name: category?.name,
        confidence: typeof match?.confidence === 'number' ? match.confidence : 0.6,
      };
    });
  }

  async narrate(request: AiNarrationRequest): Promise<string> {
    const facts = request.facts.map((f) => `- ${f.label}: ${f.value}`).join('\n');
    const user = request.question ? `Pregunta: ${request.question}\n\nDatos:\n${facts}` : `Datos:\n${facts}`;
    const raw = await this.complete(NARRATION_SYSTEM_PROMPT, user);
    return raw.trim();
  }
}

export function extractJson<T>(raw: string, provider: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) throw new AiProviderError('El modelo no devolvió datos utilizables.', provider);
  const candidate = cleaned.slice(start);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Trailing prose after the JSON is common — keep only the balanced prefix.
    const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
    if (end > 0) {
      try {
        return JSON.parse(candidate.slice(0, end + 1)) as T;
      } catch {
        /* fall through */
      }
    }
    throw new AiProviderError('No pude leer la respuesta del modelo.', provider);
  }
}

export function normalizeParseResponse(json: Record<string, unknown>, request: AiParseRequest): AiParseResponse {
  const num = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return round(value, 2);
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[^\d.-]/g, ''));
      return Number.isFinite(parsed) ? round(parsed, 2) : null;
    }
    return null;
  };
  const str = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() && value.trim().toLowerCase() !== 'null' ? value.trim() : null;

  const types = ['expense', 'income', 'transfer', 'refund', 'adjustment'];
  const type = str(json.type);
  const confidence = num(json.confidence);

  return {
    type: (type && types.includes(type) ? type : 'expense') as AiParseResponse['type'],
    amount: num(json.amount),
    currency: (str(json.currency) as AiParseResponse['currency']) ?? request.base_currency,
    date: str(json.date) ?? request.today,
    description: str(json.description),
    merchant: str(json.merchant),
    category: str(json.category),
    subcategory: str(json.subcategory),
    payment_method: str(json.payment_method),
    confidence: confidence === null ? 0.6 : Math.min(Math.max(confidence, 0), 1),
    question: str(json.question),
  };
}
