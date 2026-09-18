import "server-only";

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { forbidden } from "next/navigation";

import { requireBarberScope } from "@/lib/auth/guards";
import { computePayoutLines } from "@/lib/commissions";
import { loadPayoutInputs } from "@/lib/commissions/load-payout-inputs";
import { db } from "@/lib/db/client";
import { payoutLines, payoutPeriods, users } from "@/lib/db/schema";
import { chainTodayIso, loadStoredLines } from "@/lib/payouts/cycle";
import { formatQuincenaLabel, quincenaContaining, type PeriodStatusValue } from "@/lib/payouts/period";
import { toLineViews, type PayoutLineView } from "@/lib/payouts/queries-periods";

/**
 * F3-07 · Lecturas de "Lo mio" y del Recibo para el BARBERO autenticado
 * (`requireBarberScope` dentro de cada funcion). D-F3-18: un barbero ve SOLO
 * su propia linea; el barbero sale de la sesion, nunca de un parametro, asi que
 * no hay forma de pedir el recibo de otro (por URL solo viaja el id del corte y
 * si el barbero no tiene lineas en el, 403).
 *
 * Consultas SECUENCIALES (sin `Promise.all`).
 */
export interface MyQuincena {
  barberName: string;
  label: string;
  startsOn: string;
  endsOn: string;
  /** `en-curso` = el corte todavia no se calculo: las cifras se calculan al vuelo con lo cobrado hasta ahora. */
  status: PeriodStatusValue | "en-curso";
  periodId: string | null;
  lines: PayoutLineView[];
  servicesCount: number;
  tipsCents: number;
  netCents: number;
  /** true si no se pudo calcular al vuelo (falta una regla de pago, etc.): se le avisa que consulte al gerente. */
  unavailable: boolean;
}

export interface MyReceiptSummary {
  periodId: string;
  label: string;
  status: PeriodStatusValue;
  netCents: number;
}

function sumLines(lines: PayoutLineView[]) {
  return {
    servicesCount: lines.reduce((s, l) => s + l.servicesCount, 0),
    tipsCents: lines.reduce((s, l) => s + l.tipsCents, 0),
    netCents: lines.reduce((s, l) => s + l.netPayableCents, 0),
  };
}

/** La quincena en curso del barbero: del corte guardado si ya se calculo, o al vuelo si no. */
export async function loadMyCurrentQuincena(): Promise<MyQuincena> {
  const scope = await requireBarberScope();
  const chainId = scope.chainId;
  if (!chainId) forbidden();

  const today = await chainTodayIso(db, chainId!);
  const range = quincenaContaining(today)!;
  const [me] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, scope.userId)).limit(1);
  const barberName = me?.fullName ?? "Barbero";
  const base = {
    barberName,
    label: formatQuincenaLabel(range.startsOn, range.endsOn),
    startsOn: range.startsOn,
    endsOn: range.endsOn,
  };

  const [period] = await db
    .select()
    .from(payoutPeriods)
    .where(and(eq(payoutPeriods.chainId, chainId!), eq(payoutPeriods.startsOn, range.startsOn), eq(payoutPeriods.endsOn, range.endsOn)))
    .limit(1);

  // Corte ya calculado (o cerrado): es la cifra oficial, la misma que ve el gerente en el Corte.
  if (period && period.status !== "open") {
    const stored = (await loadStoredLines(db, period.id)).filter((l) => l.barberId === scope.userId);
    const lines = await toLineViews(db, chainId!, stored);
    return { ...base, status: period.status, periodId: period.id, lines, ...sumLines(lines), unavailable: false };
  }

  // En curso: se calcula al vuelo con lo cobrado hasta ahora (no se guarda nada).
  const inputs = await loadPayoutInputs({ chainId: chainId!, startsOn: range.startsOn, endsOn: range.endsOn }, db);
  let computed = computePayoutLines(inputs);
  if (!computed.ok) {
    // Un problema ajeno (p. ej. otro barbero sin regla) no debe esconder lo suyo: se reintenta solo con las ventas donde participa.
    const mine = {
      ...inputs,
      sales: inputs.sales.filter((s) => s.barberId === scope.userId || s.items.some((i) => i.barberId === scope.userId)),
    };
    computed = computePayoutLines(mine);
  }
  if (!computed.ok) {
    return { ...base, status: "en-curso", periodId: period?.id ?? null, lines: [], servicesCount: 0, tipsCents: 0, netCents: 0, unavailable: true };
  }

  const locationName = new Map(inputs.locations.map((l) => [l.id, l.name]));
  const lines: PayoutLineView[] = computed.lines
    .filter((l) => l.barberId === scope.userId)
    .map((l) => ({
      key: `${l.barberId}|${l.locationId}`,
      lineId: null,
      barberId: l.barberId,
      barberName,
      locationId: l.locationId,
      locationName: locationName.get(l.locationId) ?? "Sede",
      ruleType: l.ruleType,
      servicesCount: l.servicesCount,
      servicesRevenueCents: l.servicesRevenueCents,
      productRevenueCents: l.productRevenueCents,
      commissionCents: l.commissionCents,
      boothRentDeductedCents: l.boothRentDeductedCents,
      tipsCents: l.tipsCents,
      adjustmentsCents: l.adjustmentsCents,
      netPayableCents: l.netPayableCents,
      notes: null,
    }));
  return { ...base, status: "en-curso", periodId: period?.id ?? null, lines, ...sumLines(lines), unavailable: false };
}

