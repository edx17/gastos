/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_AI_PROVIDER?: string;
  readonly VITE_AI_MODEL?: string;
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_ANTHROPIC_API_KEY?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_USE_EDGE_FUNCTIONS?: string;
  readonly VITE_OCR_PROVIDER?: string;
  readonly VITE_OCR_API_KEY?: string;
  readonly VITE_OCR_ENDPOINT?: string;
  readonly VITE_BASE_CURRENCY?: string;
  readonly VITE_MAX_RECEIPT_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
