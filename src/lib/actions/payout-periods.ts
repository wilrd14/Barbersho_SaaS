"use server";

/**
 * F3-05 · Server Actions del ciclo del periodo de pago (D-F3-9):
 * `open -> calculated -> approved -> paid`.
 *
 * Cada accion: Zod (`zUuid`) -> guard DENTRO de la funcion -> UNA sola
 * transaccion (`db.transaction`, `tx` en todo) con `select ... for update` del
 * periodo -> `ActionResult`. La logica vive en `@/lib/payouts/cycle` (aqui solo
 * se orquesta y se traducen errores); asi los tests la ejercitan tambien desde
 * dentro de una transaccion real.
 *
 * Quien puede que (D-F3-9 / matriz §6.2):
 *  - crear, aprobar, marcar pagado, ajustar: SOLO superuser (`requireChainScope`
 *    devuelve 403 a admin y barbero, incluso por llamada directa).
 *  - calcular: superuser o admin (el admin "propone"). El admin no tiene ambito
 *    de cadena, asi que llama con `locationId` de SU sede (`requireLocationScope`
 *    verifica que sea gerente de esa sede); el calculo es siempre de toda la
 *    cadena del guard, nunca de una cadena que venga del cliente.
 *
 * Inmutabilidad (§3.10): `approved`/`paid` rechazan recalculo, ajuste y
 * cualquier cambio de estado hacia atras aqui, en servidor.
 */

import { z } from "zod";

import { assertManagerRole } from "@/lib/actions/money-utils";
import { requireChainScope, requireLocationScope } from "@/lib/auth/guards";
import { assertAreaAllowed } from "@/lib/billing/gate";
import { db } from "@/lib/db/client";
import {
  adjustLineInTx,
  approvePeriodInTx,
  calculatePeriodInTx,
  chainTodayIso,
  createPeriodInTx,
  markPeriodPaidInTx,
  type CalculateData,
} from "@/lib/payouts/cycle";
import { EXCLUSION_VIOLATION, pgErrorInfo } from "@/lib/payouts/pg-errors";
import { zUuid } from "@/lib/validation/id";
import { actionError, type ActionResult } from "@/types/action-result";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener el formato AAAA-MM-DD.");

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos invalidos.";
}

function unexpected(err: unknown, what: string): ActionResult<never> {
  const { code } = pgErrorInfo(err);
  if (code === EXCLUSION_VIOLATION) {
    return actionError("Ya existe un corte que se cruza con esas fechas. Abre ese en vez de crear otro.");
  }
  // No se filtra el error crudo de Postgres al gerente: nada quedo guardado (la transaccion se revirtio).
  console.error(`[payouts] ${what}:`, err);
  return actionError(`${what}. No se guardó ningún cambio; puedes reintentar.`);
}

// ---------------------------------------------------------------------------
// createPayoutPeriodAction
// ---------------------------------------------------------------------------

const createSchema = z.object({ startsOn: isoDate, endsOn: isoDate });

export async function createPayoutPeriodAction(input: unknown): Promise<ActionResult<{ periodId: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssue(parsed.error));

  const scope = await requireChainScope();

  const gate = await assertAreaAllowed(scope.chainId, "analytics", db);
  if (!gate.ok) return actionError(gate.error);

  try {
    return await db.transaction((tx) =>
      createPeriodInTx(tx, {
        chainId: scope.chainId,
        actorUserId: scope.userId,
        startsOn: parsed.data.startsOn,
        endsOn: parsed.data.endsOn,
      }),
    );
  } catch (err) {
    return unexpected(err, "No se pudo crear el corte");
  }
}

// ---------------------------------------------------------------------------
// calculatePayoutPeriodAction — superuser o admin; recalculable mientras no este aprobado
// ---------------------------------------------------------------------------

const calculateSchema = z.object({ periodId: zUuid, locationId: zUuid.optional() });

