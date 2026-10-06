import "server-only";

/**
 * F3-18 · Gate de suscripcion en el SERVIDOR (D-F3-16).
 *
 * `chainId` siempre sale del guard de ambito (sesion), nunca del cliente. El
 * ejecutor Drizzle es explicito y sin valor por defecto (regla dura §3.2): `db`
 * fuera de transacciones, `tx` dentro. Una sola consulta, sin `Promise.all`.
 * La reserva publica anonima NO pasa por aqui: nunca se bloquea.
 */
import { eq } from "drizzle-orm";
import type { db } from "@/lib/db/client";
import { subscriptions } from "@/lib/db/schema";
import {
  effectiveSubscription,
  isAllowed,
  type AccessArea,
  type AlwaysAllowedAction,
  type EffectiveSubscription,
  type SubscriptionStatus,
} from "./index";
import { deniedMessage } from "./messages";

export type GateExecutor = Pick<typeof db, "select">;

export interface ChainAccess extends EffectiveSubscription {
  status: SubscriptionStatus | null;
}

/** Estado efectivo de la cadena. Sin fila de suscripcion no se bloquea (la pantalla Tu plan lo senala). */
export async function loadChainAccess(
  chainId: string,
  executor: GateExecutor,
  nowMs: number = Date.now(),
): Promise<ChainAccess> {
  const [sub] = await executor
    .select({
      status: subscriptions.status,
      trialEndsAt: subscriptions.trialEndsAt,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(eq(subscriptions.chainId, chainId))
    .limit(1);

  if (!sub) return { access: "acceso_normal", trialDaysLeft: null, graceDaysLeft: null, status: null };

  const effective = effectiveSubscription(
    {
      status: sub.status,
      trialEndsAtMs: sub.trialEndsAt ? sub.trialEndsAt.getTime() : null,
      currentPeriodEndMs: sub.currentPeriodEnd ? sub.currentPeriodEnd.getTime() : null,
    },
    nowMs,
  );
  return { ...effective, status: sub.status };
}

export type GateResult = { ok: true; access: ChainAccess } | { ok: false; error: string; access: ChainAccess };

/** Para Server Actions: devuelve `{ ok:false, error }` legible en espanol si el area no esta permitida. */
export async function assertAreaAllowed(
  chainId: string,
  area: AccessArea,
  executor: GateExecutor,
  action?: AlwaysAllowedAction,
  nowMs?: number,
): Promise<GateResult> {
  const access = await loadChainAccess(chainId, executor, nowMs);
  if (isAllowed({ access: access.access, area, action })) return { ok: true, access };
  return { ok: false, error: deniedMessage(access.access, area), access };
}

/** Variante que lanza (dentro de transacciones cuyo catch ya traduce `Error.message` a `actionError`). */
export async function enforceAreaAllowed(
  chainId: string,
  area: AccessArea,
  executor: GateExecutor,
  action?: AlwaysAllowedAction,
  nowMs?: number,
): Promise<void> {
  const result = await assertAreaAllowed(chainId, area, executor, action, nowMs);
  if (!result.ok) throw new Error(result.error);
}
