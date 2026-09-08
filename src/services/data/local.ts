import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import { env } from '@/config/env';
import { lastNMonths, monthRange, previousRange, today, toISO, monthsUntil, addMonths } from '@/lib/date';
import { convert } from '@/lib/money';
import { normalizeText, round, uid } from '@/lib/utils';
import { err } from '@/types/common';
import type { Paginated, UUID } from '@/types/common';
import type { AiInteraction, CategorizationRule } from '@/types/ai';
import type { Budget, BudgetProgress, BudgetStatus } from '@/types/budget';
import type { Category, CategoryTree, Subcategory } from '@/types/category';
import type { CurrencyCode, ExchangeRate } from '@/types/currency';
import type { Goal, GoalContribution, GoalProjection } from '@/types/goal';
import type { AppNotification } from '@/types/notification';
import type { PlanCode, PlanUsage, Subscription } from '@/types/plan';
import type { Receipt, ReceiptItem } from '@/types/receipt';
import type { DailyPoint, DashboardSummary, MonthlyPoint, RecurringExpense, ReportBundle } from '@/types/report';
import type {
  Account,
  Merchant,
  PaymentMethod,
  Transaction,
  TransactionFilters,
  TransactionInput,
  TransactionItem,
} from '@/types/transaction';
import type { AuthUser, Household, HouseholdBalance, HouseholdMember, Profile, Settlement } from '@/types/user';
import {
  antExpenses,
  categoryBreakdown,
  compare,
  dailySeries,
  isSpending,
  merchantRanking,
  monthlySeries,
  paymentMethodBreakdown,
  subcategoryBreakdown,
  summarize,
} from '@/services/analytics/aggregate';
import { detectRecurring } from '@/services/analytics/recurring';
import { buildCategories, buildDemoDataset } from '@/services/seed/demo';
import type { DataClient, DateRangeInput } from './types';

interface Database {
  version: number;
  profile: Profile | null;
  households: Household[];
  household_members: HouseholdMember[];
  categories: Category[];
  subcategories: Subcategory[];
  transactions: Transaction[];
  transaction_items: TransactionItem[];
  payment_methods: PaymentMethod[];
  accounts: Account[];
  merchants: Merchant[];
  receipts: Receipt[];
  receipt_items: ReceiptItem[];
  budgets: Budget[];
  goals: Goal[];
  goal_contributions: GoalContribution[];
  exchange_rates: ExchangeRate[];
  ai_interactions: AiInteraction[];
  categorization_rules: CategorizationRule[];
  recurring_overrides: Record<string, boolean>;
  notifications: AppNotification[];
  receipt_blobs: Record<string, string>;
  subscription: Subscription | null;
}

interface StoredUser {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  salt: string;
  created_at: string;
}

const AUTH_KEY = 'crocante.auth.v1';
const SESSION_KEY = 'crocante.session.v1';
const dbKey = (userId: string) => `crocante.db.v1.${userId}`;

const emptyDb = (): Database => ({
  version: 1,
  profile: null,
  households: [],
  household_members: [],
  categories: [],
  subcategories: [],
  transactions: [],
  transaction_items: [],
  payment_methods: [],
  accounts: [],
  merchants: [],
  receipts: [],
  receipt_items: [],
  budgets: [],
  goals: [],
  goal_contributions: [],
  exchange_rates: [],
  ai_interactions: [],
  categorization_rules: [],
  recurring_overrides: {},
  notifications: [],
  receipt_blobs: {},
  subscription: null,
});

/**
 * Browser-backed implementation of `DataClient`.
 *
 * It exists so the product is fully usable — and demonstrable — before anyone
 * provisions Supabase. Same interface, same behaviour, data stays on the device.
 */
export class LocalDataClient implements DataClient {
  readonly mode = 'local' as const;
  private listeners = new Set<(user: AuthUser | null) => void>();
  private cache = new Map<string, Database>();

  // ---------------------------------------------------------------- auth

  async signUp(email: string, password: string, displayName: string): Promise<AuthUser> {
    const users = this.readUsers();
    const normalizedEmail = email.trim().toLowerCase();
    if (users.some((u) => u.email === normalizedEmail)) {
      throw err('auth/email-taken', 'Ya existe una cuenta con ese email. Probá iniciar sesión.');
    }
    if (password.length < 8) {
      throw err('auth/weak-password', 'La contraseña necesita al menos 8 caracteres.');
    }

    const salt = uid();
    const user: StoredUser = {
      id: uid(),
      email: normalizedEmail,
      display_name: displayName.trim() || normalizedEmail.split('@')[0],
      password_hash: await hash(password, salt),
      salt,
      created_at: new Date().toISOString(),
    };
    users.push(user);
    localStorage.setItem(AUTH_KEY, JSON.stringify(users));

    const db = emptyDb();
    db.profile = this.makeProfile(user);
    const { categories, subcategories } = buildCategories(user.id);
    db.categories = categories;
    db.subcategories = subcategories;
    db.payment_methods = defaultPaymentMethods(user.id);
    db.exchange_rates = defaultRates();
    this.writeDb(user.id, db);

    this.setSession(user.id);
    return toAuthUser(user);
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = this.readUsers().find((u) => u.email === normalizedEmail);
    if (!user || (await hash(password, user.salt)) !== user.password_hash) {
      throw err('auth/invalid-credentials', 'Email o contraseña incorrectos.');
    }
    this.setSession(user.id);
    return toAuthUser(user);
  }

