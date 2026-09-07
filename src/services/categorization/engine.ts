import { normalizeText, round } from '@/lib/utils';
import { findMerchant } from '@/services/nlp/brands';
import type { CategorySuggestion, CategorizationRule } from '@/types/ai';
import type { CategoryTree } from '@/types/category';
import type { Transaction, TransactionType } from '@/types/transaction';
import { DEFAULT_CATEGORIES, FALLBACK_CATEGORY_SLUG, FALLBACK_SUBCATEGORY_SLUG } from '@/constants/categories';

export interface ClassifyInput {
  description: string;
  merchant?: string | null;
  type: TransactionType;
  amount?: number | null;
}

export interface ClassifyContext {
  categories: CategoryTree[];
  rules: CategorizationRule[];
  /** Recent transactions used as the user's own precedent. */
  history: Pick<Transaction, 'description' | 'merchant_name' | 'category_id' | 'subcategory_id' | 'type'>[];
}

const KEYWORDS_BY_SLUG: Record<string, string[]> = {};
for (const category of DEFAULT_CATEGORIES) {
  for (const sub of category.subcategories) {
    KEYWORDS_BY_SLUG[`${category.slug}/${sub.slug}`] = sub.keywords;
  }
}

/**
 * Hybrid classifier: personal rules, then the user's own history, then merchant
 * defaults, then keywords. The AI layer is only asked when this comes back unsure,
 * which keeps the common path instant, private and free.
 */
export function classify(input: ClassifyInput, ctx: ClassifyContext): CategorySuggestion {
  const haystack = normalizeText(`${input.merchant ?? ''} ${input.description}`);
  const kindFilter = kindsFor(input.type);
  const categories = ctx.categories.filter((c) => c.is_active && kindFilter.includes(c.kind));
  const pool = categories.length ? categories : ctx.categories;

  const byRule = matchRule(haystack, ctx.rules, pool);
  if (byRule) return byRule;

  const byHistory = matchHistory(input, ctx, pool);
  if (byHistory) return byHistory;

  const byKeywords = matchKeywords(haystack, pool);
  if (byKeywords) return byKeywords;

  return fallback(ctx.categories, input.type);
}

function kindsFor(type: TransactionType): CategoryTree['kind'][] {
  if (type === 'income' || type === 'refund') return ['income'];
  if (type === 'transfer') return ['investment', 'expense'];
  return ['expense', 'investment'];
}

function matchRule(haystack: string, rules: CategorizationRule[], categories: CategoryTree[]): CategorySuggestion | null {
  const sorted = [...rules].sort((a, b) => b.pattern.length - a.pattern.length);
  for (const rule of sorted) {
    const hit = rule.match_type === 'exact' ? haystack === rule.pattern : haystack.includes(rule.pattern);
    if (!hit) continue;
    const found = locate(categories, rule.category_id, rule.subcategory_id);
    if (!found) continue;
    return {
      ...found,
      confidence: rule.strategy === 'always' ? 0.99 : 0.86,
      reason: `Tenés una regla para «${rule.pattern}».`,
      source: 'user_rule',
    };
  }
  return null;
}

