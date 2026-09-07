import type { AiParseRequest, AiParseResponse } from '@/types/ai';
import type { ReceiptItemDraft } from '@/types/receipt';
import type { AiProviderId } from '@/types/user';

export interface AiItemCategorizationRequest {
  merchant: string | null;
  items: { description: string; total: number }[];
  categories: { id: string; name: string; subcategories: { id: string; name: string }[] }[];
}

export interface AiNarrationRequest {
  /** Pre-computed facts. The model rephrases; it never invents the numbers. */
  facts: { label: string; value: string }[];
  question?: string;
  tone?: 'insight' | 'answer';
}

export interface AiProvider {
  readonly id: AiProviderId;
  readonly model: string;
  /** True when the provider produces deterministic local output instead of calling a model. */
  readonly isMock: boolean;
  parse(request: AiParseRequest): Promise<AiParseResponse>;
  categorizeItems(request: AiItemCategorizationRequest): Promise<ReceiptItemDraft[]>;
  narrate(request: AiNarrationRequest): Promise<string>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
