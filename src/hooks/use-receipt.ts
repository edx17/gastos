import { useCallback, useState } from 'react';
import { getOcrProvider } from '@/services/ocr';
import { parseReceiptText } from '@/services/receipts/parser';
import { getAiProvider } from '@/services/ai';
import { classify } from '@/services/categorization/engine';
import { downscaleImage, validateImage } from '@/lib/files';
import { round } from '@/lib/utils';
import { useWorkspace } from '@/providers/workspace-provider';
import { toAppError } from './use-async';
import type { AppError } from '@/types/common';
import type { ParsedReceipt, ReceiptItemDraft } from '@/types/receipt';
import type { TransactionInput } from '@/types/transaction';

export type ReceiptStep = 'idle' | 'uploading' | 'reading' | 'parsing' | 'categorizing' | 'ready' | 'saving';

export const RECEIPT_STEP_LABELS: Record<ReceiptStep, string> = {
  idle: '',
  uploading: 'Preparando la imagen…',
  reading: 'Leyendo el ticket…',
  parsing: 'Detectando comercio, fecha e importes…',
  categorizing: 'Clasificando los productos…',
  ready: 'Listo para revisar',
  saving: 'Guardando…',
};

export interface ReceiptDraft {
  parsed: ParsedReceipt;
  items: ReceiptItemDraft[];
  rawText: string;
  ocrProvider: string;
  ocrConfidence: number;
  isMock: boolean;
  previewUrl: string;
  file: File;
}

/**
 * Photo → OCR → parsed ticket → per-item categories → transaction(s).
 * Every stage reports progress and nothing is written until the user confirms.
 */
export function useReceiptPipeline() {
  const { client, userId, profile, categories, rules, history, refreshHistory, bumpRevision } = useWorkspace();
  const [step, setStep] = useState<ReceiptStep>('idle');
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  const process = useCallback(
    async (file: File) => {
      setError(null);
      setDraft(null);

      const invalid = validateImage(file);
      if (invalid) {
        setError(invalid);
        setStep('idle');
        return null;
      }

      try {
        setStep('uploading');
        const optimised = await downscaleImage(file);

        setStep('reading');
        const provider = getOcrProvider(profile.ai.provider_override === 'mock' ? 'mock' : undefined);
        const ocr = await provider.recognize(optimised);
        if (!ocr.text.trim()) {
          throw {
            code: 'receipt/empty',
            message: 'No pude leer texto en esa foto. Probá con más luz, sin sombras y con el ticket derecho.',
          };
        }

        setStep('parsing');
        const parsed = parseReceiptText(ocr.text, { currency: profile.base_currency });

        setStep('categorizing');
        const items = await categorizeItems(parsed, {
          categories,
          rules,
          history,
        });

        const receiptDraft: ReceiptDraft = {
          parsed,
          items,
          rawText: ocr.text,
          ocrProvider: ocr.provider,
          ocrConfidence: ocr.confidence,
          isMock: Boolean(ocr.mock),
          previewUrl: URL.createObjectURL(file),
          file,
        };
        setDraft(receiptDraft);
        setStep('ready');
        return receiptDraft;
      } catch (caught) {
        setError(toAppError(caught));
        setStep('idle');
        return null;
      }
    },
    [profile, categories, rules, history],
  );

  /**
   * `single` stores the whole ticket as one expense; `split` creates one movement
   * per category so reports reflect what was actually bought.
   */
  const confirm = useCallback(
    async (options: {
      mode: 'single' | 'split';
      total: number;
      date: string;
      merchant: string | null;
      categoryId: string | null;
      subcategoryId: string | null;
      paymentMethodId: string | null;
      items: ReceiptItemDraft[];
      notes?: string;
    }) => {
      if (!draft) return null;
      setStep('saving');
      try {
        const storagePath = await client.uploadReceiptImage(userId, draft.file, draft.file.name);
        const receipt = await client.saveReceipt(
          userId,
          {
            transaction_id: null,
            storage_path: storagePath,
            merchant_name: options.merchant,
            merchant_tax_id: draft.parsed.merchant_tax_id,
            receipt_number: draft.parsed.receipt_number,
            receipt_date: options.date,
            currency: draft.parsed.currency,
            subtotal: draft.parsed.subtotal,
            discount: draft.parsed.discount,
            tax: draft.parsed.tax,
            total: options.total,
            ocr_raw_text: draft.rawText,
            ocr_confidence: draft.ocrConfidence,
            ocr_provider: draft.ocrProvider,
            parsed_data: draft.parsed,
          },
          options.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total,
            category_id: item.category_id ?? null,
            subcategory_id: item.subcategory_id ?? null,
          })),
        );

        const base = {
          type: 'expense' as const,
          currency: draft.parsed.currency,
          transaction_date: options.date,
          merchant_name: options.merchant,
          payment_method_id: options.paymentMethodId,
          source: 'receipt' as const,
          ai_confidence: draft.parsed.confidence,
          receipt_id: receipt.id,
          notes: options.notes,
        };

        let inputs: TransactionInput[];
        if (options.mode === 'split') {
          inputs = groupByCategory(options.items).map((group) => ({
            ...base,
            amount: group.total,
            description: `${options.merchant ?? 'Ticket'} · ${group.categoryName}`,
            category_id: group.categoryId,
            subcategory_id: group.subcategoryId,
            items: group.items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              total: item.total,
              category_id: item.category_id ?? null,
              subcategory_id: item.subcategory_id ?? null,
            })),
          }));
          // Discounts and rounding live on the ticket, not on any single line.
          const itemsTotal = round(inputs.reduce((acc, input) => acc + input.amount, 0), 2);
          if (itemsTotal > 0 && Math.abs(itemsTotal - options.total) > 0.5) {
            const factor = options.total / itemsTotal;
            inputs = inputs.map((input) => ({ ...input, amount: round(input.amount * factor, 2) }));
          }
        } else {
          inputs = [
            {
              ...base,
              amount: options.total,
              description: options.merchant ?? 'Ticket de compra',
              category_id: options.categoryId,
              subcategory_id: options.subcategoryId,
              items: options.items.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total: item.total,
                category_id: item.category_id ?? null,
                subcategory_id: item.subcategory_id ?? null,
              })),
            },
          ];
        }

        const created = await client.createTransactions(userId, inputs);
        await client.linkReceiptToTransaction(receipt.id, created[0].id);
        await refreshHistory();
        bumpRevision();
        setDraft(null);
        setStep('idle');
        return created;
      } catch (caught) {
        setError(toAppError(caught));
        setStep('ready');
        return null;
      }
    },
    [draft, client, userId, refreshHistory, bumpRevision],
  );

  const reset = useCallback(() => {
    setDraft(null);
    setStep('idle');
    setError(null);
  }, []);

  return { step, stepLabel: RECEIPT_STEP_LABELS[step], draft, setDraft, process, confirm, reset, error };
}

