import { addDays, format, startOfMonth, subMonths } from 'date-fns';
import { uid, normalizeText, round } from '@/lib/utils';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import type { Category, Subcategory } from '@/types/category';
import type { Budget } from '@/types/budget';
import type { Goal } from '@/types/goal';
import type { ExchangeRate } from '@/types/currency';
import type { Account, Merchant, PaymentMethod, Transaction } from '@/types/transaction';
import { between, mulberry32, pick } from './random';

export interface DemoDataset {
  categories: Category[];
  subcategories: Subcategory[];
  transactions: Transaction[];
  paymentMethods: PaymentMethod[];
  accounts: Account[];
  merchants: Merchant[];
  budgets: Budget[];
  goals: Goal[];
  exchangeRates: ExchangeRate[];
}

const ISO = 'yyyy-MM-dd';

/** Categories and subcategories are copied per user so they can be renamed freely. */
export function buildCategories(userId: string): { categories: Category[]; subcategories: Subcategory[] } {
  const categories: Category[] = [];
  const subcategories: Subcategory[] = [];
  const now = new Date().toISOString();

  DEFAULT_CATEGORIES.forEach((seed, index) => {
    const categoryId = uid();
    categories.push({
      id: categoryId,
      user_id: userId,
      name: seed.name,
      slug: seed.slug,
      kind: seed.kind,
      icon: seed.icon,
      color: seed.color,
      position: index,
      is_active: true,
      is_system: true,
      created_at: now,
    });
    seed.subcategories.forEach((sub, subIndex) => {
      subcategories.push({
        id: uid(),
        category_id: categoryId,
        user_id: userId,
        name: sub.name,
        slug: sub.slug,
        position: subIndex,
        is_active: true,
        keywords: sub.keywords,
        created_at: now,
      });
    });
  });

  return { categories, subcategories };
}

interface SpendingPattern {
  category: string;
  subcategory: string;
  merchants: string[];
  min: number;
  max: number;
  /** Roughly how many times this happens per month. */
  perMonth: number;
  recurring?: boolean;
  descriptions?: string[];
}

