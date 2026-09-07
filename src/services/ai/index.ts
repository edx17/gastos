import { env } from '@/config/env';
import { round } from '@/lib/utils';
import { parseIntent } from '@/services/nlp/parser';
import { classify, type ClassifyContext } from '@/services/categorization/engine';
import type { AiInteraction, AiParseRequest, CategorySuggestion, DraftTransaction, ParsedIntent } from '@/types/ai';
import type { CategoryTree } from '@/types/category';
import type { Profile, AiProviderId } from '@/types/user';
import { MockAiProvider } from './providers/mock';
import { OpenAiProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';
import type { AiProvider } from './provider';

export * from './provider';

let cached: { id: AiProviderId; instance: AiProvider } | null = null;

export function getAiProvider(override?: AiProviderId): AiProvider {
  const id = override ?? env.aiProvider ?? 'mock';
  if (cached?.id === id) return cached.instance;
  const instance = createProvider(id);
  cached = { id, instance };
  return instance;
}

function createProvider(id: AiProviderId): AiProvider {
  switch (id) {
    case 'openai':
      return new OpenAiProvider();
    case 'anthropic':
      return new AnthropicProvider();
    case 'gemini':
      return new GeminiProvider();
    default:
      return new MockAiProvider();
  }
}

export type TraceSink = (interaction: Omit<AiInteraction, 'id' | 'user_id' | 'created_at'>) => void;

export interface InterpretOptions extends ClassifyContext {
  profile: Pick<Profile, 'base_currency' | 'ai'>;
  today?: Date;
  onTrace?: TraceSink;
}

export interface InterpretResult extends DraftTransaction {
  /** Set when the AI call failed and the deterministic parser carried the request. */
  degraded?: string;
  provider: string;
}

/**
 * The single entry point the UI uses to turn a sentence into a reviewable draft.
 *
 * Rules run first and always. The model is consulted only when the rules are unsure,
 * so a missing key or a provider outage degrades quality instead of breaking the feature.
 */
export async function interpret(text: string, options: InterpretOptions): Promise<InterpretResult> {
  const { profile, categories, rules, history, today = new Date(), onTrace } = options;
  const provider = getAiProvider(profile.ai.provider_override);

  const base = parseIntent(text, { today, baseCurrency: profile.base_currency });
  let intent: ParsedIntent = base;
  let degraded: string | undefined;
  let aiCategory: { category: string | null; subcategory: string | null } | null = null;

  const needsModel = !provider.isMock && (base.confidence < 0.85 || base.missing.length > 0);

  if (needsModel && profile.ai.share_data_with_ai !== false) {
    const request: AiParseRequest = {
      text,
      today: base.date,
      base_currency: profile.base_currency,
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        subcategories: c.subcategories.map((s) => ({ id: s.id, name: s.name })),
      })),
      hints: history.slice(0, 12).map((h) => ({
        text: h.description,
        category: categories.find((c) => c.id === h.category_id)?.name ?? '',
        subcategory:
          categories.find((c) => c.id === h.category_id)?.subcategories.find((s) => s.id === h.subcategory_id)?.name ??
          null,
      })),
    };

    const started = performance.now();
    try {
      const response = await provider.parse(request);
      onTrace?.({
        kind: 'parse',
        provider: provider.id,
        model: provider.model,
        input: text,
        output: JSON.stringify(response),
        confidence: response.confidence,
        latency_ms: Math.round(performance.now() - started),
        success: true,
      });
      intent = mergeIntents(base, response);
      aiCategory = { category: response.category, subcategory: response.subcategory };
    } catch (error) {
      degraded = error instanceof Error ? error.message : 'No pude consultar el modelo de IA.';
      onTrace?.({
        kind: 'parse',
        provider: provider.id,
        model: provider.model,
        input: text,
        output: '',
        confidence: null,
        latency_ms: Math.round(performance.now() - started),
        success: false,
        error: degraded,
      });
    }
  }

  let suggestion = classify(
    {
      description: intent.description,
      merchant: intent.merchant,
      type: intent.type === 'unknown' ? 'expense' : intent.type,
      amount: intent.amount,
    },
    { categories, rules, history },
  );

  // The model's own category only wins when the local engine had nothing better.
  if (aiCategory?.category && suggestion.confidence < 0.8) {
    const fromAi = resolveCategoryByName(categories, aiCategory.category, aiCategory.subcategory);
    if (fromAi) {
      suggestion = {
        ...fromAi,
        confidence: Math.max(suggestion.confidence, Math.min(intent.confidence, 0.85)),
        reason: 'Sugerida por la IA a partir de tu descripción.',
        source: 'ai',
      };
    }
  }

  return {
    intent,
    suggestion,
    action: decideAction(intent, suggestion, profile),
    degraded,
    provider: provider.isMock ? 'demo' : provider.id,
  };
}

/** Keeps deterministic values (amounts, dates) unless the rules could not find them. */
export function mergeIntents(base: ParsedIntent, ai: Awaited<ReturnType<AiProvider['parse']>>): ParsedIntent {
  const amount = base.amount ?? ai.amount;
  const description = base.description || ai.description || '';
  const missing = [...base.missing].filter((field) => {
    if (field === 'amount') return amount === null;
    if (field === 'description') return !description;
    return true;
  });

  return {
    ...base,
    type: base.confidence >= 0.7 ? base.type : (ai.type as ParsedIntent['type']),
    amount,
    currency: base.currency_explicit ? base.currency : ai.currency ?? base.currency,
    date: base.date_explicit ? base.date : ai.date ?? base.date,
    description,
    merchant: base.merchant ?? ai.merchant,
    payment_method: base.payment_method ?? ai.payment_method,
    confidence: round(Math.max(base.confidence, Math.min(ai.confidence, 0.97)), 2),
    missing,
    question: missing.length ? ai.question ?? base.question : undefined,
    engine: 'hybrid',
  };
}

export function decideAction(
  intent: ParsedIntent,
  suggestion: CategorySuggestion,
  profile: Pick<Profile, 'ai'>,
): DraftTransaction['action'] {
  if (intent.missing.length || intent.amount === null) return 'ask';
  const combined = Math.min(intent.confidence, suggestion.confidence + 0.1);
  if (combined >= profile.ai.autosave_threshold) return 'save';
  if (combined >= profile.ai.ask_threshold) return 'confirm';
  return 'ask';
}

function resolveCategoryByName(
  categories: CategoryTree[],
  categoryName: string,
  subcategoryName: string | null,
): Pick<CategorySuggestion, 'category_id' | 'category_name' | 'subcategory_id' | 'subcategory_name'> | null {
  const category = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
  if (!category) return null;
  const sub = subcategoryName
    ? category.subcategories.find((s) => s.name.toLowerCase() === subcategoryName.toLowerCase()) ?? null
    : null;
  return {
    category_id: category.id,
    category_name: category.name,
    subcategory_id: sub?.id ?? null,
    subcategory_name: sub?.name ?? null,
  };
}
