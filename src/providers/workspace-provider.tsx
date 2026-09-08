import * as React from 'react';
import { getDataClient } from '@/services/data';
import type { DataClient } from '@/services/data';
import type { CategorizationRule } from '@/types/ai';
import type { CategoryTree } from '@/types/category';
import type { PaymentMethod, Transaction } from '@/types/transaction';
import type { Household, HouseholdMember, Profile } from '@/types/user';
import type { PlanUsage, Subscription } from '@/types/plan';
import { useAuth } from './auth-provider';

interface WorkspaceContextValue {
  client: DataClient;
  userId: string;
  profile: Profile;
  categories: CategoryTree[];
  paymentMethods: PaymentMethod[];
  rules: CategorizationRule[];
  /** Recent rows kept in memory: the categorization engine uses them as precedent. */
  history: Transaction[];
  rates: Record<string, number>;
  /** Hogar activo (el primero al que pertenece la persona), si tiene uno. */
  household: Household | null;
  householdMembers: HouseholdMember[];
  subscription: Subscription | null;
  usage: PlanUsage;
  refreshHousehold: () => Promise<void>;
  refreshPlan: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshCategories: () => Promise<void>;
  refreshRules: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  refreshPaymentMethods: () => Promise<void>;
  refreshRates: () => Promise<void>;
  /** Bumped after every write so dependent screens re-query. */
  revision: number;
  bumpRevision: () => void;
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null);

const EMPTY_USAGE: PlanUsage = {
  transactions: 0,
  receipts: 0,
  ai_queries: 0,
  budgets: 0,
  goals: 0,
  household_members: 0,
};

export function WorkspaceProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const client = React.useMemo(() => getDataClient(), []);
  const { user } = useAuth();
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [categories, setCategories] = React.useState<CategoryTree[]>([]);
  const [paymentMethods, setPaymentMethods] = React.useState<PaymentMethod[]>([]);
  const [rules, setRules] = React.useState<CategorizationRule[]>([]);
  const [history, setHistory] = React.useState<Transaction[]>([]);
  const [rates, setRates] = React.useState<Record<string, number>>({ ARS: 1 });
  const [household, setHousehold] = React.useState<Household | null>(null);
  const [householdMembers, setHouseholdMembers] = React.useState<HouseholdMember[]>([]);
  const [subscription, setSubscription] = React.useState<Subscription | null>(null);
  const [usage, setUsage] = React.useState<PlanUsage>(EMPTY_USAGE);
  const [revision, setRevision] = React.useState(0);
  const [ready, setReady] = React.useState(false);

  const userId = user?.id ?? '';

  const loadHistory = React.useCallback(async () => {
    if (!userId) return;
    const page = await client.listTransactions(userId, { page: 1, pageSize: 300, sort: 'date_desc' });
    setHistory(page.rows);
  }, [client, userId]);

  const loadPlan = React.useCallback(async () => {
    if (!userId) return;
    const [sub, used] = await Promise.all([client.getSubscription(userId), client.getPlanUsage(userId)]);
    setSubscription(sub);
    setUsage(used);
  }, [client, userId]);

  const loadHousehold = React.useCallback(async () => {
    if (!userId) return;
    const households = await client.listHouseholds(userId);
    const active = households[0] ?? null;
    setHousehold(active);
    setHouseholdMembers(active ? await client.listHouseholdMembers(active.id) : []);
  }, [client, userId]);

  React.useEffect(() => {
    if (!userId) {
      setReady(false);
      return;
    }
    let active = true;
    setReady(false);

    (async () => {
      const [loadedProfile, loadedCategories, loadedMethods, loadedRules, loadedRates] = await Promise.all([
        client.getProfile(userId),
        client.listCategories(userId),
        client.listPaymentMethods(userId),
        client.listRules(userId),
        client.getRateTable(userId),
      ]);
      if (!active) return;
      setProfile(loadedProfile);
      setCategories(loadedCategories);
      setPaymentMethods(loadedMethods);
      setRules(loadedRules);
      setRates(loadedRates);
      await loadHistory();
      await loadHousehold().catch(() => undefined);
      await loadPlan().catch(() => undefined);
      if (active) setReady(true);
    })().catch(() => {
      if (active) setReady(true);
    });

    return () => {
      active = false;
    };
  }, [client, userId, loadHistory, loadHousehold, loadPlan]);

  const value = React.useMemo<WorkspaceContextValue | null>(() => {
    if (!profile || !userId) return null;
    return {
      client,
      userId,
      profile,
      categories,
      paymentMethods,
      rules,
      history,
      rates,
      household,
      householdMembers,
      subscription,
      usage,
      revision,
      bumpRevision: () => setRevision((n) => n + 1),
      refreshProfile: async () => setProfile(await client.getProfile(userId)),
      refreshCategories: async () => setCategories(await client.listCategories(userId)),
      refreshRules: async () => setRules(await client.listRules(userId)),
      refreshHistory: loadHistory,
      refreshHousehold: loadHousehold,
      refreshPlan: loadPlan,
      refreshPaymentMethods: async () => setPaymentMethods(await client.listPaymentMethods(userId)),
      refreshRates: async () => setRates(await client.getRateTable(userId)),
    };
  }, [
    client,
    userId,
    profile,
    categories,
    paymentMethods,
    rules,
    history,
    rates,
    household,
    householdMembers,
    subscription,
    usage,
    revision,
    loadHistory,
    loadHousehold,
    loadPlan,
  ]);

  if (!ready || !value) return <>{fallback}</>;
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = React.useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace necesita estar dentro de <WorkspaceProvider>.');
  return context;
}