const PATTERNS: SpendingPattern[] = [
  { category: 'alimentacion', subcategory: 'supermercado', merchants: ['Carrefour', 'Coto', 'Día%', 'Jumbo'], min: 28000, max: 96000, perMonth: 2 },
  { category: 'alimentacion', subcategory: 'verduleria', merchants: ['Verdulería del barrio'], min: 6000, max: 18000, perMonth: 1.5 },
  { category: 'alimentacion', subcategory: 'carniceria', merchants: ['Carnicería La Estrella'], min: 12000, max: 38000, perMonth: 1 },
  { category: 'alimentacion', subcategory: 'panaderia', merchants: ['Panadería Los Dos Hermanos'], min: 2500, max: 7000, perMonth: 2 },
  { category: 'alimentacion', subcategory: 'delivery', merchants: ['PedidosYa', 'Rappi'], min: 9000, max: 26000, perMonth: 2 },
  { category: 'alimentacion', subcategory: 'restaurante', merchants: ['Parrilla Don Julio', 'Sushi Club', 'Bodegón El Puente'], min: 18000, max: 62000, perMonth: 1 },
  { category: 'alimentacion', subcategory: 'cafe', merchants: ['Starbucks', 'Havanna', 'Café de la esquina'], min: 3000, max: 9000, perMonth: 2.5 },
  { category: 'alimentacion', subcategory: 'comida-rapida', merchants: ["McDonald's", 'Mostaza', 'Burger King'], min: 7000, max: 19000, perMonth: 1 },
  { category: 'transporte', subcategory: 'combustible', merchants: ['YPF', 'Shell', 'Axion'], min: 22000, max: 48000, perMonth: 1.5 },
  { category: 'transporte', subcategory: 'transporte-publico', merchants: ['SUBE'], min: 3000, max: 9000, perMonth: 1 },
  { category: 'transporte', subcategory: 'apps-movilidad', merchants: ['Uber', 'Cabify', 'DiDi'], min: 4000, max: 16000, perMonth: 2 },
  { category: 'transporte', subcategory: 'peajes', merchants: ['Telepase'], min: 1800, max: 4500, perMonth: 1 },
  { category: 'hogar', subcategory: 'alquiler', merchants: ['Inmobiliaria Rivas'], min: 450000, max: 450000, perMonth: 0.5, recurring: true, descriptions: ['Alquiler'] },
  { category: 'hogar', subcategory: 'expensas', merchants: ['Consorcio'], min: 85000, max: 105000, perMonth: 0.5, recurring: true, descriptions: ['Expensas'] },
  { category: 'hogar', subcategory: 'electricidad', merchants: ['Edesur'], min: 28000, max: 62000, perMonth: 0.5, recurring: true, descriptions: ['Factura de luz'] },
  { category: 'hogar', subcategory: 'gas', merchants: ['Metrogas'], min: 12000, max: 39000, perMonth: 0.5, recurring: true, descriptions: ['Factura de gas'] },
  { category: 'hogar', subcategory: 'internet', merchants: ['Fibertel'], min: 32000, max: 36000, perMonth: 0.5, recurring: true, descriptions: ['Internet'] },
  { category: 'hogar', subcategory: 'telefonia', merchants: ['Personal'], min: 14000, max: 18000, perMonth: 0.5, recurring: true, descriptions: ['Celular'] },
  { category: 'hogar', subcategory: 'mantenimiento-hogar', merchants: ['Easy', 'Ferretería del barrio'], min: 8000, max: 45000, perMonth: 0.5 },
  { category: 'salud', subcategory: 'obra-social', merchants: ['OSDE'], min: 118000, max: 132000, perMonth: 0.5, recurring: true, descriptions: ['Prepaga'] },
  { category: 'salud', subcategory: 'farmacia', merchants: ['Farmacity'], min: 4000, max: 26000, perMonth: 1 },
  { category: 'salud', subcategory: 'medico', merchants: ['Consultorio'], min: 18000, max: 45000, perMonth: 0.5 },
  { category: 'educacion', subcategory: 'cursos', merchants: ['Udemy', 'Platzi'], min: 9000, max: 32000, perMonth: 0.5 },
  { category: 'educacion', subcategory: 'libros', merchants: ['Cúspide', 'El Ateneo'], min: 12000, max: 34000, perMonth: 0.5 },
  { category: 'entretenimiento', subcategory: 'streaming', merchants: ['Netflix'], min: 9500, max: 9500, perMonth: 0.5, recurring: true, descriptions: ['Netflix'] },
  { category: 'entretenimiento', subcategory: 'streaming', merchants: ['Spotify'], min: 5900, max: 5900, perMonth: 0.5, recurring: true, descriptions: ['Spotify'] },
  { category: 'entretenimiento', subcategory: 'cine', merchants: ['Cinemark', 'Hoyts'], min: 8000, max: 22000, perMonth: 0.5 },
  { category: 'entretenimiento', subcategory: 'salidas', merchants: ['Bar Nómade', 'Boliche'], min: 12000, max: 48000, perMonth: 1 },
  { category: 'deporte', subcategory: 'gimnasio', merchants: ['SportClub'], min: 28000, max: 32000, perMonth: 0.5, recurring: true, descriptions: ['Cuota del gym'] },
  { category: 'deporte', subcategory: 'futbol', merchants: ['Cancha El Potrero'], min: 6000, max: 12000, perMonth: 1.5, descriptions: ['Fútbol de los jueves'] },
  { category: 'ropa', subcategory: 'indumentaria', merchants: ['Zara', 'Kevingston'], min: 25000, max: 120000, perMonth: 0.5 },
  { category: 'ropa', subcategory: 'calzado', merchants: ['Stock Center', 'Dexter'], min: 60000, max: 180000, perMonth: 0.2 },
  { category: 'personal', subcategory: 'cuidado-personal', merchants: ['Peluquería', 'Farmacity'], min: 8000, max: 26000, perMonth: 0.5 },
  { category: 'personal', subcategory: 'regalos', merchants: ['Mercado Libre'], min: 15000, max: 85000, perMonth: 0.5 },
  { category: 'personal', subcategory: 'mascotas', merchants: ['Veterinaria San Roque'], min: 12000, max: 42000, perMonth: 0.5 },
  { category: 'finanzas', subcategory: 'impuestos', merchants: ['ARCA'], min: 32000, max: 68000, perMonth: 0.5, recurring: true, descriptions: ['Monotributo'] },
  { category: 'finanzas', subcategory: 'comisiones', merchants: ['Banco'], min: 1200, max: 4500, perMonth: 1 },
  { category: 'hogar', subcategory: 'limpieza', merchants: ['Carrefour'], min: 5000, max: 16000, perMonth: 1 },
];

