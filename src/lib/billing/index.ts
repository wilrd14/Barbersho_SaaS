/**
 * F3-17 · src/lib/billing — estado efectivo de suscripcion y cupo de sedes, PURO.
 *
 * Sin `db`, `next/*`, `Date` ni reloj: el llamador pasa `nowMs` (epoch ms) y las
 * fechas de la suscripcion ya convertidas a epoch ms. Dinero en centavos enteros.
 * D-F3-16 (gracia de 7 dias, restringido/bloqueado, excepciones duras) y
 * D-F3-17 (aritmetica de §7.2 del PRD).
 */

export type SubscriptionPlan = "local" | "chain" | "franchise";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled";
export type EffectiveAccess = "acceso_normal" | "restringido" | "bloqueado";

/** Areas de la app. */
export type AccessArea = "analytics" | "operation" | "billing" | "auth";

/** Acciones que NUNCA se bloquean (D-F3-16): cortarlas a media tarde no recupera un peso. */
export type AlwaysAllowedAction = "close_open_cash_session" | "charge_open_sale";

export const TRIAL_DAYS = 21;
export const GRACE_DAYS = 7;
const DAY_MS = 86_400_000;

export interface SubscriptionSnapshot {
  status: SubscriptionStatus;
  /** `trial_ends_at` en epoch ms; null si no hay. */
  trialEndsAtMs: number | null;
  /** `current_period_end` en epoch ms; referencia de vencimiento para `past_due`. */
  currentPeriodEndMs: number | null;
}

export interface EffectiveSubscription {
  access: EffectiveAccess;
  /** Dias de prueba que quedan (hacia arriba); solo con `trialing` vigente. */
  trialDaysLeft: number | null;
  /** Dias de gracia que quedan (hacia arriba); solo en `restringido` con fecha de vencimiento. */
  graceDaysLeft: number | null;
}

/**
 * Estado efectivo derivado (la app nunca lee `status` crudo).
 * - active -> normal; cancelled -> bloqueado.
 * - trialing vigente -> normal. Vencida (o past_due) -> restringido hasta
 *   `GRACE_DAYS` despues del vencimiento (inclusive), luego bloqueado.
 * - Sin fecha de referencia (trialing sin trial_ends_at, past_due sin
 *   current_period_end) -> restringido: se conserva la operacion y se bloquea
 *   lo analitico, sin inventar una fecha.
 */
export function effectiveSubscription(sub: SubscriptionSnapshot, nowMs: number): EffectiveSubscription {
  if (sub.status === "active") return { access: "acceso_normal", trialDaysLeft: null, graceDaysLeft: null };
  if (sub.status === "cancelled") return { access: "bloqueado", trialDaysLeft: null, graceDaysLeft: null };

  const expiresAtMs = sub.status === "trialing" ? sub.trialEndsAtMs : sub.currentPeriodEndMs;

  if (sub.status === "trialing" && expiresAtMs !== null && nowMs < expiresAtMs) {
    return { access: "acceso_normal", trialDaysLeft: Math.ceil((expiresAtMs - nowMs) / DAY_MS), graceDaysLeft: null };
  }
  if (expiresAtMs === null) return { access: "restringido", trialDaysLeft: null, graceDaysLeft: null };

  const graceEndsMs = expiresAtMs + GRACE_DAYS * DAY_MS;
  if (nowMs > graceEndsMs) return { access: "bloqueado", trialDaysLeft: null, graceDaysLeft: null };
  return {
    access: "restringido",
    trialDaysLeft: null,
    graceDaysLeft: Math.ceil((graceEndsMs - nowMs) / DAY_MS),
  };
}

/**
 * Matriz de acceso por area (D-F3-16). `action` expresa las excepciones duras:
 * cerrar una caja abierta y cobrar una venta en curso se permiten siempre,
 * incluso con `bloqueado`.
 */
export function isAllowed(input: {
  access: EffectiveAccess;
  area: AccessArea;
  action?: AlwaysAllowedAction;
}): boolean {
  if (input.action === "close_open_cash_session" || input.action === "charge_open_sale") return true;
  if (input.area === "billing" || input.area === "auth") return true;
  if (input.access === "acceso_normal") return true;
  if (input.access === "restringido") return input.area === "operation";
  return false;
}

// ---------------------------------------------------------------------------
// Cupo de sedes (D-F3-17, PRD §7.2)
// ---------------------------------------------------------------------------

interface PlanQuota {
  included: number;
  /** null = ilimitadas. */
  maxExtra: number | null;
  extraPriceCents: number;
  label: string;
  upsell: string;
}

export const PLAN_QUOTAS: Record<SubscriptionPlan, PlanQuota> = {
  local: { included: 1, maxExtra: 2, extraPriceCents: 350_000, label: "Local", upsell: "Cadena" },
  chain: { included: 3, maxExtra: null, extraPriceCents: 250_000, label: "Cadena", upsell: "Franquicia" },
  franchise: { included: 10, maxExtra: null, extraPriceCents: 150_000, label: "Franquicia", upsell: "Franquicia" },
};

export type LocationQuotaResult =
  | { ok: true; extraLocations: number; extraMonthlyCents: number }
  | { ok: false; error: string };

/** `locationsAfter` = sedes activas incluyendo la que se quiere crear. */
export function assertLocationQuota(plan: SubscriptionPlan, locationsAfter: number): LocationQuotaResult {
  const q = PLAN_QUOTAS[plan];
  const extra = Math.max(0, locationsAfter - q.included);
  if (q.maxExtra !== null && extra > q.maxExtra) {
    return {
      ok: false,
      error: `El plan ${q.label} permite hasta ${q.included + q.maxExtra} sedes. Para abrir la sede ${locationsAfter}, pasa al plan ${q.upsell}.`,
    };
  }
  return { ok: true, extraLocations: extra, extraMonthlyCents: extra * q.extraPriceCents };
}
