import type { Paginated, UUID } from '@/types/common';
import type { AiInteraction, CategorizationRule } from '@/types/ai';
import type { Budget, BudgetProgress } from '@/types/budget';
import type { Category, CategoryTree, Subcategory } from '@/types/category';
import type { CurrencyCode, ExchangeRate } from '@/types/currency';
import type { Goal, GoalContribution, GoalProjection } from '@/types/goal';
import type { AppNotification } from '@/types/notification';
import type { Receipt, ReceiptItem } from '@/types/receipt';
import type {
  DashboardSummary,
  MonthlyPoint,
  RecurringExpense,
  ReportBundle,
  DailyPoint,
} from '@/types/report';
import type {
  Account,
  AccountBalancePoint,
  AccountInput,
  Merchant,
  PaymentMethod,
  Transaction,
  TransactionFilters,
  TransactionInput,
  TransactionItem,
} from '@/types/transaction';
import type { AuthUser, Household, HouseholdBalance, HouseholdMember, Profile } from '@/types/user';
import type { PlanCode, PlanUsage, Subscription } from '@/types/plan';

export interface DateRangeInput {
  from: string;
  to: string;
}

/**
 * Everything the UI is allowed to ask the backend for.
 *
 * Two implementations satisfy it: Supabase (PostgreSQL + RLS) and a local browser
 * store used for the demo mode. No component ever talks to either one directly.
 */
export interface DataClient {
  readonly mode: 'local' | 'supabase';

  // Auth
  signUp(email: string, password: string, displayName: string): Promise<AuthUser>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<AuthUser | null>;
  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;

  // Profile & household
  getProfile(userId: UUID): Promise<Profile>;
  updateProfile(userId: UUID, patch: Partial<Profile>): Promise<Profile>;
  listHouseholds(userId: UUID): Promise<Household[]>;
  listHouseholdMembers(householdId: UUID): Promise<HouseholdMember[]>;
  createHousehold(userId: UUID, name: string): Promise<Household>;
  updateHousehold(id: UUID, patch: Partial<Household>): Promise<Household>;
  addHouseholdMember(
    householdId: UUID,
    input: { display_name: string; invite_email?: string | null; share?: number; color?: string },
  ): Promise<HouseholdMember>;
  updateHouseholdMember(id: UUID, patch: Partial<HouseholdMember>): Promise<HouseholdMember>;
  removeHouseholdMember(id: UUID): Promise<void>;
  getHouseholdBalance(householdId: UUID, range: DateRangeInput): Promise<HouseholdBalance[]>;

  // Categories
  listCategories(userId: UUID): Promise<CategoryTree[]>;
  createCategory(userId: UUID, input: Partial<Category> & { name: string }): Promise<Category>;
  updateCategory(id: UUID, patch: Partial<Category>): Promise<Category>;
  reorderCategories(ids: UUID[]): Promise<void>;
  createSubcategory(userId: UUID, categoryId: UUID, name: string): Promise<Subcategory>;
  updateSubcategory(id: UUID, patch: Partial<Subcategory>): Promise<Subcategory>;

  // Transactions
  listTransactions(userId: UUID, filters: TransactionFilters): Promise<Paginated<Transaction>>;
  getTransaction(id: UUID): Promise<Transaction | null>;
  createTransaction(userId: UUID, input: TransactionInput): Promise<Transaction>;
  createTransactions(userId: UUID, inputs: TransactionInput[]): Promise<Transaction[]>;
  updateTransaction(id: UUID, patch: Partial<Transaction>): Promise<Transaction>;
  deleteTransaction(id: UUID): Promise<void>;
  listTransactionItems(transactionId: UUID): Promise<TransactionItem[]>;
  searchTransactions(userId: UUID, query: string, limit?: number): Promise<Transaction[]>;

  // Reference data
  listPaymentMethods(userId: UUID): Promise<PaymentMethod[]>;
  createPaymentMethod(userId: UUID, input: Partial<PaymentMethod> & { name: string }): Promise<PaymentMethod>;
  updatePaymentMethod(id: UUID, patch: Partial<PaymentMethod>): Promise<PaymentMethod>;
  listAccounts(userId: UUID): Promise<Account[]>;
  createAccount(userId: UUID, input: AccountInput): Promise<Account>;
  updateAccount(id: UUID, patch: Partial<AccountInput> & { is_active?: boolean }): Promise<Account>;
  archiveAccount(id: UUID): Promise<void>;
  /** Los saldos declarados de una cuenta, del más reciente al más viejo. */
  listAccountBalances(accountId: UUID): Promise<AccountBalancePoint[]>;
  /** El total de todas las cuentas, pasado a la moneda base. */
  getNetWorth(userId: UUID): Promise<number>;
  listMerchants(userId: UUID): Promise<Merchant[]>;

