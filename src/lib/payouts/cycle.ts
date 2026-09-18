import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { centsFromDecimalString, decimalStringFromCents } from "@/lib/actions/money-utils";
import { writeAuditLog } from "@/lib/auth/audit";
import {
  computePayoutLines,
  netPayableCents,
  verifyPayoutInvariant,
  type PayoutInvariantFigure,
  type PayoutLine,
  type PayoutProblem,
} from "@/lib/commissions";
import { loadPayoutInputs } from "@/lib/commissions/load-payout-inputs";
import type { db } from "@/lib/db/client";
import { chains, payoutLines, payoutPeriods } from "@/lib/db/schema";
import { actionError, actionOk, type ActionResult } from "@/types/action-result";

import {
  blockersFromProblems,
  loadSqlBlockers,
  type ApprovalBlocker,
} from "./blockers";
import {
  formatDateEs,
  formatQuincenaLabel,
  isCalendarQuincena,
  isPeriodFrozen,
  todayIsoInTimezone,
} from "./period";

/**
 * F3-05 · Nucleo transaccional del ciclo del periodo de pago
 * (`open -> calculated -> approved -> paid`, D-F3-9). Las Server Actions de
 * `src/lib/actions/payout-periods.ts` son envolturas finas (Zod -> guard ->
 * `db.transaction` -> esto); la logica vive aqui para poder ejercitarla en
 * tests desde dentro de una transaccion real y con una segunda conexion
 * (concurrencia).
 *
 * REGLAS DURAS que se cumplen aqui:
 *  - §3.2: TODA funcion recibe el ejecutor (`tx`) y lo usa para TODO, incluidos
 *    `loadPayoutInputs`, `loadSqlBlockers` y `writeAuditLog`. El pool es max:1:
 *    un solo helper con el `db` singleton dentro de la transaccion la cuelga.
 *  - §3.5: el calculo es UNA transaccion e idempotente (delete + insert de las
 *    lineas al final, solo si todo cuadro; un fallo no deja lineas a medias).
 *  - §3.6: `select ... for update` sobre la fila del periodo antes de calcular,
 *    aprobar, marcar pagado o ajustar.
 *  - §3.7: el invariante de cuadre se verifica en runtime; si no cuadra, no se
 *    guarda nada, se audita `payout.calculate_failed` con las cifras y el
 *    periodo NO cambia de estado.
 *  - §3.10: un periodo `approved`/`paid` es inmutable por cualquier camino.
 *  - Consultas SECUENCIALES (sin `Promise.all`; ver CHANGELOG del Bloque A).
 */
export type PayoutTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type PayoutSelectExecutor = Pick<typeof db, "select">;

type PeriodRow = typeof payoutPeriods.$inferSelect;
export type PeriodStatus = PeriodRow["status"];

/** Una linea tal como se guarda (centavos enteros). */
export interface PeriodLine {
  barberId: string;
  locationId: string;
  servicesCount: number;
  servicesRevenueCents: number;
  productRevenueCents: number;
  commissionCents: number;
  boothRentDeductedCents: number;
  tipsCents: number;
  adjustmentsCents: number;
  netPayableCents: number;
  notes: string | null;
}

export interface StoredLine extends PeriodLine {
  id: string;
}

const IMMUTABLE_MESSAGE =
  "Este corte ya está aprobado y no se puede modificar. Las correcciones se registran como ajustes en la quincena siguiente.";

function keyOf(line: { barberId: string; locationId: string }): string {
  return `${line.barberId}|${line.locationId}`;
}

// ---------------------------------------------------------------------------
// Lectura y bloqueo
// ---------------------------------------------------------------------------

/** `select ... for update` del periodo (regla dura §3.6). Filtra por cadena: un id de otra cadena es "no existe". */
export async function lockPeriod(tx: PayoutTx, chainId: string, periodId: string): Promise<PeriodRow | null> {
  const [row] = await tx
    .select()
    .from(payoutPeriods)
    .where(and(eq(payoutPeriods.id, periodId), eq(payoutPeriods.chainId, chainId)))
    .for("update")
    .limit(1);
  return row ?? null;
}

