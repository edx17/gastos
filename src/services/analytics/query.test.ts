import { describe, expect, it } from 'vitest';
import { answerFinanceQuestion } from './query';
import { makeCategories, makeTransaction } from '@/test/factories';

const categories = makeCategories();
const today = new Date(2026, 8, 7);

const transactions = [
  makeTransaction({ amount: 120_000, base_amount: 120_000, transaction_date: '2026-09-02', category_id: 'cat-alimentacion', subcategory_id: 'sub-alimentacion-supermercado', merchant_name: 'Carrefour', description: 'Carrefour' }),
  makeTransaction({ amount: 30_000, base_amount: 30_000, transaction_date: '2026-09-05', category_id: 'cat-alimentacion', subcategory_id: 'sub-alimentacion-delivery', merchant_name: 'PedidosYa', description: 'PedidosYa' }),
  makeTransaction({ amount: 45_000, base_amount: 45_000, transaction_date: '2026-09-06', category_id: 'cat-transporte', subcategory_id: 'sub-transporte-combustible', merchant_name: 'YPF', description: 'YPF' }),
  makeTransaction({ amount: 80_000, base_amount: 80_000, transaction_date: '2026-08-14', category_id: 'cat-alimentacion', subcategory_id: 'sub-alimentacion-supermercado', merchant_name: 'Coto', description: 'Coto' }),
  makeTransaction({ type: 'income', amount: 1_500_000, base_amount: 1_500_000, transaction_date: '2026-09-05', category_id: 'cat-ingresos', description: 'Sueldo' }),
  // Sábado 5 y domingo 6 de septiembre de 2026.
  makeTransaction({ amount: 25_000, base_amount: 25_000, transaction_date: '2026-09-05', category_id: 'cat-entretenimiento', description: 'Salida' }),
];

const ask = (question: string) =>
  answerFinanceQuestion(question, { transactions, categories, currency: 'ARS', today });

describe('answerFinanceQuestion', () => {
  it('answers how much was spent on food this month', () => {
    const answer = ask('¿Cuánto gasté en comida este mes?');
    expect(answer.answer).toContain('$150.000');
    expect(answer.used.filters).toContain('Alimentación');
    expect(answer.used.transactions).toBe(2);
  });

  it('scopes a named month', () => {
    const answer = ask('¿Cuánto gasté en supermercados en agosto?');
    expect(answer.used.from).toBe('2026-08-01');
    expect(answer.answer).toContain('$80.000');
  });

  it('answers where the money went', () => {
    const answer = ask('¿Dónde se me fue más plata este mes?');
    expect(answer.answer).toContain('Alimentación');
    expect(answer.chart?.kind).toBe('pie');
  });

  it('answers about a specific merchant', () => {
    const answer = ask('¿Cuánto gasté en YPF?');
    expect(answer.answer).toContain('$45.000');
    expect(answer.used.filters).toContain('YPF');
  });

  it('answers about income', () => {
    const answer = ask('¿Cuánto cobré este mes?');
    expect(answer.answer).toContain('$1.500.000');
  });

  it('answers about savings', () => {
    const answer = ask('¿Cuánto ahorré este mes?');
    expect(answer.metrics.map((m) => m.label)).toEqual(['Ingresos', 'Gastos', 'Ahorro']);
  });

  it('filters weekends', () => {
    const answer = ask('¿Cuánto gasté el fin de semana?');
    expect(answer.used.filters).toContain('fines de semana');
  });

  it('says plainly when there is nothing to report', () => {
    const answer = ask('¿Cuánto gasté en educación este mes?');
    expect(answer.answer).toMatch(/no encontré/i);
    expect(answer.metrics).toHaveLength(0);
  });

  it('always reports the rows behind the answer', () => {
    const answer = ask('¿Cuánto gasté este mes?');
    expect(answer.used.from).toBe('2026-09-01');
    expect(answer.used.to).toBe('2026-09-30');
    expect(answer.used.transactions).toBeGreaterThan(0);
  });
});
