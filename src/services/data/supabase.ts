import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import { env } from '@/config/env';
import { lastNMonths, monthRange, previousRange, today, toISO } from '@/lib/date';
import { convert } from '@/lib/money';
import { expandInstallments } from './installments';
import { normalizeText, round } from '@/lib/utils';
import { err } from '@/types/common';
import type { Paginated, UUID } from '@/types/common';
import type { AiInteraction, CategorizationRule } from '@/types/ai';
import type { Budget, BudgetProgress } from '@/types/budget';
import type { Category, CategoryTree, Subcategory } from '@/types/category';
import type { CurrencyCode, ExchangeRate } from '@/types/currency';
import type { Goal, GoalContribution, GoalProjection } from '@/types/goal';
import type { AppNotification } from '@/types/notification';
import type { PlanUsage, Subscription } from '@/types/plan';
import type { Receipt, ReceiptItem } from '@/types/receipt';
import type {
  CategoryBreakdown,
  CurrencyHolding,
  DailyPoint,
  DashboardSummary,
  MonthlyPoint,
  PendingInstallment,
  PeriodSummary,
  RecurringExpense,
  ReportBundle,
  SubcategoryBreakdown,
} from '@/types/report';
import type {
  Account,
  AccountBalancePoint,
  AccountDelta,
  AccountInput,
  Merchant,
  PaymentMethod,
  Transaction,
  TransactionFilters,
  TransactionInput,
  TransactionItem,
} from '@/types/transaction';
import type { AuthUser, Household, HouseholdBalance, HouseholdMember, Profile } from '@/types/user';
import { formatMonthLabel } from '@/lib/date';
import { MEMBER_COLORS, budgetStatus, projectGoal } from './local';
import { describeDbError, getSupabase } from './supabase-client';
import type { DataClient, DateRangeInput } from './types';

const RECEIPT_BUCKET = 'receipts';

/**
 * PostgreSQL-backed implementation.
 *
 * Aggregations run as SQL functions (`report_*`) so reports never pull raw rows
 * into the browser, and every table is protected by RLS on the server side.
 */
export class SupabaseDataClient implements DataClient {
  readonly mode = 'supabase' as const;
  private get db(): SupabaseClient {
    return getSupabase();
  }

  // ---------------------------------------------------------------- auth

