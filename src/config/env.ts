import type { AiProviderId } from '@/types/user';

const raw = import.meta.env as Record<string, string | undefined>;

const str = (key: string, fallback = ''): string => (raw[key] ?? fallback).trim();
const num = (key: string, fallback: number): number => {
  const v = Number(raw[key]);
  return Number.isFinite(v) ? v : fallback;
};

export type OcrProviderId = 'mock' | 'ocrspace' | 'google_vision' | 'azure_vision' | 'openai_vision' | 'gemini_vision';

export const env = {
  supabaseUrl: str('VITE_SUPABASE_URL'),
  supabaseAnonKey: str('VITE_SUPABASE_ANON_KEY'),

  aiProvider: (str('VITE_AI_PROVIDER', 'mock') as AiProviderId) || 'mock',
  aiModel: str('VITE_AI_MODEL'),
  /**
   * Direct-from-browser keys are a development convenience only. In production the
   * calls are proxied by the `ai-parse` / `ocr-receipt` Edge Functions so the keys
   * never reach the client.
   */
  openaiApiKey: str('VITE_OPENAI_API_KEY'),
  anthropicApiKey: str('VITE_ANTHROPIC_API_KEY'),
  geminiApiKey: str('VITE_GEMINI_API_KEY'),
  /** When set, AI/OCR go through Supabase Edge Functions instead of direct calls. */
  useEdgeFunctions: str('VITE_USE_EDGE_FUNCTIONS', 'true') !== 'false',

  ocrProvider: (str('VITE_OCR_PROVIDER', 'mock') as OcrProviderId) || 'mock',
  ocrApiKey: str('VITE_OCR_API_KEY'),
  ocrEndpoint: str('VITE_OCR_ENDPOINT'),

  baseCurrency: str('VITE_BASE_CURRENCY', 'ARS'),
  maxReceiptSizeMb: num('VITE_MAX_RECEIPT_MB', 8),

  get hasSupabase() {
    return Boolean(this.supabaseUrl && this.supabaseAnonKey);
  },
} as const;

/** `local` = demo mode on top of the browser store; `supabase` = real backend. */
export const backendMode: 'local' | 'supabase' = env.hasSupabase ? 'supabase' : 'local';