  async signInWithGoogle(): Promise<void> {
    throw err(
      'auth/provider-unavailable',
      'El acceso con Google necesita Supabase configurado. Podés entrar con email y contraseña o probar la cuenta demo.',
    );
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(SESSION_KEY);
    this.emit(null);
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) return null;
    const user = this.readUsers().find((u) => u.id === userId);
    return user ? toAuthUser(user) : null;
  }

  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const exists = this.readUsers().some((u) => u.email === email.trim().toLowerCase());
    if (!exists) {
      // Same response either way: account existence is not something to leak.
      return;
    }
  }

  async updatePassword(newPassword: string): Promise<void> {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) throw err('auth/no-session', 'Iniciá sesión para cambiar la contraseña.');
    const users = this.readUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) throw err('auth/no-session', 'No encontré tu cuenta.');
    user.salt = uid();
    user.password_hash = await hash(newPassword, user.salt);
    localStorage.setItem(AUTH_KEY, JSON.stringify(users));
  }

  // ------------------------------------------------------------- profile

  async getProfile(userId: UUID): Promise<Profile> {
    const db = this.db(userId);
    if (!db.profile) {
      const user = this.readUsers().find((u) => u.id === userId);
      db.profile = this.makeProfile(
        user ?? { id: userId, email: 'demo@crocante.app', display_name: 'Demo', password_hash: '', salt: '', created_at: new Date().toISOString() },
      );
      this.writeDb(userId, db);
    }
    return db.profile;
  }

  async updateProfile(userId: UUID, patch: Partial<Profile>): Promise<Profile> {
    const db = this.db(userId);
    const current = await this.getProfile(userId);
    const updated: Profile = { ...current, ...patch, ai: { ...current.ai, ...(patch.ai ?? {}) }, updated_at: new Date().toISOString() };
    db.profile = updated;
    this.writeDb(userId, db);
    return updated;
  }

  async listHouseholds(userId: UUID): Promise<Household[]> {
    return this.db(userId).households;
  }

  async listHouseholdMembers(householdId: UUID): Promise<HouseholdMember[]> {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) return [];
    return this.db(userId).household_members.filter((m) => m.household_id === householdId);
  }

  async createHousehold(userId: UUID, name: string): Promise<Household> {
    const db = this.db(userId);
    const profile = await this.getProfile(userId);
    const household: Household = {
      id: uid(),
      name,
      owner_id: userId,
      base_currency: profile.base_currency,
      split_mode: 'equal',
      created_at: new Date().toISOString(),
    };
    db.households.push(household);
    db.household_members.push({
      id: uid(),
      household_id: household.id,
      user_id: userId,
      role: 'owner',
      display_name: profile.display_name,
      color: '#2f9e8f',
      share: 0.5,
      is_active: true,
      created_at: household.created_at,
    });
    this.writeDb(userId, db);
    return household;
  }

  async updateHousehold(id: UUID, patch: Partial<Household>): Promise<Household> {
    const userId = this.requireSession();
    const db = this.db(userId);
    const index = db.households.findIndex((h) => h.id === id);
    if (index === -1) throw err('household/not-found', 'No encontré ese hogar.');
    db.households[index] = { ...db.households[index], ...patch };
    this.writeDb(userId, db);
    return db.households[index];
  }

  async addHouseholdMember(
    householdId: UUID,
    input: { display_name: string; invite_email?: string | null; share?: number; color?: string },
  ): Promise<HouseholdMember> {
    const userId = this.requireSession();
    const db = this.db(userId);
    const member: HouseholdMember = {
      id: uid(),
      household_id: householdId,
      // En modo demo nadie más inicia sesión: la persona existe como integrante del hogar.
      user_id: null,
      role: 'member',
      display_name: input.display_name,
      invite_email: input.invite_email ?? null,
      color: input.color ?? MEMBER_COLORS[db.household_members.length % MEMBER_COLORS.length],
      share: input.share ?? 0.5,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    db.household_members.push(member);
    this.writeDb(userId, db);
    return member;
  }

  async updateHouseholdMember(id: UUID, patch: Partial<HouseholdMember>): Promise<HouseholdMember> {
    const userId = this.requireSession();
    const db = this.db(userId);
    const index = db.household_members.findIndex((m) => m.id === id);
    if (index === -1) throw err('household/member-not-found', 'No encontré a esa persona en el hogar.');
    db.household_members[index] = { ...db.household_members[index], ...patch };
    this.writeDb(userId, db);
    return db.household_members[index];
  }

  async removeHouseholdMember(id: UUID): Promise<void> {
    const userId = this.requireSession();
    const db = this.db(userId);
    db.household_members = db.household_members.filter((m) => m.id !== id);
    // Los gastos quedan en el hogar, sólo pierden a quién se los atribuía.
    db.transactions = db.transactions.map((t) => (t.paid_by === id ? { ...t, paid_by: null } : t));
    this.writeDb(userId, db);
  }

  async getHouseholdBalance(householdId: UUID, range: DateRangeInput): Promise<HouseholdBalance[]> {
    const userId = this.requireSession();
    const db = this.db(userId);
    const members = db.household_members.filter((m) => m.household_id === householdId && m.is_active);
    const rows = db.transactions.filter(
      (t) =>
        t.household_id === householdId &&
        t.type === 'expense' &&
        t.transaction_date >= range.from &&
        t.transaction_date <= range.to,
    );
    return computeHouseholdBalance(members, rows);
  }

  // ---------------------------------------------------------- categories

  async listCategories(userId: UUID): Promise<CategoryTree[]> {
    const db = this.db(userId);
    if (!db.categories.length) {
      const { categories, subcategories } = buildCategories(userId);
      db.categories = categories;
      db.subcategories = subcategories;
      this.writeDb(userId, db);
    }
    return db.categories
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((category) => ({
        ...category,
        subcategories: db.subcategories
          .filter((s) => s.category_id === category.id)
          .sort((a, b) => a.position - b.position),
      }));
  }

  async createCategory(userId: UUID, input: Partial<Category> & { name: string }): Promise<Category> {
    const db = this.db(userId);
    const category: Category = {
      id: uid(),
      user_id: userId,
      name: input.name,
      slug: input.slug ?? normalizeText(input.name).replace(/\s+/g, '-'),
      kind: input.kind ?? 'expense',
      icon: input.icon ?? 'Tag',
      color: input.color ?? '#0f766e',
      position: db.categories.length,
      is_active: true,
      is_system: false,
      created_at: new Date().toISOString(),
    };
    db.categories.push(category);
    this.writeDb(userId, db);
    return category;
  }

  async updateCategory(id: UUID, patch: Partial<Category>): Promise<Category> {
    const userId = this.requireSession();
    const db = this.db(userId);
    const index = db.categories.findIndex((c) => c.id === id);
    if (index === -1) throw err('category/not-found', 'No encontré esa categoría.');
    db.categories[index] = { ...db.categories[index], ...patch, updated_at: new Date().toISOString() };
    this.writeDb(userId, db);
    return db.categories[index];
  }

  async reorderCategories(ids: UUID[]): Promise<void> {
    const userId = this.requireSession();
    const db = this.db(userId);
    ids.forEach((id, position) => {
      const category = db.categories.find((c) => c.id === id);
      if (category) category.position = position;
    });
    this.writeDb(userId, db);
  }

  async createSubcategory(userId: UUID, categoryId: UUID, name: string): Promise<Subcategory> {
    const db = this.db(userId);
    const sub: Subcategory = {
      id: uid(),
      category_id: categoryId,
      user_id: userId,
      name,
      slug: normalizeText(name).replace(/\s+/g, '-'),
      position: db.subcategories.filter((s) => s.category_id === categoryId).length,
      is_active: true,
      keywords: [normalizeText(name)],
      created_at: new Date().toISOString(),
    };
    db.subcategories.push(sub);
    this.writeDb(userId, db);
    return sub;
  }

  async updateSubcategory(id: UUID, patch: Partial<Subcategory>): Promise<Subcategory> {
    const userId = this.requireSession();
    const db = this.db(userId);
    const index = db.subcategories.findIndex((s) => s.id === id);
    if (index === -1) throw err('subcategory/not-found', 'No encontré esa subcategoría.');
    db.subcategories[index] = { ...db.subcategories[index], ...patch, updated_at: new Date().toISOString() };
    this.writeDb(userId, db);
    return db.subcategories[index];
  }

  // -------------------------------------------------------- transactions

  async listTransactions(userId: UUID, filters: TransactionFilters): Promise<Paginated<Transaction>> {
    const rows = this.applyFilters(this.db(userId).transactions, filters);
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const sorted = sortTransactions(rows, filters.sort ?? 'date_desc');
    return {
      rows: sorted.slice((page - 1) * pageSize, page * pageSize),
      total: sorted.length,
      page,
      pageSize,
    };
  }

  async getTransaction(id: UUID): Promise<Transaction | null> {
    const userId = this.requireSession();
    return this.db(userId).transactions.find((t) => t.id === id) ?? null;
  }

  async createTransaction(userId: UUID, input: TransactionInput): Promise<Transaction> {
    const [row] = await this.createTransactions(userId, [input]);
    return row;
  }

  async createTransactions(userId: UUID, inputs: TransactionInput[]): Promise<Transaction[]> {
    const db = this.db(userId);
    const profile = await this.getProfile(userId);
    const rates = await this.getRateTable(userId);
    const created: Transaction[] = [];

    for (const input of inputs) {
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw err('transaction/invalid-amount', 'El importe tiene que ser un número mayor a cero.');
      }
      const conversion = convert(input.amount, input.currency, profile.base_currency, rates);
      const rate = input.exchange_rate ?? conversion.rate;
      const row: Transaction = {
        id: uid(),
        user_id: userId,
        household_id: input.household_id ?? null,
        type: input.type,
        amount: round(input.amount, 2),
        currency: input.currency,
        base_amount: round(input.amount * rate, 2),
        base_currency: profile.base_currency,
        exchange_rate: rate,
        description: input.description.trim(),
        merchant_id: null,
        merchant_name: input.merchant_name ?? null,
        category_id: input.category_id ?? null,
        subcategory_id: input.subcategory_id ?? null,
        payment_method_id: input.payment_method_id ?? null,
        account_id: input.account_id ?? null,
        transaction_date: input.transaction_date,
        notes: input.notes ?? null,
        source: input.source ?? 'manual',
        ai_confidence: input.ai_confidence ?? null,
        receipt_id: input.receipt_id ?? null,
        paid_by: input.paid_by ?? userId,
        created_by: userId,
        created_at: new Date().toISOString(),
      };
      db.transactions.push(row);

      for (const item of input.items ?? []) {
        db.transaction_items.push({
          id: uid(),
          transaction_id: row.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
          category_id: item.category_id ?? null,
          subcategory_id: item.subcategory_id ?? null,
          created_at: row.created_at,
        });
      }

      if (row.merchant_name) this.rememberMerchant(db, userId, row.merchant_name);
      created.push(row);
    }

    this.writeDb(userId, db);
    await this.refreshBudgetNotifications(userId);
    return created;
  }

  async updateTransaction(id: UUID, patch: Partial<Transaction>): Promise<Transaction> {
    const userId = this.requireSession();
    const db = this.db(userId);
    const index = db.transactions.findIndex((t) => t.id === id);
    if (index === -1) throw err('transaction/not-found', 'No encontré ese movimiento.');

    const current = db.transactions[index];
    const next: Transaction = { ...current, ...patch, updated_at: new Date().toISOString() };
    if (patch.amount !== undefined || patch.currency !== undefined || patch.exchange_rate !== undefined) {
      const rates = await this.getRateTable(userId);
      const conversion = convert(next.amount, next.currency, next.base_currency, rates);
      next.exchange_rate = patch.exchange_rate ?? conversion.rate;
      next.base_amount = round(next.amount * next.exchange_rate, 2);
    }
    db.transactions[index] = next;
    this.writeDb(userId, db);
    return next;
  }

  async deleteTransaction(id: UUID): Promise<void> {
    const userId = this.requireSession();
    const db = this.db(userId);
    db.transactions = db.transactions.filter((t) => t.id !== id);
    db.transaction_items = db.transaction_items.filter((i) => i.transaction_id !== id);
    db.receipts = db.receipts.map((r) => (r.transaction_id === id ? { ...r, transaction_id: null } : r));
    this.writeDb(userId, db);
  }

  async listTransactionItems(transactionId: UUID): Promise<TransactionItem[]> {
    const userId = this.requireSession();
    return this.db(userId).transaction_items.filter((i) => i.transaction_id === transactionId);
  }

  async searchTransactions(userId: UUID, query: string, limit = 20): Promise<Transaction[]> {
    const needle = normalizeText(query);
    if (!needle) return [];
    return this.db(userId)
      .transactions.filter((t) => normalizeText(`${t.description} ${t.merchant_name ?? ''}`).includes(needle))
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
      .slice(0, limit);
  }

  // ------------------------------------------------------ reference data

  async listPaymentMethods(userId: UUID): Promise<PaymentMethod[]> {
    const db = this.db(userId);
    if (!db.payment_methods.length) {
      db.payment_methods = defaultPaymentMethods(userId);
      this.writeDb(userId, db);
    }
    return db.payment_methods.filter((p) => p.is_active);
  }

  async createPaymentMethod(userId: UUID, input: Partial<PaymentMethod> & { name: string }): Promise<PaymentMethod> {
    const db = this.db(userId);
    const method: PaymentMethod = {
      id: uid(),
      user_id: userId,
      name: input.name,
      kind: input.kind ?? 'other',
      issuer: input.issuer ?? null,
      // Only the last four digits are ever kept.
      last4: input.last4 ? input.last4.replace(/\D/g, '').slice(-4) : null,
      is_default: input.is_default ?? false,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    db.payment_methods.push(method);
    this.writeDb(userId, db);
    return method;
  }

  async updatePaymentMethod(id: UUID, patch: Partial<PaymentMethod>): Promise<PaymentMethod> {
    const userId = this.requireSession();
    const db = this.db(userId);
    const index = db.payment_methods.findIndex((p) => p.id === id);
    if (index === -1) throw err('payment/not-found', 'No encontré ese medio de pago.');
    db.payment_methods[index] = { ...db.payment_methods[index], ...patch };
    this.writeDb(userId, db);
    return db.payment_methods[index];
  }

  async listAccounts(userId: UUID): Promise<Account[]> {
    return this.db(userId).accounts;
  }

  async listMerchants(userId: UUID): Promise<Merchant[]> {
    return this.db(userId).merchants;
  }

  // ------------------------------------------------------------ receipts

  async listReceipts(userId: UUID): Promise<Receipt[]> {
    return this.db(userId).receipts.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getReceipt(id: UUID): Promise<Receipt | null> {
    const userId = this.requireSession();
    return this.db(userId).receipts.find((r) => r.id === id) ?? null;
  }

  async saveReceipt(
    userId: UUID,
    receipt: Omit<Receipt, 'id' | 'user_id' | 'created_at'>,
    items: Omit<ReceiptItem, 'id' | 'receipt_id' | 'created_at'>[],
  ): Promise<Receipt> {
    const db = this.db(userId);
    const row: Receipt = { ...receipt, id: uid(), user_id: userId, created_at: new Date().toISOString() };
    db.receipts.push(row);
    for (const item of items) {
      db.receipt_items.push({ ...item, id: uid(), receipt_id: row.id, created_at: row.created_at });
    }
    this.writeDb(userId, db);
    return row;
  }

  async linkReceiptToTransaction(receiptId: UUID, transactionId: UUID): Promise<void> {
    const userId = this.requireSession();
    const db = this.db(userId);
    const receipt = db.receipts.find((r) => r.id === receiptId);
    if (receipt) receipt.transaction_id = transactionId;
    const transaction = db.transactions.find((t) => t.id === transactionId);
    if (transaction) transaction.receipt_id = receiptId;
    this.writeDb(userId, db);
  }

  async uploadReceiptImage(userId: UUID, file: Blob, filename: string): Promise<string> {
    const db = this.db(userId);
    const path = `${userId}/${Date.now()}-${filename}`;
    db.receipt_blobs[path] = await blobToDataUrl(file);
    this.writeDb(userId, db);
    return path;
  }

  async getReceiptImageUrl(path: string): Promise<string | null> {
    const userId = this.requireSession();
    return this.db(userId).receipt_blobs[path] ?? null;
  }

  async deleteReceipt(id: UUID): Promise<void> {
    const userId = this.requireSession();
    const db = this.db(userId);
    const receipt = db.receipts.find((r) => r.id === id);
    if (receipt?.storage_path) delete db.receipt_blobs[receipt.storage_path];
    db.receipts = db.receipts.filter((r) => r.id !== id);
    db.receipt_items = db.receipt_items.filter((i) => i.receipt_id !== id);
    this.writeDb(userId, db);
  }

  // ---------------------------------------------------- budgets & goals

  async listBudgets(userId: UUID): Promise<Budget[]> {
    return this.db(userId).budgets.filter((b) => b.is_active);
  }

  async createBudget(userId: UUID, input: Omit<Budget, 'id' | 'user_id' | 'created_at'>): Promise<Budget> {
    const db = this.db(userId);
    const budget: Budget = { ...input, id: uid(), user_id: userId, created_at: new Date().toISOString() };
    db.budgets.push(budget);
    this.writeDb(userId, db);
    return budget;
  }

  async updateBudget(id: UUID, patch: Partial<Budget>): Promise<Budget> {
    const userId = this.requireSession();
    const db = this.db(userId);
    const index = db.budgets.findIndex((b) => b.id === id);
    if (index === -1) throw err('budget/not-found', 'No encontré ese presupuesto.');
    db.budgets[index] = { ...db.budgets[index], ...patch, updated_at: new Date().toISOString() };
    this.writeDb(userId, db);
    return db.budgets[index];
  }

  async deleteBudget(id: UUID): Promise<void> {
    const userId = this.requireSession();
    const db = this.db(userId);
    db.budgets = db.budgets.filter((b) => b.id !== id);
    this.writeDb(userId, db);
  }

  async getBudgetProgress(userId: UUID, reference = today()): Promise<BudgetProgress[]> {
    const db = this.db(userId);
    const categories = await this.listCategories(userId);
    const referenceDate = new Date(`${reference}T12:00:00`);

    return db.budgets
      .filter((b) => b.is_active)
      .map((budget) => {
        const periodStart =
          budget.period === 'monthly'
            ? toISO(startOfMonth(referenceDate))
            : toISO(startOfWeek(referenceDate, { weekStartsOn: 1 }));
        const periodEnd =
          budget.period === 'monthly'
            ? toISO(endOfMonth(referenceDate))
            : toISO(endOfWeek(referenceDate, { weekStartsOn: 1 }));

        const rows = db.transactions.filter(
          (t) =>
            isSpending(t) &&
            t.transaction_date >= periodStart &&
            t.transaction_date <= periodEnd &&
            (!budget.category_id || t.category_id === budget.category_id) &&
            (!budget.subcategory_id || t.subcategory_id === budget.subcategory_id),
        );

        const spent = round(rows.reduce((acc, t) => acc + t.base_amount, 0), 2);
        const ratio = budget.amount > 0 ? spent / budget.amount : 0;
        const elapsed = Math.max(1, daysElapsed(periodStart, reference));
        const totalDays = Math.max(1, daysElapsed(periodStart, periodEnd));

        return {
          budget,
          spent,
          remaining: round(budget.amount - spent, 2),
          ratio: round(ratio, 4),
          status: budgetStatus(ratio, budget.alert_thresholds),
          period_start: periodStart,
          period_end: periodEnd,
          category_name: categories.find((c) => c.id === budget.category_id)?.name,
          // Sólo cuando ya pasó un cuarto del período: antes proyecta cualquier cosa.
          projected_end_of_period:
            elapsed / totalDays >= 0.25 ? round((spent / elapsed) * totalDays, 2) : undefined,
        } satisfies BudgetProgress;
      })
      .sort((a, b) => b.ratio - a.ratio);
  }

  async listGoals(userId: UUID): Promise<Goal[]> {
    return this.db(userId).goals.filter((g) => !g.is_archived);
  }

  async createGoal(userId: UUID, input: Omit<Goal, 'id' | 'user_id' | 'created_at'>): Promise<Goal> {
    const db = this.db(userId);
    const goal: Goal = { ...input, id: uid(), user_id: userId, created_at: new Date().toISOString() };
    db.goals.push(goal);
    this.writeDb(userId, db);
    return goal;
  }

  async updateGoal(id: UUID, patch: Partial<Goal>): Promise<Goal> {
    const userId = this.requireSession();
    const db = this.db(userId);
    const index = db.goals.findIndex((g) => g.id === id);
    if (index === -1) throw err('goal/not-found', 'No encontré esa meta.');
    db.goals[index] = { ...db.goals[index], ...patch, updated_at: new Date().toISOString() };
    this.writeDb(userId, db);
    return db.goals[index];
  }

  async deleteGoal(id: UUID): Promise<void> {
    const userId = this.requireSession();
    const db = this.db(userId);
    db.goals = db.goals.filter((g) => g.id !== id);
    db.goal_contributions = db.goal_contributions.filter((c) => c.goal_id !== id);
    this.writeDb(userId, db);
  }

  async addGoalContribution(userId: UUID, goalId: UUID, amount: number, note?: string): Promise<GoalContribution> {
    const db = this.db(userId);
    const goal = db.goals.find((g) => g.id === goalId);
    if (!goal) throw err('goal/not-found', 'No encontré esa meta.');

    const contribution: GoalContribution = {
      id: uid(),
      goal_id: goalId,
      user_id: userId,
      amount: round(amount, 2),
      currency: goal.currency,
      note: note ?? null,
      contributed_on: today(),
      created_at: new Date().toISOString(),
    };
    db.goal_contributions.push(contribution);
    goal.current_amount = round(goal.current_amount + amount, 2);
    this.writeDb(userId, db);
    return contribution;
  }

  async listGoalContributions(goalId: UUID): Promise<GoalContribution[]> {
    const userId = this.requireSession();
    return this.db(userId).goal_contributions.filter((c) => c.goal_id === goalId);
  }

  async getGoalProjections(userId: UUID): Promise<GoalProjection[]> {
    const goals = await this.listGoals(userId);
    return goals.map((goal) => projectGoal(goal));
  }

  // ------------------------------------------------------------ learning

  async listRules(userId: UUID): Promise<CategorizationRule[]> {
    return this.db(userId).categorization_rules;
  }

  async upsertRule(
    userId: UUID,
    rule: Omit<CategorizationRule, 'id' | 'user_id' | 'created_at' | 'hits'>,
  ): Promise<CategorizationRule> {
    const db = this.db(userId);
    const existing = db.categorization_rules.find((r) => r.pattern === rule.pattern);
    if (existing) {
      Object.assign(existing, rule, { hits: existing.hits + 1, updated_at: new Date().toISOString() });
      this.writeDb(userId, db);
      return existing;
    }
    const created: CategorizationRule = { ...rule, id: uid(), user_id: userId, hits: 0, created_at: new Date().toISOString() };
    db.categorization_rules.push(created);
    this.writeDb(userId, db);
    return created;
  }

  async deleteRule(id: UUID): Promise<void> {
    const userId = this.requireSession();
    const db = this.db(userId);
    db.categorization_rules = db.categorization_rules.filter((r) => r.id !== id);
    this.writeDb(userId, db);
  }

  async logAiInteraction(userId: UUID, interaction: Omit<AiInteraction, 'id' | 'user_id' | 'created_at'>): Promise<void> {
    const db = this.db(userId);
    db.ai_interactions.unshift({ ...interaction, id: uid(), user_id: userId, created_at: new Date().toISOString() });
    db.ai_interactions = db.ai_interactions.slice(0, 200);
    this.writeDb(userId, db);
  }

  async listAiInteractions(userId: UUID, limit = 50): Promise<AiInteraction[]> {
    return this.db(userId).ai_interactions.slice(0, limit);
  }

  // ---------------------------------------------------------- currencies

  async listExchangeRates(userId: UUID): Promise<ExchangeRate[]> {
    const db = this.db(userId);
    if (!db.exchange_rates.length) {
      db.exchange_rates = defaultRates();
      this.writeDb(userId, db);
    }
    return db.exchange_rates;
  }

  async upsertExchangeRate(userId: UUID, quote: CurrencyCode, rate: number): Promise<ExchangeRate> {
    const db = this.db(userId);
    const profile = await this.getProfile(userId);
    const existing = db.exchange_rates.find((r) => r.quote_currency === quote && r.base_currency === profile.base_currency);
    if (existing) {
      existing.rate = rate;
      existing.rate_date = today();
      existing.source = 'manual';
      this.writeDb(userId, db);
      return existing;
    }
    const created: ExchangeRate = {
      id: uid(),
      base_currency: profile.base_currency,
      quote_currency: quote,
      rate,
      rate_date: today(),
      source: 'manual',
      created_at: new Date().toISOString(),
    };
    db.exchange_rates.push(created);
    this.writeDb(userId, db);
    return created;
  }

  async getRateTable(userId: UUID): Promise<Record<string, number>> {
    const rates = await this.listExchangeRates(userId);
    const profile = await this.getProfile(userId);
    const table: Record<string, number> = { [profile.base_currency]: 1 };
    for (const rate of rates) table[rate.quote_currency] = rate.rate;
    return table;
  }

  // ------------------------------------------------------------- reports

  async getDashboard(userId: UUID, range: DateRangeInput): Promise<DashboardSummary> {
    const db = this.db(userId);
    const profile = await this.getProfile(userId);
    const categories = await this.listCategories(userId);
    const previous = previousRange({ ...range, label: '' });

    const current = summarize(db.transactions, range.from, range.to, profile.base_currency);
    const before = summarize(db.transactions, previous.from, previous.to, profile.base_currency);

    const currentRows = db.transactions.filter((t) => t.transaction_date >= range.from && t.transaction_date <= range.to);
    const previousRows = db.transactions.filter(
      (t) => t.transaction_date >= previous.from && t.transaction_date <= previous.to,
    );

    const balance = db.transactions.reduce(
      (acc, t) => acc + (t.type === 'income' || t.type === 'refund' ? t.base_amount : t.type === 'expense' ? -t.base_amount : 0),
      0,
    );

    return {
      period: current,
      previous: before,
      comparison: {
        income: compare(current.income, before.income, true),
        expense: compare(current.expense, before.expense, false),
        savings: compare(current.savings, before.savings, true),
      },
      balance: round(balance, 2),
      top_categories: categoryBreakdown(currentRows, categories, { previous: previousRows }).slice(0, 6),
      recent_days: dailySeries(currentRows, range.from, range.to),
    };
  }

  async getReportBundle(userId: UUID, filters: TransactionFilters): Promise<ReportBundle> {
    const db = this.db(userId);
    const profile = await this.getProfile(userId);
    const categories = await this.listCategories(userId);
    const methods = await this.listPaymentMethods(userId);

    const from = filters.from ?? monthRange().from;
    const to = filters.to ?? monthRange().to;
    const rows = this.applyFilters(db.transactions, { ...filters, from, to, page: 1, pageSize: 1_000_000 });
    const previous = previousRange({ from, to, label: '' });
    const previousRows = this.applyFilters(db.transactions, { ...filters, from: previous.from, to: previous.to });

    return {
      filters,
      summary: summarize(rows, from, to, profile.base_currency),
      previous: summarize(previousRows, previous.from, previous.to, profile.base_currency),
      byCategory: categoryBreakdown(rows, categories, { previous: previousRows }),
      bySubcategory: subcategoryBreakdown(rows, categories),
      monthly: monthlySeries(db.transactions, lastNMonths(6).from, to),
      daily: dailySeries(rows, from, to),
      merchants: merchantRanking(rows),
      paymentMethods: paymentMethodBreakdown(rows, new Map(methods.map((m) => [m.id, m.name]))),
      ants: antExpenses(rows, from, to),
    };
  }

  async getMonthlySeries(userId: UUID, months: number): Promise<MonthlyPoint[]> {
    const range = lastNMonths(months);
    return monthlySeries(this.db(userId).transactions, range.from, range.to);
  }

  async getCalendar(userId: UUID, range: DateRangeInput): Promise<DailyPoint[]> {
    return dailySeries(this.db(userId).transactions, range.from, range.to);
  }

  async listRecurring(userId: UUID): Promise<RecurringExpense[]> {
    const db = this.db(userId);
    const detected = detectRecurring(db.transactions, userId);
    return detected
      .map((row) => ({ ...row, confirmed: db.recurring_overrides[row.merchant_key] ?? null }))
      .filter((row) => row.confirmed !== false);
  }

  async setRecurringConfirmed(userId: UUID, merchantKey: string, confirmed: boolean): Promise<void> {
    const db = this.db(userId);
    db.recurring_overrides[merchantKey] = confirmed;
    this.writeDb(userId, db);
  }

  // --------------------------------------------------------------- planes

  async getSubscription(userId: UUID): Promise<Subscription | null> {
    const db = this.db(userId);
    if (!db.subscription) {
      // En modo demo arranca con todo desbloqueado: la idea es poder ver el producto
      // entero. Desde Ajustes se puede bajar de plan para probar los límites.
      db.subscription = {
        id: uid(),
        user_id: userId,
        plan_code: 'hogar',
        status: 'active',
        current_period_end: null,
        cancel_at_period_end: false,
        provider: 'demo',
        external_id: null,
        created_at: new Date().toISOString(),
      };
      this.writeDb(userId, db);
    }
    return db.subscription;
  }

  async getPlanUsage(userId: UUID): Promise<PlanUsage> {
    const db = this.db(userId);
    const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
    return {
      transactions: db.transactions.filter((t) => t.source !== 'seed' && t.created_at.slice(0, 10) >= monthStart).length,
      receipts: db.receipts.filter((r) => r.created_at.slice(0, 10) >= monthStart).length,
      ai_queries: db.ai_interactions.filter(
        (a) => (a.kind === 'query' || a.provider !== 'mock') && a.created_at.slice(0, 10) >= monthStart,
      ).length,
      budgets: db.budgets.filter((b) => b.is_active).length,
      goals: db.goals.filter((g) => !g.is_archived).length,
      household_members: db.household_members.filter((m) => m.is_active).length,
    };
  }

  async setDemoPlan(userId: UUID, plan: PlanCode): Promise<void> {
    const db = this.db(userId);
    const current = (await this.getSubscription(userId))!;
    db.subscription = { ...current, plan_code: plan, status: 'active' };
    this.writeDb(userId, db);
  }

  // ------------------------------------------------------- notifications

  async listNotifications(userId: UUID): Promise<AppNotification[]> {
    return this.db(userId).notifications.slice(0, 30);
  }

  async markNotificationRead(id: UUID): Promise<void> {
    const userId = this.requireSession();
    const db = this.db(userId);
    const notification = db.notifications.find((n) => n.id === id);
    if (notification) notification.read_at = new Date().toISOString();
    this.writeDb(userId, db);
  }

  // ---------------------------------------------------------------- demo

  async seedDemoData(userId: UUID): Promise<void> {
    const db = this.db(userId);
    const dataset = buildDemoDataset(userId);
    db.categories = dataset.categories;
    db.subcategories = dataset.subcategories;
    db.transactions = dataset.transactions;
    db.payment_methods = dataset.paymentMethods;
    db.accounts = dataset.accounts;
    db.merchants = dataset.merchants;
    db.budgets = dataset.budgets;
    db.goals = dataset.goals;
    db.exchange_rates = dataset.exchangeRates;
    this.writeDb(userId, db);
    await this.refreshBudgetNotifications(userId);
  }

  async resetData(userId: UUID): Promise<void> {
    const db = emptyDb();
    const profile = await this.getProfile(userId);
    db.profile = profile;
    const { categories, subcategories } = buildCategories(userId);
    db.categories = categories;
    db.subcategories = subcategories;
    db.payment_methods = defaultPaymentMethods(userId);
    db.exchange_rates = defaultRates();
    this.writeDb(userId, db);
  }

  // ------------------------------------------------------------ internals

  private applyFilters(rows: Transaction[], filters: TransactionFilters): Transaction[] {
    const search = filters.search ? normalizeText(filters.search) : '';
    return rows.filter((t) => {
      if (filters.from && t.transaction_date < filters.from) return false;
      if (filters.to && t.transaction_date > filters.to) return false;
      if (filters.types?.length && !filters.types.includes(t.type)) return false;
      if (filters.categoryIds?.length && !filters.categoryIds.includes(t.category_id ?? '')) return false;
      if (filters.subcategoryIds?.length && !filters.subcategoryIds.includes(t.subcategory_id ?? '')) return false;
      if (filters.paymentMethodIds?.length && !filters.paymentMethodIds.includes(t.payment_method_id ?? '')) return false;
      if (filters.currency && t.currency !== filters.currency) return false;
      if (filters.minAmount !== undefined && t.base_amount < filters.minAmount) return false;
      if (filters.maxAmount !== undefined && t.base_amount > filters.maxAmount) return false;
      if (filters.hasReceipt && !t.receipt_id) return false;
      if (filters.merchant && normalizeText(t.merchant_name ?? '') !== normalizeText(filters.merchant)) return false;
      if (search && !normalizeText(`${t.description} ${t.merchant_name ?? ''} ${t.notes ?? ''}`).includes(search)) return false;
      return true;
    });
  }

  private rememberMerchant(db: Database, userId: string, name: string) {
    const normalized = normalizeText(name);
    if (db.merchants.some((m) => m.normalized_name === normalized)) return;
    db.merchants.push({
      id: uid(),
      user_id: userId,
      name,
      normalized_name: normalized,
      created_at: new Date().toISOString(),
    });
  }

  private async refreshBudgetNotifications(userId: string) {
    const progress = await this.getBudgetProgress(userId);
    const db = this.db(userId);
    for (const item of progress) {
      if (item.status !== 'exceeded' && item.status !== 'danger') continue;
      const key = `${item.budget.id}:${item.period_start}:${item.status}`;
      if (db.notifications.some((n) => n.link === key)) continue;
      db.notifications.unshift({
        id: uid(),
        user_id: userId,
        kind: 'budget_alert',
        title:
          item.status === 'exceeded'
            ? `Excediste el límite de ${item.budget.name}`
            : `Vas por el ${Math.round(item.ratio * 100)}% de ${item.budget.name}`,
        body: `Llevás gastado ${item.spent.toLocaleString('es-AR')} de ${item.budget.amount.toLocaleString('es-AR')}.`,
        read_at: null,
        link: key,
        created_at: new Date().toISOString(),
      });
    }
    db.notifications = db.notifications.slice(0, 50);
    this.writeDb(userId, db);
  }

  private makeProfile(user: StoredUser): Profile {
    return {
      id: uid(),
      user_id: user.id,
      display_name: user.display_name,
      base_currency: env.baseCurrency,
      locale: 'es-AR',
      timezone: 'America/Argentina/Buenos_Aires',
      ai: {
        autosave_threshold: 0.9,
        ask_threshold: 0.7,
        learn_from_corrections: true,
        share_data_with_ai: true,
      },
      onboarding_done: false,
      favorite_category_ids: [],
      created_at: new Date().toISOString(),
    };
  }

  private readUsers(): StoredUser[] {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY) ?? '[]') as StoredUser[];
    } catch {
      return [];
    }
  }

  private setSession(userId: string) {
    localStorage.setItem(SESSION_KEY, userId);
    const user = this.readUsers().find((u) => u.id === userId);
    this.emit(user ? toAuthUser(user) : null);
  }

  private emit(user: AuthUser | null) {
    for (const listener of this.listeners) listener(user);
  }

  private requireSession(): string {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) throw err('auth/no-session', 'Tu sesión expiró. Volvé a iniciar sesión.');
    return userId;
  }

  private db(userId: string): Database {
    const cached = this.cache.get(userId);
    if (cached) return cached;
    let db = emptyDb();
    try {
      const raw = localStorage.getItem(dbKey(userId));
      if (raw) db = { ...emptyDb(), ...(JSON.parse(raw) as Database) };
    } catch {
      db = emptyDb();
    }
    this.cache.set(userId, db);
    return db;
  }

  private writeDb(userId: string, db: Database) {
    this.cache.set(userId, db);
    try {
      localStorage.setItem(dbKey(userId), JSON.stringify(db));
    } catch (error) {
      // Quota exceeded: drop stored images first, they are the heavy part.
      db.receipt_blobs = {};
      try {
        localStorage.setItem(dbKey(userId), JSON.stringify(db));
      } catch {
        throw err(
          'storage/full',
          'El navegador se quedó sin espacio para guardar los datos locales. Borrá tickets viejos o conectá Supabase.',
          undefined,
          error,
        );
      }
    }
  }
}

