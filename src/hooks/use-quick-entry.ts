import { useCallback, useRef, useState } from 'react';
import { interpret, type InterpretResult } from '@/services/ai';
import { ruleFromCorrection } from '@/services/categorization/engine';
import { useWorkspace } from '@/providers/workspace-provider';
import { toAppError } from './use-async';
import type { AppError } from '@/types/common';
import type { Transaction, TransactionInput } from '@/types/transaction';

export type QuickEntryStep = 'idle' | 'analyzing' | 'amount' | 'merchant' | 'category' | 'done';

export const STEP_LABELS: Record<QuickEntryStep, string> = {
  idle: '',
  analyzing: 'Analizando…',
  amount: 'Detectando importe…',
  merchant: 'Detectando comercio…',
  category: 'Detectando categoría…',
  done: 'Listo',
};

export interface SaveOptions {
  /** How the user's correction should feed the personal rules. */
  learn?: 'always' | 'ask' | 'once';
}

/**
 * Drives the "¿Qué gastaste?" box: interpret → review → save, plus the learning
 * loop that turns a correction into a personal categorization rule.
 */
export function useQuickEntry() {
  const { client, userId, profile, categories, rules, history, refreshHistory, refreshRules, bumpRevision } =
    useWorkspace();
  const [draft, setDraft] = useState<InterpretResult | null>(null);
  const [step, setStep] = useState<QuickEntryStep>('idle');
  const [error, setError] = useState<AppError | null>(null);
  const [saving, setSaving] = useState(false);
  const sequence = useRef(0);

  const analyze = useCallback(
    async (text: string) => {
      const run = ++sequence.current;
      setError(null);
      setDraft(null);
      setStep('analyzing');

      // Staged labels: the pipeline really does run in this order.
      const stages: QuickEntryStep[] = ['amount', 'merchant', 'category'];
      stages.forEach((stage, index) => {
        setTimeout(() => {
          if (sequence.current === run) setStep(stage);
        }, 140 * (index + 1));
      });

      try {
        const result = await interpret(text, {
          profile,
          categories,
          rules,
          history,
          onTrace: (interaction) => {
            void client.logAiInteraction(userId, interaction).catch(() => undefined);
          },
        });
        if (sequence.current !== run) return null;
        setDraft(result);
        setStep('done');
        return result;
      } catch (caught) {
        if (sequence.current !== run) return null;
        setError(toAppError(caught));
        setStep('idle');
        return null;
      }
    },
    [client, userId, profile, categories, rules, history],
  );

  const save = useCallback(
    async (input: TransactionInput, options: SaveOptions = {}): Promise<Transaction> => {
      setSaving(true);
      try {
        const transaction = await client.createTransaction(userId, input);

        if (options.learn && options.learn !== 'once' && input.category_id && profile.ai.learn_from_corrections) {
          await client.upsertRule(
            userId,
            ruleFromCorrection({
              description: input.description,
              merchant: input.merchant_name,
              category_id: input.category_id,
              subcategory_id: input.subcategory_id ?? null,
              strategy: options.learn,
            }),
          );
          await refreshRules();
        }

        await refreshHistory();
        bumpRevision();
        setDraft(null);
        setStep('idle');
        return transaction;
      } finally {
        setSaving(false);
      }
    },
    [client, userId, profile.ai.learn_from_corrections, refreshHistory, refreshRules, bumpRevision],
  );

  const reset = useCallback(() => {
    sequence.current += 1;
    setDraft(null);
    setStep('idle');
    setError(null);
  }, []);

  return { draft, setDraft, step, stepLabel: STEP_LABELS[step], analyze, save, reset, saving, error };
}