  async signUp(email: string, password: string, displayName: string): Promise<AuthUser> {
    const { data, error } = await this.db.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) throw err('auth/signup-failed', translateAuthError(error.message));
    if (!data.user) throw err('auth/confirm-email', 'Te mandamos un mail para confirmar la cuenta.');
    return { id: data.user.id, email: data.user.email ?? email, created_at: data.user.created_at };
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.db.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data.user) throw err('auth/invalid-credentials', translateAuthError(error?.message));
    return { id: data.user.id, email: data.user.email ?? email, created_at: data.user.created_at };
  }

  async signInWithGoogle(): Promise<void> {
    const { error } = await this.db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app/dashboard` },
    });
    if (error) throw err('auth/oauth-failed', 'No pude iniciar el acceso con Google. Probá con email y contraseña.');
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const { data } = await this.db.auth.getUser();
    if (!data.user) return null;
    return { id: data.user.id, email: data.user.email ?? '', created_at: data.user.created_at };
  }

  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
    const { data } = this.db.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      callback(user ? { id: user.id, email: user.email ?? '', created_at: user.created_at } : null);
    });
    return () => data.subscription.unsubscribe();
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.db.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.db.auth.updateUser({ password: newPassword });
    if (error) throw err('auth/update-password', translateAuthError(error.message));
  }

  // ------------------------------------------------------------- profile

  async getProfile(userId: UUID): Promise<Profile> {
    const { data, error } = await this.db.from('profiles').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw dbError(error);
    if (data) return rowToProfile(data);

    // The trigger creates it on sign-up; this covers accounts created before it existed.
    const { data: created, error: insertError } = await this.db
      .from('profiles')
      .insert({ user_id: userId, display_name: 'Mi cuenta', base_currency: env.baseCurrency })
      .select()
      .single();
    if (insertError) throw dbError(insertError);
    return rowToProfile(created);
  }

  async updateProfile(userId: UUID, patch: Partial<Profile>): Promise<Profile> {
    const payload: Record<string, unknown> = {};
    if (patch.display_name !== undefined) payload.display_name = patch.display_name;
    if (patch.base_currency !== undefined) payload.base_currency = patch.base_currency;
    if (patch.locale !== undefined) payload.locale = patch.locale;
    if (patch.timezone !== undefined) payload.timezone = patch.timezone;
    if (patch.ai !== undefined) payload.ai_preferences = patch.ai;
    if (patch.default_payment_method_id !== undefined) payload.default_payment_method_id = patch.default_payment_method_id;
    if (patch.require_payment_method !== undefined) payload.require_payment_method = patch.require_payment_method;
    if (patch.onboarding_done !== undefined) payload.onboarding_done = patch.onboarding_done;
    if (patch.favorite_category_ids !== undefined) payload.favorite_category_ids = patch.favorite_category_ids;

    const { data, error } = await this.db.from('profiles').update(payload).eq('user_id', userId).select().single();
    if (error) throw dbError(error);
    return rowToProfile(data);
  }

  async listHouseholds(userId: UUID): Promise<Household[]> {
    const { data, error } = await this.db
      .from('households')
      .select('*, household_members!inner(user_id)')
      .eq('household_members.user_id', userId);
    if (error) throw dbError(error);
    return (data ?? []) as unknown as Household[];
  }

  async listHouseholdMembers(householdId: UUID): Promise<HouseholdMember[]> {
    const { data, error } = await this.db.from('household_members').select('*').eq('household_id', householdId);
    if (error) throw dbError(error);
    return (data ?? []) as HouseholdMember[];
  }

  async createHousehold(userId: UUID, name: string): Promise<Household> {
    const profile = await this.getProfile(userId);
    const { data, error } = await this.db
      .from('households')
      .insert({ name, owner_id: userId, base_currency: profile.base_currency })
      .select()
      .single();
    if (error) throw dbError(error);
    await this.db.from('household_members').insert({
      household_id: data.id,
      user_id: userId,
      role: 'owner',
      display_name: profile.display_name,
      color: MEMBER_COLORS[0],
      share: 0.5,
    });
    return data as Household;
  }

  async updateHousehold(id: UUID, patch: Partial<Household>): Promise<Household> {
    const { data, error } = await this.db.from('households').update(patch).eq('id', id).select().single();
    if (error) throw dbError(error);
    return data as Household;
  }

  async addHouseholdMember(
    householdId: UUID,
    input: { display_name: string; invite_email?: string | null; share?: number; color?: string },
  ): Promise<HouseholdMember> {
    const { count } = await this.db
      .from('household_members')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', householdId);

    const { data, error } = await this.db
      .from('household_members')
      .insert({
        household_id: householdId,
        // Queda sin cuenta asociada hasta que la persona se registre con ese email.
        user_id: null,
        role: 'member',
        display_name: input.display_name,
        invite_email: input.invite_email ?? null,
        color: input.color ?? MEMBER_COLORS[(count ?? 0) % MEMBER_COLORS.length],
        share: input.share ?? 0.5,
      })
      .select()
      .single();
    if (error) throw dbError(error);
    return data as HouseholdMember;
  }

  async updateHouseholdMember(id: UUID, patch: Partial<HouseholdMember>): Promise<HouseholdMember> {
    const { data, error } = await this.db.from('household_members').update(patch).eq('id', id).select().single();
    if (error) throw dbError(error);
    return data as HouseholdMember;
  }

  async removeHouseholdMember(id: UUID): Promise<void> {
    const { error } = await this.db.from('household_members').delete().eq('id', id);
    if (error) throw dbError(error);
  }

  async getHouseholdBalance(householdId: UUID, range: DateRangeInput): Promise<HouseholdBalance[]> {
    const { data, error } = await this.db.rpc('household_balance', {
      p_household: householdId,
      p_from: range.from,
      p_to: range.to,
    });
    if (error) throw dbError(error);
    return ((data ?? []) as any[]).map((row) => ({
      member_id: row.member_id,
      display_name: row.display_name,
      color: row.color ?? MEMBER_COLORS[0],
      share: Number(row.share),
      paid: round(Number(row.paid), 2),
      owed: round(Number(row.owed), 2),
      balance: round(Number(row.balance), 2),
    }));
  }

  // ---------------------------------------------------------- categories

  async listCategories(userId: UUID): Promise<CategoryTree[]> {
    const [categories, subcategories] = await Promise.all([
      this.db.from('categories').select('*').eq('user_id', userId).order('position'),
      this.db.from('subcategories').select('*').eq('user_id', userId).order('position'),
    ]);
    if (categories.error) throw dbError(categories.error);
    if (subcategories.error) throw dbError(subcategories.error);

    return ((categories.data ?? []) as Category[]).map((category) => ({
      ...category,
      subcategories: ((subcategories.data ?? []) as Subcategory[]).filter((s) => s.category_id === category.id),
    }));
  }

  async createCategory(userId: UUID, input: Partial<Category> & { name: string }): Promise<Category> {
    const { count } = await this.db.from('categories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const { data, error } = await this.db
      .from('categories')
      .insert({
        user_id: userId,
        name: input.name,
        slug: input.slug ?? normalizeText(input.name).replace(/\s+/g, '-'),
        kind: input.kind ?? 'expense',
        icon: input.icon ?? 'Tag',
        color: input.color ?? '#0f766e',
        position: count ?? 0,
      })
      .select()
      .single();
    if (error) throw dbError(error);
    return data as Category;
  }

  async updateCategory(id: UUID, patch: Partial<Category>): Promise<Category> {
    const { data, error } = await this.db.from('categories').update(patch).eq('id', id).select().single();
    if (error) throw dbError(error);
    return data as Category;
  }

  async reorderCategories(ids: UUID[]): Promise<void> {
    const { error } = await this.db.rpc('reorder_categories', { p_ids: ids });
    if (error) throw dbError(error);
  }

  async createSubcategory(userId: UUID, categoryId: UUID, name: string): Promise<Subcategory> {
    const { count } = await this.db
      .from('subcategories')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId);
    const { data, error } = await this.db
      .from('subcategories')
      .insert({
        user_id: userId,
        category_id: categoryId,
        name,
        slug: normalizeText(name).replace(/\s+/g, '-'),
        position: count ?? 0,
        keywords: [normalizeText(name)],
      })
      .select()
      .single();
    if (error) throw dbError(error);
    return data as Subcategory;
  }

  async updateSubcategory(id: UUID, patch: Partial<Subcategory>): Promise<Subcategory> {
    const { data, error } = await this.db.from('subcategories').update(patch).eq('id', id).select().single();
    if (error) throw dbError(error);
    return data as Subcategory;
  }

  // -------------------------------------------------------- transactions

  async listTransactions(userId: UUID, filters: TransactionFilters): Promise<Paginated<Transaction>> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    let query = this.db.from('transactions').select('*', { count: 'exact' }).eq('user_id', userId);
    query = applyFilters(query, filters);

    const sort = filters.sort ?? 'date_desc';
    const [column, direction] = sort.startsWith('amount') ? ['base_amount', sort.endsWith('asc')] : ['transaction_date', sort.endsWith('asc')];
    query = query.order(column as string, { ascending: Boolean(direction) }).order('created_at', { ascending: false });

    const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw dbError(error);
    return { rows: (data ?? []) as Transaction[], total: count ?? 0, page, pageSize };
  }

  async getTransaction(id: UUID): Promise<Transaction | null> {
    const { data, error } = await this.db.from('transactions').select('*').eq('id', id).maybeSingle();
    if (error) throw dbError(error);
    return (data as Transaction) ?? null;
  }

  async createTransaction(userId: UUID, input: TransactionInput): Promise<Transaction> {
    const [row] = await this.createTransactions(userId, [input]);
    return row;
  }

  async createTransactions(userId: UUID, inputs: TransactionInput[]): Promise<Transaction[]> {
    const profile = await this.getProfile(userId);
    const rates = await this.getRateTable(userId);

    // Una compra en cuotas se abre en un gasto por mes antes de armar la carga.
    // `source` recuerda de qué entrada salió cada fila, porque los ítems de un
    // ticket se cuelgan de una sola.
    const expanded = inputs.flatMap((input, source) =>
      input.installments
        ? expandInstallments(input.installments, input.transaction_date).map((plan) => ({ input, source, plan }))
        : [{ input, source, plan: null as ReturnType<typeof expandInstallments>[number] | null }],
    );

    const payload = expanded.map(({ input, plan }) => {
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw err('transaction/invalid-amount', 'El importe tiene que ser un número mayor a cero.');
      }
      const conversion = convert(input.amount, input.currency, profile.base_currency, rates);
      const rate = input.exchange_rate ?? conversion.rate;
      return {
        user_id: userId,
        household_id: input.household_id ?? null,
        type: input.type,
        amount: round(input.amount, 2),
        currency: input.currency,
        base_amount: round(input.amount * rate, 2),
        base_currency: profile.base_currency,
        exchange_rate: rate,
        description: input.description.trim(),
        merchant_name: input.merchant_name ?? null,
        category_id: input.category_id ?? null,
        subcategory_id: input.subcategory_id ?? null,
        payment_method_id: input.payment_method_id ?? null,
        account_id: input.account_id ?? null,
        transaction_date: plan?.transaction_date ?? input.transaction_date,
        notes: input.notes ?? null,
        source: input.source ?? 'manual',
        ai_confidence: input.ai_confidence ?? null,
        receipt_id: input.receipt_id ?? null,
        // `paid_by` es un integrante del hogar, no una cuenta: dejarlo en el
        // id del usuario apunta a una fila que no existe.
        paid_by: input.paid_by ?? null,
        exchange_kind: input.exchange_kind ?? null,
        installment_id: plan?.installment_id ?? null,
        installment_number: plan?.installment_number ?? null,
        installment_count: plan?.installment_count ?? null,
        created_by: userId,
      };
    });

    const { data, error } = await this.db.from('transactions').insert(payload).select();
    if (error) throw dbError(error);
    const rows = (data ?? []) as Transaction[];

    // Los ítems se cuelgan de la primera fila de cada entrada: una compra en
    // cuotas no repite el detalle del ticket seis veces.
    const items = expanded.flatMap(({ input, source }, index) =>
      (expanded.findIndex((entry) => entry.source === source) !== index ? [] : input.items ?? []).map((item) => ({
        transaction_id: rows[index]?.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
        category_id: item.category_id ?? null,
        subcategory_id: item.subcategory_id ?? null,
      })),
    );
    if (items.length) {
      const { error: itemsError } = await this.db.from('transaction_items').insert(items);
      if (itemsError) throw dbError(itemsError);
    }

    return rows;
  }

  async updateTransaction(id: UUID, patch: Partial<Transaction>): Promise<Transaction> {
    const payload: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
    delete payload.id;
    delete payload.user_id;
    delete payload.created_at;

    if (patch.amount !== undefined || patch.currency !== undefined || patch.exchange_rate !== undefined) {
      const current = await this.getTransaction(id);
      if (current) {
        const rates = await this.getRateTable(current.user_id);
        const amount = patch.amount ?? current.amount;
        const currency = patch.currency ?? current.currency;
        const conversion = convert(amount, currency, current.base_currency, rates);
        const rate = patch.exchange_rate ?? conversion.rate;
        payload.exchange_rate = rate;
        payload.base_amount = round(amount * rate, 2);
      }
    }

    const { data, error } = await this.db.from('transactions').update(payload).eq('id', id).select().single();
    if (error) throw dbError(error);
    return data as Transaction;
  }

  async deleteTransaction(id: UUID): Promise<void> {
    const { error } = await this.db.from('transactions').delete().eq('id', id);
    if (error) throw dbError(error);
  }

  async listTransactionItems(transactionId: UUID): Promise<TransactionItem[]> {
    const { data, error } = await this.db.from('transaction_items').select('*').eq('transaction_id', transactionId);
    if (error) throw dbError(error);
    return (data ?? []) as TransactionItem[];
  }

  async searchTransactions(userId: UUID, query: string, limit = 20): Promise<Transaction[]> {
    const needle = query.trim();
    if (!needle) return [];
    const { data, error } = await this.db
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .or(`description.ilike.%${needle}%,merchant_name.ilike.%${needle}%`)
      .order('transaction_date', { ascending: false })
      .limit(limit);
    if (error) throw dbError(error);
    return (data ?? []) as Transaction[];
  }

  // ------------------------------------------------------ reference data

  async listPaymentMethods(userId: UUID): Promise<PaymentMethod[]> {
    const { data, error } = await this.db
      .from('payment_methods')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at');
    if (error) throw dbError(error);
    return (data ?? []) as PaymentMethod[];
  }

  async createPaymentMethod(userId: UUID, input: Partial<PaymentMethod> & { name: string }): Promise<PaymentMethod> {
    const { data, error } = await this.db
      .from('payment_methods')
      .insert({
        user_id: userId,
        name: input.name,
        kind: input.kind ?? 'other',
        issuer: input.issuer ?? null,
        last4: input.last4 ? input.last4.replace(/\D/g, '').slice(-4) : null,
        is_default: input.is_default ?? false,
      })
      .select()
      .single();
    if (error) throw dbError(error);
    return data as PaymentMethod;
  }

  async updatePaymentMethod(id: UUID, patch: Partial<PaymentMethod>): Promise<PaymentMethod> {
    const { data, error } = await this.db.from('payment_methods').update(patch).eq('id', id).select().single();
    if (error) throw dbError(error);
    return data as PaymentMethod;
  }

  async listAccounts(userId: UUID): Promise<Account[]> {
    const { data, error } = await this.db
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('sort_order')
      .order('created_at');
    if (error) throw dbError(error);
    return (data ?? []) as Account[];
  }

  async createAccount(userId: UUID, input: AccountInput): Promise<Account> {
    const { count } = await this.db
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { data, error } = await this.db
      .from('accounts')
      .insert({
        user_id: userId,
        name: input.name.trim(),
        currency: input.currency,
        kind: input.kind,
        balance: round(input.balance, 2),
        institution: input.institution?.trim() || null,
        notes: input.notes?.trim() || null,
        sort_order: count ?? 0,
        include_in_net_worth: input.include_in_net_worth ?? true,
      })
      .select()
      .single();
    if (error) throw dbError(error);
    return data as Account;
  }

  async updateAccount(id: UUID, patch: Partial<AccountInput> & { is_active?: boolean }): Promise<Account> {
    // La fecha del saldo y el historial los pone un disparador en la base: así
    // vale igual si el número se corrige desde acá o desde el panel de Supabase.
    const { data, error } = await this.db
      .from('accounts')
      .update({
        ...patch,
        ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
        ...(patch.balance === undefined ? {} : { balance: round(patch.balance, 2) }),
        ...(patch.institution === undefined ? {} : { institution: patch.institution?.trim() || null }),
        ...(patch.notes === undefined ? {} : { notes: patch.notes?.trim() || null }),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw dbError(error);
    return data as Account;
  }

  async archiveAccount(id: UUID): Promise<void> {
    const { error } = await this.db.from('accounts').update({ is_active: false }).eq('id', id);
    if (error) throw dbError(error);
  }

  async listAccountBalances(accountId: UUID): Promise<AccountBalancePoint[]> {
    const { data, error } = await this.db
      .from('account_balances')
      .select('id, account_id, balance, recorded_on')
      .eq('account_id', accountId)
      .order('recorded_on', { ascending: false })
      .limit(180);
    if (error) throw dbError(error);
    return (data ?? []) as AccountBalancePoint[];
  }

  async listAccountDeltas(): Promise<AccountDelta[]> {
    // La suma se hace en la base: viaja una fila por cuenta, no el historial.
    const { data, error } = await this.db.rpc('account_movement_deltas');
    if (error) throw dbError(error);
    return ((data ?? []) as AccountDelta[]).map((row) => ({
      account_id: row.account_id,
      delta: Number(row.delta),
      movements: Number(row.movements),
    }));
  }

  async getNetWorth(): Promise<number> {
    // La conversión se hace en la base para que el número no dependa de qué
    // cotizaciones tenga cargadas el navegador en ese momento.
    const { data, error } = await this.db.rpc('net_worth');
    if (error) throw dbError(error);
    return round(Number(data ?? 0), 2);
  }

  async listMerchants(userId: UUID): Promise<Merchant[]> {
    const { data, error } = await this.db.from('merchants').select('*').eq('user_id', userId).order('name');
    if (error) throw dbError(error);
    return (data ?? []) as Merchant[];
  }

  // ------------------------------------------------------------ receipts

  async listReceipts(userId: UUID): Promise<Receipt[]> {
    const { data, error } = await this.db
      .from('receipts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw dbError(error);
    return (data ?? []) as Receipt[];
  }

  async getReceipt(id: UUID): Promise<Receipt | null> {
    const { data, error } = await this.db.from('receipts').select('*').eq('id', id).maybeSingle();
    if (error) throw dbError(error);
    return (data as Receipt) ?? null;
  }

  async saveReceipt(
    userId: UUID,
    receipt: Omit<Receipt, 'id' | 'user_id' | 'created_at'>,
    items: Omit<ReceiptItem, 'id' | 'receipt_id' | 'created_at'>[],
  ): Promise<Receipt> {
    const { data, error } = await this.db
      .from('receipts')
      .insert({ ...receipt, user_id: userId })
      .select()
      .single();
    if (error) throw dbError(error);

    if (items.length) {
      const { error: itemsError } = await this.db
        .from('receipt_items')
        .insert(items.map((item) => ({ ...item, receipt_id: data.id })));
      if (itemsError) throw dbError(itemsError);
    }
    return data as Receipt;
  }

  async linkReceiptToTransaction(receiptId: UUID, transactionId: UUID): Promise<void> {
    const [a, b] = await Promise.all([
      this.db.from('receipts').update({ transaction_id: transactionId }).eq('id', receiptId),
      this.db.from('transactions').update({ receipt_id: receiptId }).eq('id', transactionId),
    ]);
    if (a.error) throw dbError(a.error);
    if (b.error) throw dbError(b.error);
  }

  async uploadReceiptImage(userId: UUID, file: Blob, filename: string): Promise<string> {
    // The first path segment is the owner id; storage policies check it.
    const path = `${userId}/${Date.now()}-${filename.replace(/[^\w.-]/g, '_')}`;
    const { error } = await this.db.storage.from(RECEIPT_BUCKET).upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
    if (error) throw err('receipt/upload-failed', 'No pude subir la imagen del ticket. Probá de nuevo.');
    return path;
  }

  async getReceiptImageUrl(path: string): Promise<string | null> {
    const { data, error } = await this.db.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 60 * 30);
    if (error) return null;
    return data?.signedUrl ?? null;
  }

  async deleteReceipt(id: UUID): Promise<void> {
    const receipt = await this.getReceipt(id);
    if (receipt?.storage_path) {
      await this.db.storage.from(RECEIPT_BUCKET).remove([receipt.storage_path]);
    }
    const { error } = await this.db.from('receipts').delete().eq('id', id);
    if (error) throw dbError(error);
  }

  // ----------------------------------------------------- budgets & goals

  async listBudgets(userId: UUID): Promise<Budget[]> {
    const { data, error } = await this.db.from('budgets').select('*').eq('user_id', userId).eq('is_active', true);
    if (error) throw dbError(error);
    return (data ?? []) as Budget[];
  }

  async createBudget(userId: UUID, input: Omit<Budget, 'id' | 'user_id' | 'created_at'>): Promise<Budget> {
    const { data, error } = await this.db.from('budgets').insert({ ...input, user_id: userId }).select().single();
    if (error) throw dbError(error);
    return data as Budget;
  }

  async updateBudget(id: UUID, patch: Partial<Budget>): Promise<Budget> {
    const { data, error } = await this.db.from('budgets').update(patch).eq('id', id).select().single();
    if (error) throw dbError(error);
    return data as Budget;
  }

  async deleteBudget(id: UUID): Promise<void> {
    const { error } = await this.db.from('budgets').delete().eq('id', id);
    if (error) throw dbError(error);
  }

  async getBudgetProgress(userId: UUID, reference = today()): Promise<BudgetProgress[]> {
    const [budgets, categories, spentRows] = await Promise.all([
      this.listBudgets(userId),
      this.listCategories(userId),
      this.db.rpc('budget_spent', { p_reference: reference }),
    ]);
    if (spentRows.error) throw dbError(spentRows.error);
    const spentByBudget = new Map<string, number>(
      ((spentRows.data ?? []) as { budget_id: string; spent: number }[]).map((row) => [row.budget_id, Number(row.spent)]),
    );

    const referenceDate = new Date(`${reference}T12:00:00`);
    return budgets
      .map((budget) => {
        const spent = round(spentByBudget.get(budget.id) ?? 0, 2);
        const ratio = budget.amount > 0 ? spent / budget.amount : 0;
        return {
          budget,
          spent,
          remaining: round(budget.amount - spent, 2),
          ratio: round(ratio, 4),
          status: budgetStatus(ratio, budget.alert_thresholds),
          period_start:
            budget.period === 'monthly' ? toISO(startOfMonth(referenceDate)) : toISO(startOfWeek(referenceDate, { weekStartsOn: 1 })),
          period_end:
            budget.period === 'monthly' ? toISO(endOfMonth(referenceDate)) : toISO(endOfWeek(referenceDate, { weekStartsOn: 1 })),
          category_name: categories.find((c) => c.id === budget.category_id)?.name,
        } satisfies BudgetProgress;
      })
      .sort((a, b) => b.ratio - a.ratio);
  }

  async listGoals(userId: UUID): Promise<Goal[]> {
    const { data, error } = await this.db
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('created_at');
    if (error) throw dbError(error);
    return (data ?? []) as Goal[];
  }

  async createGoal(userId: UUID, input: Omit<Goal, 'id' | 'user_id' | 'created_at'>): Promise<Goal> {
    const { data, error } = await this.db.from('goals').insert({ ...input, user_id: userId }).select().single();
    if (error) throw dbError(error);
    return data as Goal;
  }

  async updateGoal(id: UUID, patch: Partial<Goal>): Promise<Goal> {
    const { data, error } = await this.db.from('goals').update(patch).eq('id', id).select().single();
    if (error) throw dbError(error);
    return data as Goal;
  }

  async deleteGoal(id: UUID): Promise<void> {
    const { error } = await this.db.from('goals').delete().eq('id', id);
    if (error) throw dbError(error);
  }

  async addGoalContribution(userId: UUID, goalId: UUID, amount: number, note?: string): Promise<GoalContribution> {
    const { data, error } = await this.db
      .from('goal_contributions')
      .insert({ goal_id: goalId, user_id: userId, amount: round(amount, 2), note: note ?? null, contributed_on: today() })
      .select()
      .single();
    if (error) throw dbError(error);
    return data as GoalContribution;
  }

  async listGoalContributions(goalId: UUID): Promise<GoalContribution[]> {
    const { data, error } = await this.db
      .from('goal_contributions')
      .select('*')
      .eq('goal_id', goalId)
      .order('contributed_on', { ascending: false });
    if (error) throw dbError(error);
    return (data ?? []) as GoalContribution[];
  }

  async getGoalProjections(userId: UUID): Promise<GoalProjection[]> {
    const goals = await this.listGoals(userId);
    return goals.map(projectGoal);
  }

  // ------------------------------------------------------------ learning

  async listRules(userId: UUID): Promise<CategorizationRule[]> {
    const { data, error } = await this.db.from('categorization_rules').select('*').eq('user_id', userId);
    if (error) throw dbError(error);
    return (data ?? []) as CategorizationRule[];
  }

  async upsertRule(
    userId: UUID,
    rule: Omit<CategorizationRule, 'id' | 'user_id' | 'created_at' | 'hits'>,
  ): Promise<CategorizationRule> {
    const { data, error } = await this.db
      .from('categorization_rules')
      .upsert({ ...rule, user_id: userId }, { onConflict: 'user_id,pattern' })
      .select()
      .single();
    if (error) throw dbError(error);
    return data as CategorizationRule;
  }

  async deleteRule(id: UUID): Promise<void> {
    const { error } = await this.db.from('categorization_rules').delete().eq('id', id);
    if (error) throw dbError(error);
  }

  async logAiInteraction(userId: UUID, interaction: Omit<AiInteraction, 'id' | 'user_id' | 'created_at'>): Promise<void> {
    // Fire and forget: tracing must never block the user's action.
    await this.db.from('ai_interactions').insert({ ...interaction, user_id: userId });
  }

  async listAiInteractions(userId: UUID, limit = 50): Promise<AiInteraction[]> {
    const { data, error } = await this.db
      .from('ai_interactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw dbError(error);
    return (data ?? []) as AiInteraction[];
  }

  // ---------------------------------------------------------- currencies

  async listExchangeRates(userId: UUID): Promise<ExchangeRate[]> {
    const { data, error } = await this.db
      .from('exchange_rates')
      .select('*')
      .eq('user_id', userId)
      .order('rate_date', { ascending: false });
    if (error) throw dbError(error);
    return (data ?? []) as ExchangeRate[];
  }

  async upsertExchangeRate(userId: UUID, quote: CurrencyCode, rate: number): Promise<ExchangeRate> {
    const profile = await this.getProfile(userId);
    const { data, error } = await this.db
      .from('exchange_rates')
      .upsert(
        {
          user_id: userId,
          base_currency: profile.base_currency,
          quote_currency: quote,
          rate,
          rate_date: today(),
          source: 'manual',
        },
        { onConflict: 'user_id,base_currency,quote_currency,rate_date' },
      )
      .select()
      .single();
    if (error) throw dbError(error);
    return data as ExchangeRate;
  }

  async getRateTable(userId: UUID): Promise<Record<string, number>> {
    const [rates, profile] = await Promise.all([this.listExchangeRates(userId), this.getProfile(userId)]);
    const table: Record<string, number> = { [profile.base_currency]: 1 };
    for (const rate of rates) {
      if (!(rate.quote_currency in table)) table[rate.quote_currency] = rate.rate;
    }
    return table;
  }

  // ------------------------------------------------------------- reports

  async getDashboard(userId: UUID, range: DateRangeInput): Promise<DashboardSummary> {
    const profile = await this.getProfile(userId);
    const previous = previousRange({ ...range, label: '' });

    const [current, before, categories, daily, balance, holdings, installments] = await Promise.all([
      this.summaryRpc(range.from, range.to, profile.base_currency),
      this.summaryRpc(previous.from, previous.to, profile.base_currency),
      this.categoryRpc(range.from, range.to, previous),
      this.dailyRpc(range.from, range.to),
      this.db.rpc('account_balance'),
      // Las tenencias se suman en la base: viaja una fila por moneda, no el historial.
      this.db.rpc('currency_holdings'),
      // Y las cuotas, una fila por compra en vez de todos los vencimientos.
      this.db.rpc('pending_installments'),
    ]);

    return {
      period: current,
      previous: before,
      comparison: {
        income: metric(current.income, before.income, true),
        expense: metric(current.expense, before.expense, false),
        savings: metric(current.savings, before.savings, true),
      },
      balance: round(Number(balance.data ?? 0), 2),
      top_categories: categories.slice(0, 6),
      recent_days: daily,
      holdings: ((holdings.data ?? []) as CurrencyHolding[]).map((row) => ({
        currency: row.currency,
        amount: Number(row.amount),
        invested: Number(row.invested),
        avg_rate: row.avg_rate === null ? null : Number(row.avg_rate),
      })),
      pending_installments: ((installments.data ?? []) as PendingInstallment[]).map((row) => ({
        ...row,
        installment_count: Number(row.installment_count),
        paid_count: Number(row.paid_count),
        pending_count: Number(row.pending_count),
        pending_amount: Number(row.pending_amount),
      })),
    };
  }

  async getReportBundle(userId: UUID, filters: TransactionFilters): Promise<ReportBundle> {
    const profile = await this.getProfile(userId);
    const from = filters.from ?? monthRange().from;
    const to = filters.to ?? monthRange().to;
    const previous = previousRange({ from, to, label: '' });
    const monthsRange = lastNMonths(6);

    const [summary, before, byCategory, bySubcategory, monthly, daily, merchants, methods, ants] = await Promise.all([
      this.summaryRpc(from, to, profile.base_currency),
      this.summaryRpc(previous.from, previous.to, profile.base_currency),
      this.categoryRpc(from, to, previous),
      this.subcategoryRpc(from, to),
      this.monthlyRpc(monthsRange.from, to),
      this.dailyRpc(from, to),
      this.merchantsRpc(from, to),
      this.paymentMethodsRpc(from, to),
      this.antsRpc(from, to),
    ]);

    return {
      filters,
      summary,
      previous: before,
      byCategory,
      bySubcategory,
      monthly,
      daily,
      merchants,
      paymentMethods: methods,
      ants,
    };
  }

  async getMonthlySeries(userId: UUID, months: number): Promise<MonthlyPoint[]> {
    void userId;
    const range = lastNMonths(months);
    return this.monthlyRpc(range.from, range.to);
  }

  async getCalendar(userId: UUID, range: DateRangeInput): Promise<DailyPoint[]> {
    void userId;
    return this.dailyRpc(range.from, range.to);
  }

  async listRecurring(userId: UUID): Promise<RecurringExpense[]> {
    const { data, error } = await this.db.rpc('detect_recurring');
    if (error) throw dbError(error);
    const rows = (data ?? []) as {
      merchant_key: string;
      label: string;
      average_amount: number;
      occurrences: number;
      avg_gap_days: number;
      last_date: string;
      category_id: string | null;
      confirmed: boolean | null;
    }[];

    return rows
      .filter((row) => row.confirmed !== false)
      .map((row) => ({
        id: row.merchant_key,
        user_id: userId,
        merchant_key: row.merchant_key,
        label: row.label,
        average_amount: round(Number(row.average_amount), 2),
        currency: 'ARS',
        cadence: cadenceFromGap(Number(row.avg_gap_days)),
        occurrences: row.occurrences,
        last_date: row.last_date,
        next_estimated_date: null,
        category_id: row.category_id,
        confirmed: row.confirmed,
        created_at: new Date().toISOString(),
      }));
  }

  async setRecurringConfirmed(userId: UUID, merchantKey: string, confirmed: boolean): Promise<void> {
    const { error } = await this.db
      .from('recurring_expenses')
      .upsert({ user_id: userId, merchant_key: merchantKey, confirmed, label: merchantKey }, { onConflict: 'user_id,merchant_key' });
    if (error) throw dbError(error);
  }

  // ------------------------------------------------------------- planes

  async getSubscription(userId: UUID): Promise<Subscription | null> {
    const { data, error } = await this.db
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw dbError(error);
    return (data as Subscription) ?? null;
  }

  async getPlanUsage(userId: UUID): Promise<PlanUsage> {
    void userId;
    const { data, error } = await this.db.rpc('plan_usage');
    if (error) throw dbError(error);
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, number> | undefined;
    return {
      transactions: Number(row?.transactions ?? 0),
      receipts: Number(row?.receipts ?? 0),
      ai_queries: Number(row?.ai_queries ?? 0),
      budgets: Number(row?.budgets ?? 0),
      goals: Number(row?.goals ?? 0),
      household_members: Number(row?.household_members ?? 0),
    };
  }

  // ------------------------------------------------------- notifications

  async listNotifications(userId: UUID): Promise<AppNotification[]> {
    const { data, error } = await this.db
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw dbError(error);
    return (data ?? []) as AppNotification[];
  }

  async markNotificationRead(id: UUID): Promise<void> {
    await this.db.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  }

  // ----------------------------------------------------------- RPC calls

  private async summaryRpc(from: string, to: string, currency: string): Promise<PeriodSummary> {
    const { data, error } = await this.db.rpc('report_summary', { p_from: from, p_to: to });
    if (error) throw dbError(error);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { income: number; expense: number; transaction_count: number }
      | undefined;
    const income = round(Number(row?.income ?? 0), 2);
    const expense = round(Number(row?.expense ?? 0), 2);
    const savings = round(income - expense, 2);
    return {
      from,
      to,
      income,
      expense,
      savings,
      savings_rate: income > 0 ? round((savings / income) * 100, 1) : 0,
      transaction_count: Number(row?.transaction_count ?? 0),
      currency,
    };
  }

  private async categoryRpc(from: string, to: string, previous: { from: string; to: string }): Promise<CategoryBreakdown[]> {
    const [current, before] = await Promise.all([
      this.db.rpc('report_by_category', { p_from: from, p_to: to }),
      this.db.rpc('report_by_category', { p_from: previous.from, p_to: previous.to }),
    ]);
    if (current.error) throw dbError(current.error);

    const previousMap = new Map<string, number>(
      ((before.data ?? []) as any[]).map((row) => [row.category_id ?? 'sin', Number(row.amount)]),
    );
    const rows = (current.data ?? []) as any[];
    const total = rows.reduce((acc, row) => acc + Number(row.amount), 0);

    return rows.map((row) => {
      const previousAmount = previousMap.get(row.category_id ?? 'sin');
      const amount = round(Number(row.amount), 2);
      return {
        category_id: row.category_id,
        category_name: row.category_name ?? 'Sin categoría',
        color: row.color ?? '#94a3b8',
        icon: row.icon ?? undefined,
        amount,
        ratio: total > 0 ? round((amount / total) * 100, 1) : 0,
        transaction_count: Number(row.transaction_count),
        previous_amount: previousAmount === undefined ? undefined : round(previousAmount, 2),
        delta_ratio:
          previousAmount === undefined || previousAmount === 0
            ? null
            : round(((amount - previousAmount) / previousAmount) * 100, 1),
      } satisfies CategoryBreakdown;
    });
  }

  private async subcategoryRpc(from: string, to: string): Promise<SubcategoryBreakdown[]> {
    const { data, error } = await this.db.rpc('report_by_subcategory', { p_from: from, p_to: to });
    if (error) throw dbError(error);
    const rows = (data ?? []) as any[];
    const total = rows.reduce((acc, row) => acc + Number(row.amount), 0);
    return rows.map((row) => ({
      category_id: row.category_id,
      category_name: row.category_name ?? 'Sin categoría',
      subcategory_id: row.subcategory_id,
      subcategory_name: row.subcategory_name ?? 'Sin subcategoría',
      color: row.color ?? '#94a3b8',
      amount: round(Number(row.amount), 2),
      ratio: total > 0 ? round((Number(row.amount) / total) * 100, 1) : 0,
      transaction_count: Number(row.transaction_count),
    }));
  }

  private async monthlyRpc(from: string, to: string): Promise<MonthlyPoint[]> {
    const { data, error } = await this.db.rpc('report_monthly', { p_from: from, p_to: to });
    if (error) throw dbError(error);
    return ((data ?? []) as any[]).map((row) => {
      const income = round(Number(row.income), 2);
      const expense = round(Number(row.expense), 2);
      return { month: row.month, label: formatMonthLabel(row.month), income, expense, savings: round(income - expense, 2) };
    });
  }

  private async dailyRpc(from: string, to: string): Promise<DailyPoint[]> {
    const { data, error } = await this.db.rpc('report_daily', { p_from: from, p_to: to });
    if (error) throw dbError(error);
    return ((data ?? []) as any[]).map((row) => ({
      date: row.day,
      income: round(Number(row.income), 2),
      expense: round(Number(row.expense), 2),
      count: Number(row.transaction_count),
    }));
  }

  private async merchantsRpc(from: string, to: string) {
    const { data, error } = await this.db.rpc('report_merchants', { p_from: from, p_to: to, p_limit: 10 });
    if (error) throw dbError(error);
    return ((data ?? []) as any[]).map((row) => ({
      merchant: row.merchant,
      amount: round(Number(row.amount), 2),
      count: Number(row.transaction_count),
      last_date: row.last_date,
    }));
  }

  private async paymentMethodsRpc(from: string, to: string) {
    const { data, error } = await this.db.rpc('report_payment_methods', { p_from: from, p_to: to });
    if (error) throw dbError(error);
    return ((data ?? []) as any[]).map((row) => ({
      name: row.name ?? 'Sin especificar',
      amount: round(Number(row.amount), 2),
      count: Number(row.transaction_count),
    }));
  }

  private async antsRpc(from: string, to: string) {
    const { data, error } = await this.db.rpc('report_ants', { p_from: from, p_to: to });
    if (error) throw dbError(error);
    const rows = (data ?? []) as any[];
    const threshold = round(Number(rows[0]?.threshold ?? 0), 0);
    const groups = rows
      .filter((row) => row.label)
      .map((row) => ({
        label: row.label,
        count: Number(row.transaction_count),
        total: round(Number(row.total), 2),
        average: round(Number(row.total) / Math.max(1, Number(row.transaction_count)), 2),
      }));
    const total = round(
      rows.reduce((acc, row) => acc + Number(row.total ?? 0), 0),
      2,
    );
    const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1);
    return {
      threshold,
      count: groups.reduce((acc, g) => acc + g.count, 0),
      total,
      monthly_estimate: round((total / days) * 30, 2),
      groups: groups.slice(0, 8),
    };
  }
}

function applyFilters(query: any, filters: TransactionFilters) {
  if (filters.from) query = query.gte('transaction_date', filters.from);
  if (filters.to) query = query.lte('transaction_date', filters.to);
  if (filters.types?.length) query = query.in('type', filters.types);
  if (filters.categoryIds?.length) query = query.in('category_id', filters.categoryIds);
  if (filters.subcategoryIds?.length) query = query.in('subcategory_id', filters.subcategoryIds);
  if (filters.paymentMethodIds?.length) query = query.in('payment_method_id', filters.paymentMethodIds);
  if (filters.currency) query = query.eq('currency', filters.currency);
  if (filters.minAmount !== undefined) query = query.gte('base_amount', filters.minAmount);
  if (filters.maxAmount !== undefined) query = query.lte('base_amount', filters.maxAmount);
  if (filters.merchant) query = query.ilike('merchant_name', `%${filters.merchant}%`);
  if (filters.hasReceipt) query = query.not('receipt_id', 'is', null);
  if (filters.search) {
    query = query.or(`description.ilike.%${filters.search}%,merchant_name.ilike.%${filters.search}%`);
  }
  return query;
}

function metric(current: number, previous: number, higherIsBetter: boolean) {
  const delta = round(current - previous, 2);
  return {
    current,
    previous,
    delta,
    delta_ratio: previous === 0 ? null : round((delta / Math.abs(previous)) * 100, 1),
    higher_is_better: higherIsBetter,
  };
}

function cadenceFromGap(gap: number): RecurringExpense['cadence'] {
  if (gap <= 9) return 'weekly';
  if (gap <= 40) return 'monthly';
  if (gap <= 80) return 'bimonthly';
  return 'yearly';
}

function rowToProfile(row: any): Profile {
  return {
    id: row.id,
    user_id: row.user_id,
    display_name: row.display_name ?? 'Mi cuenta',
    avatar_url: row.avatar_url,
    base_currency: row.base_currency ?? 'ARS',
    locale: row.locale ?? 'es-AR',
    timezone: row.timezone ?? 'America/Argentina/Buenos_Aires',
    ai: {
      autosave_threshold: 0.9,
      ask_threshold: 0.7,
      learn_from_corrections: true,
      share_data_with_ai: true,
      ...(row.ai_preferences ?? {}),
    },
    default_payment_method_id: row.default_payment_method_id ?? null,
    require_payment_method: row.require_payment_method ?? false,
    onboarding_done: row.onboarding_done ?? false,
    favorite_category_ids: row.favorite_category_ids ?? [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function dbError(error: PostgrestError) {
  // El código y el detalle de Postgres quedan en la consola: son lo único que
  // permite diagnosticar un fallo que la traducción no supo nombrar.
  console.error('[crocante] db', error.code, error.message, error.details ?? '');
  return err('db/error', describeDbError(error), error.hint ?? undefined, error);
}

function translateAuthError(message?: string): string {
  const text = (message ?? '').toLowerCase();
  if (text.includes('invalid login')) return 'Email o contraseña incorrectos.';
  if (text.includes('already registered')) return 'Ya existe una cuenta con ese email.';
  if (text.includes('password')) return 'La contraseña necesita al menos 8 caracteres.';
  if (text.includes('email')) return 'Revisá el email ingresado.';
  return 'No pude completar la operación. Probá de nuevo en unos segundos.';
}