const INCOME_PATTERNS = [
  { subcategory: 'sueldo', description: 'Sueldo', min: 1_650_000, max: 1_900_000, day: 5 },
  { subcategory: 'freelance', description: 'Proyecto freelance', min: 180_000, max: 520_000, day: 18 },
];

/**
 * ~200 realistic Argentine movements across the last six months.
 * Used for the demo account and as the fixture for the SQL seed.
 */
export function buildDemoDataset(userId: string, reference = new Date()): DemoDataset {
  const rng = mulberry32(20260907);
  const { categories, subcategories } = buildCategories(userId);
  const now = new Date().toISOString();

  const findCategory = (slug: string) => categories.find((c) => c.slug === slug)!;
  const findSub = (categoryId: string, slug: string) =>
    subcategories.find((s) => s.category_id === categoryId && s.slug === slug)!;

  const paymentMethods: PaymentMethod[] = [
    { id: uid(), user_id: userId, name: 'Efectivo', kind: 'cash', is_default: false, is_active: true, created_at: now },
    { id: uid(), user_id: userId, name: 'Débito Galicia', kind: 'debit', issuer: 'Galicia', last4: '4417', is_default: true, is_active: true, created_at: now },
    { id: uid(), user_id: userId, name: 'Visa Crédito', kind: 'credit', issuer: 'Galicia', last4: '9032', is_default: false, is_active: true, created_at: now },
    { id: uid(), user_id: userId, name: 'Mercado Pago', kind: 'wallet', issuer: 'Mercado Pago', is_default: false, is_active: true, created_at: now },
    { id: uid(), user_id: userId, name: 'Transferencia', kind: 'transfer', is_default: false, is_active: true, created_at: now },
  ];

  // Con saldo, para que la demo muestre de qué se trata la pantalla de cuentas.
  const account = (
    name: string,
    currency: 'ARS' | 'USD',
    kind: Account['kind'],
    balance: number,
    institution: string,
    sort: number,
  ): Account => ({
    id: uid(),
    user_id: userId,
    name,
    currency,
    kind,
    balance,
    balance_updated_at: format(reference, 'yyyy-MM-dd'),
    institution,
    notes: null,
    sort_order: sort,
    include_in_net_worth: true,
    is_active: true,
    created_at: now,
  });

  const accounts: Account[] = [
    account('Caja de ahorro $', 'ARS', 'savings', 1_240_000, 'Galicia', 0),
    account('FIMA Premium', 'ARS', 'investment', 2_600_000, 'Galicia', 1),
    account('Reservas', 'ARS', 'wallet', 380_000, 'Mercado Pago', 2),
    account('Dólares', 'USD', 'cash', 1_200, 'En casa', 3),
  ];

  const merchantNames = new Set<string>();
  PATTERNS.forEach((p) => p.merchants.forEach((m) => merchantNames.add(m)));
  const merchants: Merchant[] = [...merchantNames].map((name) => ({
    id: uid(),
    user_id: userId,
    name,
    normalized_name: normalizeText(name),
    created_at: now,
  }));

  const transactions: Transaction[] = [];
  const monthsBack = 6;

  for (let monthOffset = 0; monthOffset < monthsBack; monthOffset += 1) {
    const monthStart = startOfMonth(subMonths(reference, monthsBack - 1 - monthOffset));
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const isCurrentMonth = monthOffset === monthsBack - 1;
    const lastDay = isCurrentMonth ? Math.min(reference.getDate(), daysInMonth) : daysInMonth;
    // Later months carry a little inflation, like real Argentine prices.
    const inflation = 1 + monthOffset * 0.035;

    for (const income of INCOME_PATTERNS) {
      if (income.day > lastDay) continue;
      const category = findCategory('ingresos');
      const sub = findSub(category.id, income.subcategory);
      const amount = round(between(rng, income.min, income.max, 1000) * inflation, 2);
      transactions.push(
        makeTransaction({
          userId,
          type: 'income',
          amount,
          date: format(addDays(monthStart, income.day - 1), ISO),
          description: income.description,
          merchantName: null,
          categoryId: category.id,
          subcategoryId: sub.id,
          paymentMethodId: paymentMethods[4].id,
          accountId: accounts[0].id,
          source: 'seed',
        }),
      );
    }

    for (const pattern of PATTERNS) {
      // The current month is only partly elapsed, so it gets proportionally fewer movements.
      const density = isCurrentMonth ? lastDay / daysInMonth : 1;
      const occurrences = pattern.recurring ? 1 : Math.round(pattern.perMonth * density * (0.7 + rng() * 0.6));
      const category = findCategory(pattern.category);
      const sub = findSub(category.id, pattern.subcategory);

      for (let i = 0; i < occurrences; i += 1) {
        const day = pattern.recurring
          ? Math.min(lastDay, 3 + Math.floor(rng() * 5) + (pattern.subcategory === 'alquiler' ? 0 : 4))
          : 1 + Math.floor(rng() * lastDay);
        if (day > lastDay) continue;

        const merchant = pick(rng, pattern.merchants);
        const amount = round(between(rng, pattern.min, pattern.max, 100) * inflation, 2);
        const description = pattern.descriptions ? pick(rng, pattern.descriptions) : merchant;

        transactions.push(
          makeTransaction({
            userId,
            type: 'expense',
            amount,
            date: format(addDays(monthStart, day - 1), ISO),
            description,
            merchantName: merchant,
            categoryId: category.id,
            subcategoryId: sub.id,
            paymentMethodId: pick(rng, paymentMethods).id,
            accountId: accounts[0].id,
            source: rng() > 0.75 ? 'natural_language' : 'seed',
          }),
        );
      }
    }
  }

  // A couple of dollar movements so multi-currency has something real to show.
  const investments = findCategory('inversiones');
  transactions.push(
    makeTransaction({
      userId,
      type: 'expense',
      amount: 200,
      currency: 'USD',
      exchangeRate: 1450,
      date: format(subMonths(reference, 1), ISO),
      description: 'Compra de dólares',
      merchantName: null,
      categoryId: investments.id,
      subcategoryId: findSub(investments.id, 'dolar').id,
      paymentMethodId: paymentMethods[4].id,
      accountId: accounts[2].id,
      source: 'manual',
    }),
    makeTransaction({
      userId,
      type: 'expense',
      amount: 120,
      currency: 'USD',
      exchangeRate: 1480,
      date: format(subMonths(reference, 0), ISO),
      description: 'Zapatillas',
      merchantName: 'Nike',
      categoryId: findCategory('ropa').id,
      subcategoryId: findSub(findCategory('ropa').id, 'calzado').id,
      paymentMethodId: paymentMethods[2].id,
      accountId: accounts[2].id,
      source: 'natural_language',
    }),
    makeTransaction({
      userId,
      type: 'refund',
      amount: 24000,
      date: format(subMonths(reference, 0), ISO),
      description: 'Reintegro compra online',
      merchantName: 'Mercado Libre',
      categoryId: findCategory('ingresos').id,
      subcategoryId: findSub(findCategory('ingresos').id, 'reintegros').id,
      paymentMethodId: paymentMethods[3].id,
      accountId: accounts[0].id,
      source: 'manual',
    }),
  );

  const budgets: Budget[] = [
    makeBudget(userId, 'Alimentación', findCategory('alimentacion').id, 400000),
    makeBudget(userId, 'Transporte', findCategory('transporte').id, 150000),
    makeBudget(userId, 'Entretenimiento', findCategory('entretenimiento').id, 90000),
    { ...makeBudget(userId, 'Gasto total del mes', null, 1400000), alert_thresholds: [0.8, 0.9, 1] },
  ];

  const goals: Goal[] = [
    {
      id: uid(),
      user_id: userId,
      household_id: null,
      name: 'Vacaciones',
      description: 'Costa atlántica en enero',
      target_amount: 2_000_000,
      current_amount: 850_000,
      currency: 'ARS',
      target_date: format(addDays(reference, 150), ISO),
      monthly_contribution: 250_000,
      icon: 'Palmtree',
      color: '#0f766e',
      is_archived: false,
      created_at: now,
    },
    {
      id: uid(),
      user_id: userId,
      household_id: null,
      name: 'Fondo de emergencia',
      description: 'Tres meses de gastos',
      target_amount: 3_600_000,
      current_amount: 1_150_000,
      currency: 'ARS',
      target_date: format(addDays(reference, 330), ISO),
      monthly_contribution: 200_000,
      icon: 'ShieldCheck',
      color: '#2563eb',
      is_archived: false,
      created_at: now,
    },
  ];

  const exchangeRates: ExchangeRate[] = [
    { id: uid(), base_currency: 'ARS', quote_currency: 'USD', rate: 1480, rate_date: format(reference, ISO), source: 'seed', created_at: now },
    { id: uid(), base_currency: 'ARS', quote_currency: 'EUR', rate: 1620, rate_date: format(reference, ISO), source: 'seed', created_at: now },
  ];

  return { categories, subcategories, transactions, paymentMethods, accounts, merchants, budgets, goals, exchangeRates };
}