function sortTransactions(rows: Transaction[], sort: NonNullable<TransactionFilters['sort']>): Transaction[] {
  const copy = [...rows];
  switch (sort) {
    case 'date_asc':
      return copy.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    case 'amount_desc':
      return copy.sort((a, b) => b.base_amount - a.base_amount);
    case 'amount_asc':
      return copy.sort((a, b) => a.base_amount - b.base_amount);
    default:
      return copy.sort(
        (a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at),
      );
  }
}

export function budgetStatus(ratio: number, thresholds: number[]): BudgetStatus {
  const sorted = [...thresholds].sort((a, b) => a - b);
  const warn = sorted[0] ?? 0.8;
  const danger = sorted[1] ?? 0.9;
  if (ratio >= 1) return 'exceeded';
  if (ratio >= danger) return 'danger';
  if (ratio >= warn) return 'warning';
  return 'normal';
}

export function projectGoal(goal: Goal): GoalProjection {
  const remaining = round(Math.max(0, goal.target_amount - goal.current_amount), 2);
  const progress = goal.target_amount > 0 ? round((goal.current_amount / goal.target_amount) * 100, 1) : 0;
  const monthsLeft = goal.target_date ? monthsUntil(goal.target_date) : null;
  const requiredMonthly = monthsLeft && monthsLeft > 0 ? round(remaining / monthsLeft, 2) : remaining > 0 ? remaining : 0;

  const contribution = goal.monthly_contribution ?? 0;
  const estimatedMonths = contribution > 0 ? Math.ceil(remaining / contribution) : null;

  return {
    goal,
    progress,
    remaining,
    months_left: monthsLeft,
    required_monthly: requiredMonthly,
    estimated_completion: estimatedMonths === null ? null : toISO(addMonths(new Date(), estimatedMonths)),
    on_track: contribution > 0 && monthsLeft !== null ? contribution >= requiredMonthly : null,
  };
}