/** Lineas guardadas del periodo; con `locationId`, solo las de esa sede (la vista del admin no carga cifras de otras). */
export async function loadStoredLines(
  executor: PayoutSelectExecutor,
  periodId: string,
  locationId?: string,
): Promise<StoredLine[]> {
  const rows = await executor
    .select()
    .from(payoutLines)
    .where(
      locationId
        ? and(eq(payoutLines.payoutPeriodId, periodId), eq(payoutLines.locationId, locationId))
        : eq(payoutLines.payoutPeriodId, periodId),
    )
    .orderBy(asc(payoutLines.locationId), asc(payoutLines.barberId));
  return rows.map((r) => ({
    id: r.id,
    barberId: r.barberId,
    locationId: r.locationId,
    servicesCount: r.servicesCount,
    servicesRevenueCents: centsFromDecimalString(r.servicesRevenue),
    productRevenueCents: centsFromDecimalString(r.productRevenue),
    commissionCents: centsFromDecimalString(r.commissionAmount),
    boothRentDeductedCents: centsFromDecimalString(r.boothRentDeducted),
    tipsCents: centsFromDecimalString(r.tipsAmount),
    adjustmentsCents: centsFromDecimalString(r.adjustments),
    netPayableCents: centsFromDecimalString(r.netPayable),
    notes: r.notes,
  }));
}

/** Hoy (YYYY-MM-DD) en la zona horaria de la CADENA (D-F3-9: "ends_on todavia no paso en la tz de la cadena"). */
export async function chainTodayIso(executor: PayoutSelectExecutor, chainId: string, now: Date = new Date()): Promise<string> {
  const [chain] = await executor.select({ timezone: chains.timezone }).from(chains).where(eq(chains.id, chainId)).limit(1);
  return todayIsoInTimezone(now, chain?.timezone ?? "America/Santo_Domingo");
}

export function summarizeLines(lines: PeriodLine[]) {
  return {
    lineCount: lines.length,
    barberCount: new Set(lines.map((l) => l.barberId)).size,
    locationCount: new Set(lines.map((l) => l.locationId)).size,
    totalServicesRevenueCents: lines.reduce((s, l) => s + l.servicesRevenueCents, 0),
    totalCommissionCents: lines.reduce((s, l) => s + l.commissionCents, 0),
    totalBoothRentCents: lines.reduce((s, l) => s + l.boothRentDeductedCents, 0),
    totalTipsCents: lines.reduce((s, l) => s + l.tipsCents, 0),
    totalAdjustmentsCents: lines.reduce((s, l) => s + l.adjustmentsCents, 0),
    totalNetCents: lines.reduce((s, l) => s + l.netPayableCents, 0),
  };
}

// ---------------------------------------------------------------------------
// Calculo en frio: lineas frescas del periodo (sin escribir nada)
// ---------------------------------------------------------------------------

export type FreshLinesResult =
  | { ok: true; lines: PeriodLine[] }
  | { ok: false; kind: "problems"; error: string; problems: PayoutProblem[] }
  | { ok: false; kind: "invariant"; error: string; figures: PayoutInvariantFigure[] };

/**
 * Carga, calcula, verifica el invariante y reaplica los ajustes manuales ya
 * guardados (decision del Bloque A: recalcular borra las lineas, asi que los
 * ajustes se releen y se reaplican; un ajuste sobre un par que ya no tiene
 * actividad se conserva como una linea en ceros para no perderlo).
 */