export async function calculatePayoutPeriodAction(input: unknown): Promise<ActionResult<CalculateData>> {
  const parsed = calculateSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssue(parsed.error));

  let chainId: string;
  let userId: string;
  if (parsed.data.locationId) {
    const scope = await requireLocationScope(parsed.data.locationId);
    try {
      assertManagerRole(scope);
    } catch (err) {
      return actionError(err instanceof Error ? err.message : "No autorizado.");
    }
    chainId = scope.chainId;
    userId = scope.userId;
  } else {
    const scope = await requireChainScope();
    chainId = scope.chainId;
    userId = scope.userId;
  }

  // F3-18: calcular el corte es analitica/administracion; se bloquea con prueba vencida (D-F3-16).
  const gate = await assertAreaAllowed(chainId, "analytics", db);
  if (!gate.ok) return actionError(gate.error);

  try {
    return await db.transaction((tx) => calculatePeriodInTx(tx, { chainId, actorUserId: userId, periodId: parsed.data.periodId }));
  } catch (err) {
    return unexpected(err, "No se pudo calcular el corte");
  }
}

// ---------------------------------------------------------------------------
// approvePayoutPeriodAction — SOLO superuser
// ---------------------------------------------------------------------------

const periodOnlySchema = z.object({ periodId: zUuid });

export async function approvePayoutPeriodAction(
  input: unknown,
): Promise<ActionResult<{ periodId: string; totalNetCents: number; lineCount: number }>> {
  const parsed = periodOnlySchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssue(parsed.error));

  const scope = await requireChainScope();

  const gate = await assertAreaAllowed(scope.chainId, "analytics", db);
  if (!gate.ok) return actionError(gate.error);

  try {
    return await db.transaction(async (tx) => {
      const todayIso = await chainTodayIso(tx, scope.chainId);
      return approvePeriodInTx(tx, {
        chainId: scope.chainId,
        actorUserId: scope.userId,
        periodId: parsed.data.periodId,
        todayIso,
      });
    });
  } catch (err) {
    return unexpected(err, "No se pudo cerrar el corte");
  }
}

// ---------------------------------------------------------------------------
// markPayoutPeriodPaidAction — SOLO superuser, acto explicito y separado de aprobar
// ---------------------------------------------------------------------------

export async function markPayoutPeriodPaidAction(input: unknown): Promise<ActionResult<{ periodId: string }>> {
  const parsed = periodOnlySchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssue(parsed.error));

  const scope = await requireChainScope();

  const gate = await assertAreaAllowed(scope.chainId, "analytics", db);
  if (!gate.ok) return actionError(gate.error);

  try {
    return await db.transaction((tx) =>
      markPeriodPaidInTx(tx, { chainId: scope.chainId, actorUserId: scope.userId, periodId: parsed.data.periodId }),
    );
  } catch (err) {
    return unexpected(err, "No se pudo marcar el corte como pagado");
  }
}

// ---------------------------------------------------------------------------
// adjustPayoutLineAction — P1. SOLO superuser, solo periodo `calculated`, nota obligatoria
// ---------------------------------------------------------------------------

const adjustSchema = z.object({
  periodId: zUuid,
  lineId: zUuid,
  /** El ajuste TOTAL de la linea en centavos (positivo o negativo); 0 lo quita. */
  amountCents: z.number().int().min(-100_000_000).max(100_000_000),
  note: z.string().trim().max(300, "La nota no puede pasar de 300 caracteres."),
});

export async function adjustPayoutLineAction(
  input: unknown,
): Promise<ActionResult<{ lineId: string; adjustmentsCents: number; netPayableCents: number }>> {
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssue(parsed.error));

  const scope = await requireChainScope();

  const gate = await assertAreaAllowed(scope.chainId, "analytics", db);
  if (!gate.ok) return actionError(gate.error);

  try {
    return await db.transaction((tx) =>
      adjustLineInTx(tx, {
        chainId: scope.chainId,
        actorUserId: scope.userId,
        periodId: parsed.data.periodId,
        lineId: parsed.data.lineId,
        amountCents: parsed.data.amountCents,
        note: parsed.data.note,
      }),
    );
  } catch (err) {
    return unexpected(err, "No se pudo guardar el ajuste");
  }
}
