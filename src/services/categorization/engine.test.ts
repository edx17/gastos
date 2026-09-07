import { describe, expect, it } from 'vitest';
import { classify, ruleFromCorrection } from './engine';
import { makeCategories, makeTransaction } from '@/test/factories';
import type { CategorizationRule } from '@/types/ai';

const categories = makeCategories();
const empty = { categories, rules: [] as CategorizationRule[], history: [] };

const rule = (overrides: Partial<CategorizationRule>): CategorizationRule => ({
  id: 'rule-1',
  user_id: 'user-1',
  pattern: 'shell',
  match_type: 'contains',
  category_id: 'cat-transporte',
  subcategory_id: 'sub-transporte-combustible',
  strategy: 'always',
  hits: 0,
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('keyword classification', () => {
  const cases: [string, string, string][] = [
    ['Supermercado Carrefour', 'Alimentación', 'Supermercado'],
    ['Nafta', 'Transporte', 'Combustible'],
    ['Netflix', 'Entretenimiento', 'Streaming'],
    ['Cuota del gym', 'Deporte', 'Gimnasio'],
    ['Factura de luz', 'Hogar', 'Electricidad'],
    ['Farmacia', 'Salud', 'Farmacia'],
    ['Alquiler', 'Hogar', 'Alquiler'],
  ];

  it.each(cases)('classifies %s', (description, category, subcategory) => {
    const result = classify({ description, type: 'expense' }, empty);
    expect(result.category_name).toBe(category);
    expect(result.subcategory_name).toBe(subcategory);
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it('prefers the longer, more specific keyword', () => {
    // "detergente" (Hogar › Limpieza) is more specific than "shampoo" here.
    const result = classify({ description: 'shampoo y detergente', type: 'expense' }, empty);
    expect(result.source).toBe('keywords');
    expect(result.category_name).toBe('Hogar');
    expect(result.subcategory_name).toBe('Limpieza');
  });

  it('falls back with low confidence and says so', () => {
    const result = classify({ description: 'zzzz qqqq', type: 'expense' }, empty);
    expect(result.source).toBe('fallback');
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.reason).toMatch(/revisalo/i);
  });

  it('routes income to income categories', () => {
    const result = classify({ description: 'Sueldo', type: 'income' }, empty);
    expect(result.category_name).toBe('Ingresos');
    expect(result.subcategory_name).toBe('Sueldo');
  });
});

describe('personal rules win over keywords', () => {
  it('applies a user rule with near-certain confidence', () => {
    const result = classify(
      { description: 'Shell 30.000', merchant: 'Shell', type: 'expense' },
      { ...empty, rules: [rule({ pattern: 'shell', category_id: 'cat-finanzas', subcategory_id: null, strategy: 'always' })] },
    );
    expect(result.category_name).toBe('Finanzas');
    expect(result.confidence).toBeGreaterThan(0.95);
    expect(result.reason).toContain('regla');
  });

  it('only suggests when the rule was saved as "preguntar"', () => {
    const result = classify(
      { description: 'Shell', merchant: 'Shell', type: 'expense' },
      { ...empty, rules: [rule({ strategy: 'ask', category_id: 'cat-personal', subcategory_id: null })] },
    );
    expect(result.confidence).toBeLessThan(0.9);
    expect(result.source).toBe('user_rule');
  });
});

describe('history as precedent', () => {
  it('follows how the user classified the same merchant before', () => {
    const history = [
      makeTransaction({ merchant_name: 'Shell', description: 'Shell', category_id: 'cat-finanzas', subcategory_id: null }),
      makeTransaction({ merchant_name: 'Shell', description: 'Shell', category_id: 'cat-finanzas', subcategory_id: null }),
    ];
    const result = classify({ description: 'Shell', merchant: 'Shell', type: 'expense' }, { ...empty, history });
    expect(result.category_name).toBe('Finanzas');
    expect(result.source).toBe('history');
    expect(result.reason).toContain('2 veces');
  });

  it('ignores history from a different movement type', () => {
    const history = [
      makeTransaction({ type: 'income', merchant_name: 'Shell', description: 'Shell', category_id: 'cat-ingresos' }),
    ];
    const result = classify({ description: 'Shell nafta', merchant: 'Shell', type: 'expense' }, { ...empty, history });
    expect(result.category_name).toBe('Transporte');
  });
});

describe('the Mercado Libre case from the product spec', () => {
  // Nothing in the default taxonomy claims "Mercado Libre" as an expense: it lands
  // in the fallback until the person corrects it once.
  it('starts out unclassified', () => {
    const result = classify({ description: 'Mercado Libre', merchant: 'Mercado Libre', type: 'expense' }, empty);
    expect(result.source).toBe('fallback');
  });

  it('remembers the correction the next time', () => {
    const correction = ruleFromCorrection({
      description: 'Mercado Libre',
      merchant: 'Mercado Libre',
      category_id: 'cat-hogar',
      subcategory_id: 'sub-hogar-mantenimiento-hogar',
      strategy: 'always',
    });
    const result = classify(
      { description: 'Mercado Libre 25.000', merchant: 'Mercado Libre', type: 'expense' },
      { ...empty, rules: [rule({ ...correction, id: 'rule-ml', user_id: 'user-1', hits: 1, created_at: '2026-01-01T00:00:00.000Z' })] },
    );
    expect(result.category_name).toBe('Hogar');
    expect(result.confidence).toBeGreaterThan(0.9);
  });
});

describe('ruleFromCorrection', () => {
  it('anchors the rule on the merchant when there is one', () => {
    const created = ruleFromCorrection({
      description: 'compra grande',
      merchant: 'Mercado Libre',
      category_id: 'cat-hogar',
      subcategory_id: null,
      strategy: 'always',
    });
    expect(created.pattern).toBe('mercado libre');
    expect(created.match_type).toBe('contains');
  });

  it('falls back to an exact description match', () => {
    const created = ruleFromCorrection({
      description: 'Cuota club de lectura',
      category_id: 'cat-educacion',
      subcategory_id: null,
      strategy: 'ask',
    });
    expect(created.match_type).toBe('exact');
    expect(created.pattern).toBe('cuota club de lectura');
  });
});
