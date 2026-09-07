import { backendMode } from '@/config/env';
import { LocalDataClient } from './local';
import { SupabaseDataClient } from './supabase';
import type { DataClient } from './types';

export type { DataClient } from './types';

let instance: DataClient | null = null;

/** The app talks to exactly one backend, chosen at startup from the environment. */
export function getDataClient(): DataClient {
  instance ??= backendMode === 'supabase' ? new SupabaseDataClient() : new LocalDataClient();
  return instance;
}

export const isDemoBackend = () => backendMode === 'local';
