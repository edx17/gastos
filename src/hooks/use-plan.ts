import { useMemo } from 'react';
import { PLANS, type PlanLimits } from '@/constants/plans';
import { cheapestPlanWith, earliestReportDate, effectivePlan, includes, quotaFor } from '@/services/billing/quota';
import { useWorkspace } from '@/providers/workspace-provider';
import type { QuotaState } from '@/types/plan';

/**
 * Todo lo que la interfaz necesita saber del plan: qué incluye, cuánto queda y
 * cuál es el plan más barato que resuelve lo que la persona quiere hacer.
 *
 * Esto es para mostrar, no para proteger: los límites de verdad los aplica la base.
 */
export function usePlan() {
  const { subscription, usage } = useWorkspace();

  return useMemo(() => {
    const plan = effectivePlan(subscription);

    return {
      plan,
      usage,
      subscription,
      isFree: plan.price === 0,
      /** ¿El plan incluye esta función? */
      can: (feature: keyof PlanLimits) => includes(plan, feature),
      /** Estado del cupo de una función. */
      quota: (feature: keyof PlanLimits): QuotaState => quotaFor(plan, usage, feature),
      /** ¿Se puede usar ahora mismo? (incluida y con cupo disponible) */
      available: (feature: keyof PlanLimits) => includes(plan, feature) && !quotaFor(plan, usage, feature).exhausted,
      /** Plan más barato que la incluye, para sugerirlo sin exagerar. */
      upgradeFor: (feature: keyof PlanLimits) => cheapestPlanWith(feature, PLANS),
      /** Fecha más antigua que el plan permite consultar en reportes. */
      earliestReportDate: () => earliestReportDate(plan),
    };
  }, [subscription, usage]);
}
