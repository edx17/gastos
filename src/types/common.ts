export type UUID = string;
/** ISO date, `YYYY-MM-DD` (no timezone games with financial dates). */
export type ISODate = string;
export type ISODateTime = string;

export interface Timestamped {
  created_at: ISODateTime;
  updated_at?: ISODateTime;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export interface AppError {
  code: string;
  /** Message written for a human, in Spanish, never "Something went wrong". */
  message: string;
  hint?: string;
  cause?: unknown;
}

export const err = (code: string, message: string, hint?: string, cause?: unknown): AppError => ({
  code,
  message,
  hint,
  cause,
});
