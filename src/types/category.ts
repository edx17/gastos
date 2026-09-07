import type { ISODateTime, UUID } from './common';

export type CategoryKind = 'expense' | 'income' | 'transfer' | 'investment';

export interface Category {
  id: UUID;
  user_id: UUID | null;
  name: string;
  slug: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  position: number;
  is_active: boolean;
  is_system: boolean;
  created_at: ISODateTime;
  updated_at?: ISODateTime;
}

export interface Subcategory {
  id: UUID;
  category_id: UUID;
  user_id: UUID | null;
  name: string;
  slug: string;
  position: number;
  is_active: boolean;
  keywords: string[];
  created_at: ISODateTime;
  updated_at?: ISODateTime;
}

export interface CategoryTree extends Category {
  subcategories: Subcategory[];
}
