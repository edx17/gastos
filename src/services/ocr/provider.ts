import type { OcrResult } from '@/types/receipt';
import type { OcrProviderId } from '@/config/env';

export interface OcrProvider {
  readonly id: OcrProviderId;
  readonly label: string;
  readonly isMock: boolean;
  recognize(file: Blob): Promise<OcrResult>;
}

export class OcrError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OcrError';
  }
}
