/**
 * Catálogo de planes.
 *
 * Es la fuente de verdad: de acá sale la pantalla de precios, los candados de la
 * interfaz y —vía scripts/generate-plan-seed.mjs— la tabla `plans` de la base.
 * Los límites se aplican del lado del servidor: la interfaz sólo los muestra.
 */

export type PlanCode = 'free' | 'personal' | 'hogar' | 'empresarial';

export interface PlanLimits {
  /** Movimientos que se pueden registrar por mes. `null` = sin límite. */
  transactions_per_month: number | null;
  /** Tickets con foto por mes. 0 = la función no está disponible. */
  receipts_per_month: number;
  /** Consultas a «Preguntale a tus finanzas» por mes. */
  ai_queries_per_month: number;
  /** Integrantes del hogar, incluida la persona dueña. 0 = sin modo hogar. */
  household_members: number;
  budgets: number | null;
  goals: number | null;
  /** Cuántos meses hacia atrás se pueden mirar en reportes. */
  report_history_months: number;
  csv_export: boolean;
  /** Análisis automático de hábitos y detección de recurrentes. */
  ai_insights: boolean;
  multi_currency: boolean;
}

export interface Plan {
  code: PlanCode;
  name: string;
  tagline: string;
  /** Precio mensual en ARS. 0 = gratis. */
  price: number;
  currency: string;
  /** Se destaca en la pantalla de precios. */
  featured?: boolean;
  limits: PlanLimits;
  /** Lo que se muestra en la tarjeta, en orden. */
  highlights: string[];
}

export const PLANS: Plan[] = [
  {
    code: 'free',
    name: 'Gratis',
    tagline: 'Para probar si te cambia la relación con tu plata.',
    price: 0,
    currency: 'ARS',
    limits: {
      transactions_per_month: 30,
      receipts_per_month: 0,
      ai_queries_per_month: 10,
      household_members: 0,
      budgets: 1,
      goals: 1,
      report_history_months: 1,
      csv_export: false,
      ai_insights: false,
      multi_currency: false,
    },
    highlights: [
      '30 movimientos por mes',
      'Registro hablando: «super 45 lucas»',
      'Categorización automática',
      'Dashboard y reportes del mes en curso',
      '1 límite de gasto y 1 meta',
      '10 consultas por mes',
    ],
  },
  {
    code: 'personal',
    name: 'Personal',
    tagline: 'Para llevar tus finanzas en serio, sin pensarlo.',
    price: 5000,
    currency: 'ARS',
    featured: true,
    limits: {
      transactions_per_month: null,
      receipts_per_month: 40,
      ai_queries_per_month: 200,
      household_members: 0,
      budgets: null,
      goals: null,
      report_history_months: 24,
      csv_export: true,
      ai_insights: true,
      multi_currency: true,
    },
    highlights: [
      'Movimientos ilimitados',
      '40 tickets por foto al mes',
      'Reportes con dos años de historia',
      'Análisis de hábitos y gastos recurrentes',
      'Límites y metas sin tope',
      'Pesos, dólares y euros',
      'Exportación a CSV',
    ],
  },
  {
    code: 'hogar',
    name: 'Hogar',
    tagline: 'Para convivientes y parejas que comparten gastos.',
    price: 9000,
    currency: 'ARS',
    limits: {
      transactions_per_month: null,
      receipts_per_month: 100,
      ai_queries_per_month: 500,
      household_members: 6,
      budgets: null,
      goals: null,
      report_history_months: 36,
      csv_export: true,
      ai_insights: true,
      multi_currency: true,
    },
    highlights: [
      'Todo lo del plan Personal',
      'Hasta 6 personas en el hogar',
      'Gastos compartidos y quién pagó qué',
      'Balance y cómo quedar a mano',
      '100 tickets por foto al mes',
      'Tres años de historia en reportes',
    ],
  },
  {
    code: 'empresarial',
    name: 'Equipos',
    tagline: 'Para equipos chicos que rinden gastos en común.',
    price: 20000,
    currency: 'ARS',
    limits: {
      transactions_per_month: null,
      receipts_per_month: 400,
      ai_queries_per_month: 2000,
      household_members: 25,
      budgets: null,
      goals: null,
      report_history_months: 60,
      csv_export: true,
      ai_insights: true,
      multi_currency: true,
    },
    highlights: [
      'Todo lo del plan Hogar',
      'Hasta 25 integrantes',
      '400 tickets por foto al mes',
      'Cinco años de historia',
      'Exportación para contabilidad',
      'Soporte por correo con respuesta en 24 h',
    ],
  },
];

export const DEFAULT_PLAN: PlanCode = 'free';

export function getPlan(code: PlanCode | string | null | undefined): Plan {
  return PLANS.find((plan) => plan.code === code) ?? PLANS[0];
}

/** Etiqueta amable para un límite: «40 por mes» / «Sin límite» / «No incluido». */
export function describeLimit(value: number | null, unit = 'por mes'): string {
  if (value === null) return 'Sin límite';
  if (value === 0) return 'No incluido';
  return `${value} ${unit}`;
}