  // Receipts
  listReceipts(userId: UUID): Promise<Receipt[]>;
  getReceipt(id: UUID): Promise<Receipt | null>;
  saveReceipt(userId: UUID, receipt: Omit<Receipt, 'id' | 'user_id' | 'created_at'>, items: Omit<ReceiptItem, 'id' | 'receipt_id' | 'created_at'>[]): Promise<Receipt>;
  linkReceiptToTransaction(receiptId: UUID, transactionId: UUID): Promise<void>;
  uploadReceiptImage(userId: UUID, file: Blob, filename: string): Promise<string>;
  getReceiptImageUrl(path: string): Promise<string | null>;
  deleteReceipt(id: UUID): Promise<void>;

  // Budgets & goals
  listBudgets(userId: UUID): Promise<Budget[]>;
  createBudget(userId: UUID, input: Omit<Budget, 'id' | 'user_id' | 'created_at'>): Promise<Budget>;
  updateBudget(id: UUID, patch: Partial<Budget>): Promise<Budget>;
  deleteBudget(id: UUID): Promise<void>;
  getBudgetProgress(userId: UUID, reference?: string): Promise<BudgetProgress[]>;

  listGoals(userId: UUID): Promise<Goal[]>;
  createGoal(userId: UUID, input: Omit<Goal, 'id' | 'user_id' | 'created_at'>): Promise<Goal>;
  updateGoal(id: UUID, patch: Partial<Goal>): Promise<Goal>;
  deleteGoal(id: UUID): Promise<void>;
  addGoalContribution(userId: UUID, goalId: UUID, amount: number, note?: string): Promise<GoalContribution>;
  listGoalContributions(goalId: UUID): Promise<GoalContribution[]>;
  getGoalProjections(userId: UUID): Promise<GoalProjection[]>;

  // Learning
  listRules(userId: UUID): Promise<CategorizationRule[]>;
  upsertRule(userId: UUID, rule: Omit<CategorizationRule, 'id' | 'user_id' | 'created_at' | 'hits'>): Promise<CategorizationRule>;
  deleteRule(id: UUID): Promise<void>;
  logAiInteraction(userId: UUID, interaction: Omit<AiInteraction, 'id' | 'user_id' | 'created_at'>): Promise<void>;
  listAiInteractions(userId: UUID, limit?: number): Promise<AiInteraction[]>;

  // Currencies
  listExchangeRates(userId: UUID): Promise<ExchangeRate[]>;
  upsertExchangeRate(userId: UUID, quote: CurrencyCode, rate: number): Promise<ExchangeRate>;
  getRateTable(userId: UUID): Promise<Record<string, number>>;

  // Reports
  getDashboard(userId: UUID, range: DateRangeInput): Promise<DashboardSummary>;
  getReportBundle(userId: UUID, filters: TransactionFilters): Promise<ReportBundle>;
  getMonthlySeries(userId: UUID, months: number): Promise<MonthlyPoint[]>;
  getCalendar(userId: UUID, range: DateRangeInput): Promise<DailyPoint[]>;
  listRecurring(userId: UUID): Promise<RecurringExpense[]>;
  setRecurringConfirmed(userId: UUID, merchantKey: string, confirmed: boolean): Promise<void>;

  // Planes y suscripción
  getSubscription(userId: UUID): Promise<Subscription | null>;
  getPlanUsage(userId: UUID): Promise<PlanUsage>;
  /** Sólo en modo demo: permite probar cómo se ve cada plan. */
  setDemoPlan?(userId: UUID, plan: PlanCode): Promise<void>;

  // Notifications
  listNotifications(userId: UUID): Promise<AppNotification[]>;
  markNotificationRead(id: UUID): Promise<void>;

  /** Loads the demo dataset. Only meaningful in local mode. */
  seedDemoData?(userId: UUID): Promise<void>;
  resetData?(userId: UUID): Promise<void>;
}