async function categorizeItems(
  parsed: ParsedReceipt,
  ctx: Parameters<typeof classify>[1],
): Promise<ReceiptItemDraft[]> {
  const local = parsed.items.map((item) => {
    const suggestion = classify({ description: item.description, merchant: parsed.merchant, type: 'expense' }, ctx);
    return {
      ...item,
      category_id: suggestion.category_id,
      subcategory_id: suggestion.subcategory_id,
      category_name: suggestion.category_name,
      confidence: suggestion.confidence,
    } satisfies ReceiptItemDraft;
  });

  const unsure = local.filter((item) => (item.confidence ?? 0) < 0.6);
  const provider = getAiProvider();
  if (!unsure.length || provider.isMock) return local;

  try {
    const enriched = await provider.categorizeItems({
      merchant: parsed.merchant,
      items: unsure.map((item) => ({ description: item.description, total: item.total })),
      categories: ctx.categories.map((c) => ({
        id: c.id,
        name: c.name,
        subcategories: c.subcategories.map((s) => ({ id: s.id, name: s.name })),
      })),
    });
    return local.map((item) => {
      const better = enriched.find((row) => row.description === item.description);
      return better && (better.confidence ?? 0) > (item.confidence ?? 0) ? { ...item, ...better } : item;
    });
  } catch {
    // The model is optional: the local classification is already usable.
    return local;
  }
}

function groupByCategory(items: ReceiptItemDraft[]) {
  const groups = new Map<string, { categoryId: string | null; subcategoryId: string | null; categoryName: string; total: number; items: ReceiptItemDraft[] }>();
  for (const item of items) {
    const key = `${item.category_id ?? 'sin'}|${item.subcategory_id ?? 'sin'}`;
    const group = groups.get(key) ?? {
      categoryId: item.category_id ?? null,
      subcategoryId: item.subcategory_id ?? null,
      categoryName: item.category_name ?? 'Sin categoría',
      total: 0,
      items: [],
    };
    group.total = round(group.total + item.total, 2);
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}
