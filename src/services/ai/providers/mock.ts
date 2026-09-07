import { parseIntent } from '@/services/nlp/parser';
import { normalizeText, round } from '@/lib/utils';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import type { AiParseRequest, AiParseResponse } from '@/types/ai';
import type { ReceiptItemDraft } from '@/types/receipt';
import type { AiItemCategorizationRequest, AiNarrationRequest, AiProvider } from '../provider';

/**
 * Development provider. It never calls a model: it reuses the deterministic parser and
 * the keyword taxonomy, so the whole product works end to end with no API key.
 * The UI labels anything produced here as "modo demo".
 */
export class MockAiProvider implements AiProvider {
  readonly id = 'mock' as const;
  readonly model = 'crocante-rules-v1';
  readonly isMock = true;

  async parse(request: AiParseRequest): Promise<AiParseResponse> {
    const intent = parseIntent(request.text, {
      today: new Date(`${request.today}T12:00:00`),
      baseCurrency: request.base_currency,
    });
    const guess = guessCategory(`${intent.merchant ?? ''} ${intent.description}`, intent.type === 'income');

    return {
      type: intent.type,
      amount: intent.amount,
      currency: intent.currency,
      date: intent.date,
      description: intent.description || null,
      merchant: intent.merchant,
      category: guess?.category ?? null,
      subcategory: guess?.subcategory ?? null,
      payment_method: intent.payment_method,
      confidence: intent.confidence,
      question: intent.question ?? null,
    };
  }

  async categorizeItems(request: AiItemCategorizationRequest): Promise<ReceiptItemDraft[]> {
    return request.items.map((item) => {
      const guess = guessCategory(item.description, false);
      const category = request.categories.find((c) => c.name === guess?.category);
      const subcategory = category?.subcategories.find((s) => s.name === guess?.subcategory);
      return {
        description: item.description,
        quantity: 1,
        unit_price: item.total,
        total: item.total,
        category_id: category?.id ?? null,
        subcategory_id: subcategory?.id ?? null,
        category_name: category?.name,
        confidence: guess ? 0.75 : 0.35,
      };
    });
  }

  async narrate(request: AiNarrationRequest): Promise<string> {
    const facts = request.facts.map((f) => `${f.label}: ${f.value}`).join(' · ');
    return request.question ? `${request.question} → ${facts}` : facts;
  }
}

function guessCategory(text: string, income: boolean): { category: string; subcategory: string } | null {
  const haystack = normalizeText(text);
  if (!haystack) return null;

  let best: { score: number; category: string; subcategory: string } | null = null;
  for (const category of DEFAULT_CATEGORIES) {
    if (income !== (category.kind === 'income')) continue;
    for (const sub of category.subcategories) {
      for (const keyword of sub.keywords) {
        const needle = normalizeText(keyword);
        if (!needle || !haystack.includes(needle)) continue;
        const score = round(needle.length + (needle.includes(' ') ? 6 : 0), 2);
        if (!best || score > best.score) best = { score, category: category.name, subcategory: sub.name };
      }
    }
  }
  return best ? { category: best.category, subcategory: best.subcategory } : null;
}
