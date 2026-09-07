import type { ISODateTime, UUID } from './common';

export interface AppNotification {
  id: UUID;
  user_id: UUID;
  kind: 'budget_alert' | 'goal_progress' | 'recurring_detected' | 'system';
  title: string;
  body: string;
  read_at: ISODateTime | null;
  link?: string | null;
  created_at: ISODateTime;
}