export async function buildFreshLines(
  executor: PayoutSelectExecutor,
  params: { chainId: string; startsOn: string; endsOn: string; stored: StoredLine[] },
): Promise<FreshLinesResult> {
  const inputs = await loadPayoutInputs(
    { chainId: params.chainId, startsOn: params.startsOn, endsOn: params.endsOn },
    executor,
  );

  const computed = computePayoutLines(inputs);
  if (!computed.ok) {
    return { ok: false, kind: "problems", error: computed.error, problems: computed.problems };
  }

  const invariant = verifyPayoutInvariant({
    lines: computed.lines,
    sales: inputs.sales,
    periodStartsOn: inputs.periodStartsOn,
    periodEndsOn: inputs.periodEndsOn,
    locations: inputs.locations,
  });
  if (!invariant.ok) {
    return { ok: false, kind: "invariant", error: invariant.error, figures: invariant.figures };
  }

  const storedByKey = new Map(params.stored.map((l) => [keyOf(l), l]));
  const merged: PeriodLine[] = computed.lines.map((line: PayoutLine) => {
    const previous = storedByKey.get(keyOf(line));
    const adjustmentsCents = previous?.adjustmentsCents ?? 0;
    return {
      barberId: line.barberId,
      locationId: line.locationId,
      servicesCount: line.servicesCount,
      servicesRevenueCents: line.servicesRevenueCents,
      productRevenueCents: line.productRevenueCents,
      commissionCents: line.commissionCents,
      boothRentDeductedCents: line.boothRentDeductedCents,
      tipsCents: line.tipsCents,
      adjustmentsCents,
      netPayableCents: netPayableCents({
        commissionCents: line.commissionCents,
        tipsCents: line.tipsCents,
        adjustmentsCents,
        boothRentDeductedCents: line.boothRentDeductedCents,
      }),
      notes: previous && adjustmentsCents !== 0 ? previous.notes : null,
    };
  });

  const computedKeys = new Set(computed.lines.map(keyOf));
  for (const previous of params.stored) {
    if (previous.adjustmentsCents !== 0 && !computedKeys.has(keyOf(previous))) {
      merged.push({
        barberId: previous.barberId,
        locationId: previous.locationId,
        servicesCount: 0,
        servicesRevenueCents: 0,
        productRevenueCents: 0,
        commissionCents: 0,
        boothRentDeductedCents: 0,
        tipsCents: 0,
        adjustmentsCents: previous.adjustmentsCents,
        netPayableCents: previous.adjustmentsCents,
        notes: previous.notes,
      });
    }
  }

  merged.sort((a, b) =>
    a.locationId === b.locationId ? (a.barberId < b.barberId ? -1 : 1) : a.locationId < b.locationId ? -1 : 1,
  );
  return { ok: true, lines: merged };
}

/** Cuantas lineas difieren entre lo guardado y lo recien calculado (cualquier columna, o linea de mas/de menos). */
export function countDifferingLines(stored: PeriodLine[], fresh: PeriodLine[]): number {
  const storedByKey = new Map(stored.map((l) => [keyOf(l), l]));
  const freshByKey = new Map(fresh.map((l) => [keyOf(l), l]));
  let differing = 0;
  for (const [key, f] of freshByKey) {
    const s = storedByKey.get(key);
    if (
      !s ||
      s.servicesCount !== f.servicesCount ||
      s.servicesRevenueCents !== f.servicesRevenueCents ||
      s.productRevenueCents !== f.productRevenueCents ||
      s.commissionCents !== f.commissionCents ||
      s.boothRentDeductedCents !== f.boothRentDeductedCents ||
      s.tipsCents !== f.tipsCents ||
      s.adjustmentsCents !== f.adjustmentsCents ||
      s.netPayableCents !== f.netPayableCents
    ) {
      differing += 1;
    }
  }
  for (const key of storedByKey.keys()) if (!freshByKey.has(key)) differing += 1;
  return differing;
}

// ---------------------------------------------------------------------------
// Preparacion para aprobar (tambien la usa la pantalla del Corte)
// ---------------------------------------------------------------------------

export interface PeriodReadiness {
  /** Los 4 bloqueadores de D-F3-10, en ese orden, solo los que aplican. */
  blockers: ApprovalBlocker[];
  /** `ends_on` todavia no paso en la tz de la cadena (no se aprueba una quincena que esta corriendo). */
  notEnded: { endsOn: string; today: string } | null;
  /** Lo guardado ya no coincide con lo que se calcularia hoy (solo periodos `calculated`). */
  stale: { differingLines: number } | null;
  /** El calculo no pudo completarse por algo que no es una regla (venta corrupta, invariante). */
  computeError: string | null;
  /** Solo si el calculo fue posible: las lineas frescas (para "vista previa" en un periodo `open`). */
  freshLines: PeriodLine[] | null;
}