function daysElapsed(from: string, to: string): number {
  return Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1);
}

export const MEMBER_COLORS = ['#2f9e8f', '#8b6fe0', '#f0955a', '#5b8def', '#e58bb0', '#57b86f'];

/**
 * Reparte el gasto compartido según la parte de cada persona y compara contra lo que
 * puso. Un balance positivo significa que puso de más.
 */
export function computeHouseholdBalance(
  members: HouseholdMember[],
  rows: Pick<Transaction, 'paid_by' | 'base_amount'>[],
): HouseholdBalance[] {
  const total = round(rows.reduce((acc, row) => acc + row.base_amount, 0), 2);
  const totalShare = members.reduce((acc, member) => acc + member.share, 0) || 1;

  return members
    .map((member) => {
      const share = member.share / totalShare;
      const paid = round(
        rows.filter((row) => row.paid_by === member.id).reduce((acc, row) => acc + row.base_amount, 0),
        2,
      );
      const owed = round(total * share, 2);
      return {
        member_id: member.id,
        display_name: member.display_name,
        color: member.color,
        share: round(share, 4),
        paid,
        owed,
        balance: round(paid - owed, 2),
      } satisfies HouseholdBalance;
    })
    .sort((a, b) => b.paid - a.paid);
}

/**
 * Convierte los balances en las transferencias mínimas para quedar a mano:
 * quien está en rojo le paga a quien está en verde, de mayor a menor.
 */