function matchHistory(input: ClassifyInput, ctx: ClassifyContext, categories: CategoryTree[]): CategorySuggestion | null {
  const merchantKey = normalizeText(input.merchant ?? '');
  const descKey = normalizeText(input.description);
  if (!merchantKey && descKey.length < 3) return null;

  const relevant = ctx.history.filter((row) => {
    if (row.type !== input.type) return false;
    if (!row.category_id) return false;
    const rowMerchant = normalizeText(row.merchant_name ?? '');
    const rowDesc = normalizeText(row.description ?? '');
    if (merchantKey && rowMerchant && rowMerchant === merchantKey) return true;
    if (descKey && rowDesc && (rowDesc === descKey || rowDesc.includes(descKey) || descKey.includes(rowDesc))) return true;
    return false;
  });

  if (relevant.length < 1) return null;

  const tally = new Map<string, number>();
  for (const row of relevant) {
    const key = `${row.category_id}|${row.subcategory_id ?? ''}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const [bestKey, hits] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  const [categoryId, subcategoryId] = bestKey.split('|');
  const found = locate(categories, categoryId, subcategoryId || null);
  if (!found) return null;

  const share = hits / relevant.length;
  const confidence = round(Math.min(0.94, 0.62 + share * 0.2 + Math.min(hits, 5) * 0.03), 2);
  return {
    ...found,
    confidence,
    reason:
      hits === 1
        ? 'Lo clasificaste así la última vez que registraste algo parecido.'
        : `Lo clasificaste así ${hits} veces antes.`,
    source: 'history',
  };
}

function matchKeywords(haystack: string, categories: CategoryTree[]): CategorySuggestion | null {
  let best: { score: number; categoryId: string; subcategoryId: string | null; keyword: string } | null = null;

  for (const category of categories) {
    for (const sub of category.subcategories) {
      if (!sub.is_active) continue;
      const keywords = sub.keywords.length ? sub.keywords : KEYWORDS_BY_SLUG[`${category.slug}/${sub.slug}`] ?? [];
      for (const keyword of keywords) {
        if (!keyword) continue;
        const normalizedKeyword = normalizeText(keyword);
        if (!containsWord(haystack, normalizedKeyword)) continue;
        // Longer, more specific keywords beat generic ones ("mercado libre" > "mercado").
        const score = normalizedKeyword.length + (normalizedKeyword.includes(' ') ? 6 : 0);
        if (!best || score > best.score) {
          best = { score, categoryId: category.id, subcategoryId: sub.id, keyword };
        }
      }
    }
  }

  if (!best) return null;
  const found = locate(categories, best.categoryId, best.subcategoryId);
  if (!found) return null;

  const confidence = round(Math.min(0.9, 0.68 + Math.min(best.score, 20) / 100), 2);
  return {
    ...found,
    confidence,
    reason: `Coincide con «${best.keyword}».`,
    source: 'keywords',
  };
}

function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const index = haystack.indexOf(needle);
  if (index === -1) return false;
  const before = haystack[index - 1];
  const after = haystack[index + needle.length];
  const okBefore = before === undefined || /[\s.,$]/.test(before);
  const okAfter = after === undefined || /[\s.,$]/.test(after);
  return okBefore && okAfter;
}

function locate(
  categories: CategoryTree[],
  categoryId: string | null,
  subcategoryId: string | null,
): Omit<CategorySuggestion, 'confidence' | 'reason' | 'source'> | null {
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return null;
  const sub = subcategoryId ? category.subcategories.find((s) => s.id === subcategoryId) ?? null : null;
  return {
    category_id: category.id,
    category_name: category.name,
    subcategory_id: sub?.id ?? null,
    subcategory_name: sub?.name ?? null,
  };
}

function fallback(categories: CategoryTree[], type: TransactionType): CategorySuggestion {
  const slug = type === 'income' || type === 'refund' ? 'ingresos' : FALLBACK_CATEGORY_SLUG;
  const category =
    categories.find((c) => c.slug === slug) ?? categories.find((c) => c.is_active) ?? categories[0];
  const sub =
    category?.subcategories.find((s) => s.slug === FALLBACK_SUBCATEGORY_SLUG || s.slug === 'otros-ingresos') ??
    category?.subcategories[0] ??
    null;

  return {
    category_id: category?.id ?? null,
    category_name: category?.name ?? 'Sin categoría',
    subcategory_id: sub?.id ?? null,
    subcategory_name: sub?.name ?? null,
    confidence: 0.3,
    reason: 'No encontré una coincidencia clara, revisalo antes de guardar.',
    source: 'fallback',
  };
}

/** Builds the rule stored when the user says "usá esto siempre" after a correction. */
export function ruleFromCorrection(args: {
  description: string;
  merchant?: string | null;
  category_id: string;
  subcategory_id: string | null;
  strategy: 'always' | 'ask';
}): Pick<CategorizationRule, 'pattern' | 'match_type' | 'category_id' | 'subcategory_id' | 'strategy'> {
  const merchant = args.merchant ? normalizeText(args.merchant) : '';
  const detected = merchant || findMerchant(normalizeText(args.description))?.alias || '';
  const pattern = detected || normalizeText(args.description);
  return {
    pattern,
    match_type: detected ? 'contains' : 'exact',
    category_id: args.category_id,
    subcategory_id: args.subcategory_id,
    strategy: args.strategy,
  };
}