/** Historico de recibos cerrados (`approved` o `paid`) del barbero, del mas reciente al mas viejo. */
export async function loadMyClosedReceipts(): Promise<MyReceiptSummary[]> {
  const scope = await requireBarberScope();
  const chainId = scope.chainId;
  if (!chainId) forbidden();

  // Una sola consulta agregada (numeric -> centavos enteros en SQL): el neto del barbero por corte, sumando sus sedes.
  const rows = await db
    .select({
      periodId: payoutPeriods.id,
      startsOn: payoutPeriods.startsOn,
      endsOn: payoutPeriods.endsOn,
      status: payoutPeriods.status,
      netCents: sql<string>`sum(round(${payoutLines.netPayable} * 100))::text`,
    })
    .from(payoutLines)
    .innerJoin(payoutPeriods, eq(payoutPeriods.id, payoutLines.payoutPeriodId))
    .where(
      and(
        eq(payoutLines.barberId, scope.userId),
        eq(payoutPeriods.chainId, chainId!),
        inArray(payoutPeriods.status, ["approved", "paid"]),
      ),
    )
    .groupBy(payoutPeriods.id, payoutPeriods.startsOn, payoutPeriods.endsOn, payoutPeriods.status)
    .orderBy(desc(payoutPeriods.startsOn))
    .limit(24);

  return rows.map((r) => ({
    periodId: r.periodId,
    label: formatQuincenaLabel(r.startsOn, r.endsOn),
    status: r.status,
    netCents: Number(r.netCents),
  }));
}

export interface MyReceipt {
  periodId: string;
  label: string;
  status: PeriodStatusValue;
  barberName: string;
  lines: PayoutLineView[];
}

/**
 * Recibo de UN corte del barbero autenticado. 403 si el corte no existe en su
 * cadena, si todavia esta `open` (sin cifras) o si el barbero no tiene lineas en
 * el: por URL directa nadie puede ver el recibo de otro ni sondear cortes.
 */
export async function loadMyReceipt(periodId: string): Promise<MyReceipt> {
  const scope = await requireBarberScope();
  const chainId = scope.chainId;
  if (!chainId) forbidden();

  const [period] = await db
    .select()
    .from(payoutPeriods)
    .where(and(eq(payoutPeriods.id, periodId), eq(payoutPeriods.chainId, chainId!), ne(payoutPeriods.status, "open")))
    .limit(1);
  if (!period) forbidden();

  const stored = (await loadStoredLines(db, period!.id)).filter((l) => l.barberId === scope.userId);
  if (stored.length === 0) forbidden();

  const lines = await toLineViews(db, chainId!, stored);
  return {
    periodId: period!.id,
    label: formatQuincenaLabel(period!.startsOn, period!.endsOn),
    status: period!.status,
    barberName: lines[0]?.barberName ?? "Barbero",
    lines,
  };
}
