import { uid } from '@/lib/utils';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import type { CategoryTree } from '@/types/category';
import type { Transaction } from '@/types/transaction';

/** Category tree with stable ids, mirroring what the backend returns. */
export function makeCategories(userId = 'user-1'): CategoryTree[] {
  return DEFAULT_CATEGORIES.map((seed, index) => {
    const categoryId = `cat-${seed.slug}`;
    return {
      id: categoryId,
      user_id: userId,
      name: seed.name,
      slug: seed.slug,
      kind: seed.kind,
      icon: seed.icon,
      color: seed.color,
      position: index,
      is_active: true,
      is_system: true,
      created_at: '2026-01-01T00:00:00.000Z',
      subcategories: seed.subcategories.map((sub, subIndex) => ({
        id: `sub-${seed.slug}-${sub.slug}`,
        category_id: categoryId,
        user_id: userId,
        name: sub.name,
        slug: sub.slug,
        position: subIndex,
        is_active: true,
        keywords: sub.keywords,
        created_at: '2026-01-01T00:00:00.000Z',
      })),
    } satisfies CategoryTree;
  });
}

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const amount = overrides.amount ?? 1000;
  return {
    id: uid(),
    user_id: 'user-1',
    household_id: null,
    type: 'expense',
    amount,
    currency: 'ARS',
    base_amount: overrides.base_amount ?? amount,
    base_currency: 'ARS',
    exchange_rate: 1,
    description: 'Gasto',
    merchant_id: null,
    merchant_name: null,
    category_id: null,
    subcategory_id: null,
    payment_method_id: null,
    account_id: null,
    transaction_date: '2026-09-01',
    source: 'manual',
    created_at: '2026-09-01T12:00:00.000Z',
    ...overrides,
  };
}