function makeBudget(userId: string, name: string, categoryId: string | null, amount: number): Budget {
  return {
    id: uid(),
    user_id: userId,
    household_id: null,
    name,
    period: 'monthly',
    amount,
    currency: 'ARS',
    category_id: categoryId,
    subcategory_id: null,
    alert_thresholds: [0.8, 0.9, 1],
    starts_on: format(startOfMonth(new Date()), ISO),
    is_active: true,
    created_at: new Date().toISOString(),
  };
}

function makeTransaction(args: {
  userId: string;
  type: Transaction['type'];
  amount: number;
  currency?: string;
  exchangeRate?: number;
  date: string;
  description: string;
  merchantName: string | null;
  categoryId: string;
  subcategoryId: string;
  paymentMethodId: string;
  accountId: string;
  source: Transaction['source'];
}): Transaction {
  const currency = args.currency ?? 'ARS';
  const rate = args.exchangeRate ?? 1;
  return {
    id: uid(),
    user_id: args.userId,
    household_id: null,
    type: args.type,
    amount: args.amount,
    currency,
    base_amount: round(args.amount * rate, 2),
    base_currency: 'ARS',
    exchange_rate: rate,
    description: args.description,
    merchant_id: null,
    merchant_name: args.merchantName,
    category_id: args.categoryId,
    subcategory_id: args.subcategoryId,
    payment_method_id: args.paymentMethodId,
    account_id: args.accountId,
    transaction_date: args.date,
    source: args.source,
    ai_confidence: args.source === 'natural_language' ? 0.92 : null,
    created_by: args.userId,
    created_at: new Date().toISOString(),
  };
}
