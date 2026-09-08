import type { CurrencyCode } from './currency';
import type { ISODateTime, UUID } from './common';

export interface AuthUser {
  id: UUID;
  email: string;
  created_at: ISODateTime;
}

export type AiProviderId = 'mock' | 'openai' | 'anthropic' | 'gemini';

export interface AiPreferences {
  /** Autosave when the parser/AI is at least this confident. */
  autosave_threshold: number;
  /** Below this, Crocante asks for missing data instead of guessing. */
  ask_threshold: number;
  learn_from_corrections: boolean;
  share_data_with_ai: boolean;
  provider_override?: AiProviderId;
}

export interface Profile {
  id: UUID;
  user_id: UUID;
  display_name: string;
  avatar_url?: string | null;
  base_currency: CurrencyCode;
  locale: string;
  timezone: string;
  ai: AiPreferences;
  onboarding_done: boolean;
  favorite_category_ids: UUID[];
  created_at: ISODateTime;
  updated_at?: ISODateTime;
}

export interface Household {
  id: UUID;
  name: string;
  owner_id: UUID;
  base_currency: CurrencyCode;
  split_mode: 'equal' | 'income_ratio' | 'custom';
  created_at: ISODateTime;
}

export interface HouseholdMember {
  id: UUID;
  household_id: UUID;
  /** Null cuando la persona participa del hogar pero no usa la app. */
  user_id: UUID | null;
  role: 'owner' | 'member' | 'viewer';
  display_name: string;
  invite_email?: string | null;
  color: string;
  /** Parte que le corresponde del gasto compartido (se normaliza sobre el total). */
  share: number;
  is_active: boolean;
  created_at: ISODateTime;
}

/** Cuánto puso cada persona y cuánto le correspondía en un período. */
export interface HouseholdBalance {
  member_id: UUID;
  display_name: string;
  color: string;
  share: number;
  paid: number;
  owed: number;
  /** Positivo: puso de más y el resto le debe. */
  balance: number;
}

/** Quién le tiene que transferir cuánto a quién para quedar a mano. */
export interface Settlement {
  from: string;
  to: string;
  amount: number;
}