export async function evaluatePeriodReadiness(
  executor: PayoutSelectExecutor,
  period: Pick<PeriodRow, "id" | "chainId" | "startsOn" | "endsOn" | "status">,
  todayIso: string,
): Promise<PeriodReadiness> {
  const params = { chainId: period.chainId, startsOn: period.startsOn, endsOn: period.endsOn };
  const sqlBlockers = await loadSqlBlockers(params, executor);
  const stored = await loadStoredLines(executor, period.id);
  const fresh = await buildFreshLines(executor, { ...params, stored });

  const ruleBlockers = fresh.ok ? [] : fresh.kind === "problems" ? blockersFromProblems(fresh.problems) : [];
  let computeError: string | null = null;
  if (!fresh.ok) {
    if (fresh.kind === "invariant") computeError = fresh.error;
    else {
      const nonRule = fresh.problems.filter(
        (p) => !["no_rule", "invalid_rule", "unsupported_rule_type", "unsupported_tip_handling"].includes(p.code),
      );
      if (nonRule.length > 0) computeError = nonRule.map((p) => p.message).join(" ");
    }
  }

  const stale =
    fresh.ok && period.status === "calculated"
      ? (() => {
          const differing = countDifferingLines(stored, fresh.lines);
          return differing > 0 ? { differingLines: differing } : null;
        })()
      : null;

  return {
    blockers: [...sqlBlockers, ...ruleBlockers],
    notEnded: period.endsOn >= todayIso ? { endsOn: period.endsOn, today: todayIso } : null,
    stale,
    computeError,
    freshLines: fresh.ok ? fresh.lines : null,
  };
}