export function settleBalances(balances: HouseholdBalance[]): Settlement[] {
  const debtors = balances.filter((b) => b.balance < -0.5).map((b) => ({ ...b, remaining: -b.balance }));
  const creditors = balances.filter((b) => b.balance > 0.5).map((b) => ({ ...b, remaining: b.balance }));
  const out: Settlement[] = [];

  for (const debtor of debtors) {
    for (const creditor of creditors) {
      if (debtor.remaining <= 0.5 || creditor.remaining <= 0.5) continue;
      const amount = round(Math.min(debtor.remaining, creditor.remaining), 2);
      out.push({ from: debtor.display_name, to: creditor.display_name, amount });
      debtor.remaining = round(debtor.remaining - amount, 2);
      creditor.remaining = round(creditor.remaining - amount, 2);
    }
  }
  return out;
}

function defaultPaymentMethods(userId: string): PaymentMethod[] {
  const now = new Date().toISOString();
  return [
    { id: uid(), user_id: userId, name: 'Efectivo', kind: 'cash', is_default: true, is_active: true, created_at: now },
    { id: uid(), user_id: userId, name: 'Débito', kind: 'debit', is_default: false, is_active: true, created_at: now },
    { id: uid(), user_id: userId, name: 'Crédito', kind: 'credit', is_default: false, is_active: true, created_at: now },
    { id: uid(), user_id: userId, name: 'Transferencia', kind: 'transfer', is_default: false, is_active: true, created_at: now },
    { id: uid(), user_id: userId, name: 'Mercado Pago', kind: 'wallet', is_default: false, is_active: true, created_at: now },
  ];
}

function defaultRates(): ExchangeRate[] {
  const now = new Date().toISOString();
  return [
    { id: uid(), base_currency: 'ARS', quote_currency: 'USD', rate: 1480, rate_date: today(), source: 'seed', created_at: now },
    { id: uid(), base_currency: 'ARS', quote_currency: 'EUR', rate: 1620, rate_date: today(), source: 'seed', created_at: now },
  ];
}

function toAuthUser(user: StoredUser): AuthUser {
  return { id: user.id, email: user.email, created_at: user.created_at };
}

async function hash(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No pude leer la imagen.'));
    reader.readAsDataURL(blob);
  });
}