/** Texto unico (para el mensaje de error de la accion) con TODOS los motivos por los que no se puede cerrar. */
export function describeReadinessReasons(readiness: PeriodReadiness): string[] {
  const reasons: string[] = [];
  if (readiness.notEnded) {
    reasons.push(
      `la quincena termina el ${formatDateEs(readiness.notEnded.endsOn)} y todavía está corriendo (hoy es ${formatDateEs(readiness.notEnded.today)}); podrás cerrarla desde el día siguiente`,
    );
  }
  for (const b of readiness.blockers) {
    const named = b.items.slice(0, 3).map((i) => i.label);
    const more = b.count > named.length ? ` y ${b.count - named.length} más` : "";
    reasons.push(`${b.title}: ${b.summary} (${named.join("; ")}${more})`);
  }
  if (readiness.computeError) reasons.push(`el cálculo no cuadra: ${readiness.computeError}`);
  if (readiness.stale) {
    reasons.push(
      `las ventas o las reglas cambiaron desde el último cálculo (${readiness.stale.differingLines} ${readiness.stale.differingLines === 1 ? "línea distinta" : "líneas distintas"}); recalcula el corte antes de cerrarlo`,
    );
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Crear
// ---------------------------------------------------------------------------

export async function createPeriodInTx(
  tx: PayoutTx,
  params: { chainId: string; actorUserId: string; startsOn: string; endsOn: string },
): Promise<ActionResult<{ periodId: string }>> {
  if (!isCalendarQuincena(params.startsOn, params.endsOn)) {
    return actionError("El corte es por quincena calendario: del 1 al 15 o del 16 al fin de mes.");
  }

  const [overlap] = await tx
    .select({ id: payoutPeriods.id, startsOn: payoutPeriods.startsOn, endsOn: payoutPeriods.endsOn })
    .from(payoutPeriods)
    .where(
      and(
        eq(payoutPeriods.chainId, params.chainId),
        sql`${payoutPeriods.startsOn} <= ${params.endsOn}::date`,
        sql`${payoutPeriods.endsOn} >= ${params.startsOn}::date`,
      ),
    )
    .limit(1);
  if (overlap) {
    return actionError(
      `Ya existe un corte que se cruza con esas fechas: ${formatQuincenaLabel(overlap.startsOn, overlap.endsOn)}. Abre ese en vez de crear otro.`,
    );
  }

  const [created] = await tx
    .insert(payoutPeriods)
    .values({ chainId: params.chainId, startsOn: params.startsOn, endsOn: params.endsOn, status: "open" })
    .returning();

  await writeAuditLog(
    {
      chainId: params.chainId,
      actorUserId: params.actorUserId,
      action: "payout.create",
      entity: "payout_periods",
      entityId: created!.id,
      before: null,
      after: { status: "open", startsOn: params.startsOn, endsOn: params.endsOn },
    },
    tx,
  );
  return actionOk({ periodId: created!.id });
}

// ---------------------------------------------------------------------------
// Calcular (y recalcular)
// ---------------------------------------------------------------------------

export interface CalculateData {
  periodId: string;
  recalculated: boolean;
  lineCount: number;
  totalNetCents: number;
}

export async function calculatePeriodInTx(
  tx: PayoutTx,
  params: { chainId: string; actorUserId: string; periodId: string },
): Promise<ActionResult<CalculateData>> {
  const period = await lockPeriod(tx, params.chainId, params.periodId);
  if (!period) return actionError("Ese corte no existe en tu cadena.");
  if (isPeriodFrozen(period.status)) return actionError(IMMUTABLE_MESSAGE);

  const stored = await loadStoredLines(tx, period.id);
  const fresh = await buildFreshLines(tx, {
    chainId: period.chainId,
    startsOn: period.startsOn,
    endsOn: period.endsOn,
    stored,
  });

  if (!fresh.ok) {
    // No se guarda NADA (ni lineas ni estado): solo el rastro del fallo (D-F3-11).
    await writeAuditLog(
      {
        chainId: params.chainId,
        actorUserId: params.actorUserId,
        action: "payout.calculate_failed",
        entity: "payout_periods",
        entityId: period.id,
        before: { status: period.status },
        after:
          fresh.kind === "invariant"
            ? { reason: "invariant", error: fresh.error, figures: fresh.figures }
            : { reason: "problems", error: fresh.error, problems: fresh.problems },
      },
      tx,
    );
    return actionError(
      fresh.kind === "invariant"
        ? `${fresh.error} No se guardó nada; avisa a soporte.`
        : `No se pudo calcular el corte. ${fresh.error}`,
    );
  }

  await tx.delete(payoutLines).where(eq(payoutLines.payoutPeriodId, period.id));
  if (fresh.lines.length > 0) {
    await tx.insert(payoutLines).values(
      fresh.lines.map((l) => ({
        payoutPeriodId: period.id,
        barberId: l.barberId,
        locationId: l.locationId,
        servicesCount: l.servicesCount,
        servicesRevenue: decimalStringFromCents(l.servicesRevenueCents),
        productRevenue: decimalStringFromCents(l.productRevenueCents),
        commissionAmount: decimalStringFromCents(l.commissionCents),
        boothRentDeducted: decimalStringFromCents(l.boothRentDeductedCents),
        tipsAmount: decimalStringFromCents(l.tipsCents),
        adjustments: decimalStringFromCents(l.adjustmentsCents),
        netPayable: decimalStringFromCents(l.netPayableCents),
        notes: l.notes,
      })),
    );
  }
  await tx
    .update(payoutPeriods)
    .set({ status: "calculated", calculatedAt: new Date() })
    .where(eq(payoutPeriods.id, period.id));

  const before = summarizeLines(stored);
  const after = summarizeLines(fresh.lines);
  await writeAuditLog(
    {
      chainId: params.chainId,
      actorUserId: params.actorUserId,
      action: "payout.calculate",
      entity: "payout_periods",
      entityId: period.id,
      before: { status: period.status, calculatedAt: period.calculatedAt?.toISOString() ?? null, ...before },
      after: { status: "calculated", recalculation: period.status === "calculated", ...after },
    },
    tx,
  );

  return actionOk({
    periodId: period.id,
    recalculated: period.status === "calculated",
    lineCount: after.lineCount,
    totalNetCents: after.totalNetCents,
  });
}

// ---------------------------------------------------------------------------
// Aprobar
// ---------------------------------------------------------------------------

export async function approvePeriodInTx(
  tx: PayoutTx,
  params: { chainId: string; actorUserId: string; periodId: string; todayIso: string },
): Promise<ActionResult<{ periodId: string; totalNetCents: number; lineCount: number }>> {
  const period = await lockPeriod(tx, params.chainId, params.periodId);
  if (!period) return actionError("Ese corte no existe en tu cadena.");
  if (isPeriodFrozen(period.status)) {
    return actionError(
      period.status === "paid"
        ? "Este corte ya está pagado. Un corte cerrado no se puede volver a aprobar."
        : "Este corte ya está aprobado.",
    );
  }
  if (period.status === "open") {
    return actionError("Este corte todavía no se calculó. Calcúlalo antes de cerrarlo.");
  }

  const readiness = await evaluatePeriodReadiness(tx, period, params.todayIso);
  const reasons = describeReadinessReasons(readiness);
  if (reasons.length > 0) {
    return actionError(`No se puede cerrar el corte. ${reasons.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(". ")}.`);
  }

  const stored = await loadStoredLines(tx, period.id);
  const totals = summarizeLines(stored);
  await tx
    .update(payoutPeriods)
    .set({ status: "approved", approvedBy: params.actorUserId })
    .where(eq(payoutPeriods.id, period.id));

  await writeAuditLog(
    {
      chainId: params.chainId,
      actorUserId: params.actorUserId,
      action: "payout.approve",
      entity: "payout_periods",
      entityId: period.id,
      before: { status: "calculated", approvedBy: null },
      after: { status: "approved", approvedBy: params.actorUserId, ...totals },
    },
    tx,
  );
  return actionOk({ periodId: period.id, totalNetCents: totals.totalNetCents, lineCount: totals.lineCount });
}

// ---------------------------------------------------------------------------
// Marcar pagado (Kortex no mueve dinero: solo registra que el pago ya ocurrio)
// ---------------------------------------------------------------------------

export async function markPeriodPaidInTx(
  tx: PayoutTx,
  params: { chainId: string; actorUserId: string; periodId: string },
): Promise<ActionResult<{ periodId: string }>> {
  const period = await lockPeriod(tx, params.chainId, params.periodId);
  if (!period) return actionError("Ese corte no existe en tu cadena.");
  if (period.status === "paid") return actionError("Este corte ya está marcado como pagado.");
  if (period.status !== "approved") {
    return actionError("Solo se marca como pagado un corte aprobado. Aprueba el corte primero.");
  }

  await tx.update(payoutPeriods).set({ status: "paid" }).where(eq(payoutPeriods.id, period.id));

  // Sin columna paid_at/paid_by (D-F3-9): el sello queda en audit_log.
  await writeAuditLog(
    {
      chainId: params.chainId,
      actorUserId: params.actorUserId,
      action: "payout.mark_paid",
      entity: "payout_periods",
      entityId: period.id,
      before: { status: "approved" },
      after: { status: "paid" },
    },
    tx,
  );
  return actionOk({ periodId: period.id });
}

// ---------------------------------------------------------------------------
// Ajuste manual de una linea (P1)
// ---------------------------------------------------------------------------

export async function adjustLineInTx(
  tx: PayoutTx,
  params: {
    chainId: string;
    actorUserId: string;
    periodId: string;
    lineId: string;
    amountCents: number;
    note: string;
  },
): Promise<ActionResult<{ lineId: string; adjustmentsCents: number; netPayableCents: number }>> {
  const period = await lockPeriod(tx, params.chainId, params.periodId);
  if (!period) return actionError("Ese corte no existe en tu cadena.");
  if (isPeriodFrozen(period.status)) return actionError(IMMUTABLE_MESSAGE);
  if (period.status !== "calculated") {
    return actionError("Solo se ajusta un corte ya calculado. Calcula el corte primero.");
  }

  const stored = await loadStoredLines(tx, period.id);
  const line = stored.find((l) => l.id === params.lineId);
  if (!line) return actionError("Esa línea no pertenece a este corte.");

  const note = params.note.trim();
  if (params.amountCents !== 0 && note.length < 3) {
    return actionError("Un ajuste exige una nota que explique por qué. Escribe el motivo.");
  }

  const nextNet = netPayableCents({
    commissionCents: line.commissionCents,
    tipsCents: line.tipsCents,
    adjustmentsCents: params.amountCents,
    boothRentDeductedCents: line.boothRentDeductedCents,
  });
  await tx
    .update(payoutLines)
    .set({
      adjustments: decimalStringFromCents(params.amountCents),
      netPayable: decimalStringFromCents(nextNet),
      notes: params.amountCents === 0 ? null : note,
    })
    .where(and(eq(payoutLines.id, line.id), eq(payoutLines.payoutPeriodId, period.id)));

  await writeAuditLog(
    {
      chainId: params.chainId,
      actorUserId: params.actorUserId,
      action: "payout.adjust",
      entity: "payout_lines",
      entityId: line.id,
      before: {
        periodId: period.id,
        barberId: line.barberId,
        locationId: line.locationId,
        adjustmentsCents: line.adjustmentsCents,
        netPayableCents: line.netPayableCents,
        notes: line.notes,
      },
      after: {
        periodId: period.id,
        barberId: line.barberId,
        locationId: line.locationId,
        adjustmentsCents: params.amountCents,
        netPayableCents: nextNet,
        notes: params.amountCents === 0 ? null : note,
      },
    },
    tx,
  );
  return actionOk({ lineId: line.id, adjustmentsCents: params.amountCents, netPayableCents: nextNet });
}

/** Etiqueta corta del corte para mensajes ("Quincena 1–15 sep 2026"). */
export function periodLabel(period: Pick<PeriodRow, "startsOn" | "endsOn">): string {
  return formatQuincenaLabel(period.startsOn, period.endsOn);
}

