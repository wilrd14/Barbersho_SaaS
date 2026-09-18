import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { requireChainScope } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { barberLocations, commissionRules, locations, payoutLines, payoutPeriods, users } from "@/lib/db/schema";
import type { ApprovalBlocker } from "@/lib/payouts/blockers";
import {
  chainTodayIso,
  describeReadinessReasons,
  evaluatePeriodReadiness,
  loadStoredLines,
  summarizeLines,
  type PayoutSelectExecutor,
  type PeriodLine,
} from "@/lib/payouts/cycle";
import {
  formatQuincenaLabel,
  nextQuincena,
  previousQuincena,
  quincenaContaining,
  type DateRange,
  type PeriodStatusValue,
} from "@/lib/payouts/period";

/**
 * F3-06 · Lecturas de las pantallas del Corte (solo superuser: cada funcion
 * llama a `requireChainScope` por dentro). Consultas SECUENCIALES (sin
 * `Promise.all`, regla del Bloque A). Todo sale serializable y en centavos.
 */

export interface PeriodListRow {
  id: string;
  startsOn: string;
  endsOn: string;
  label: string;
  status: PeriodStatusValue;
  barberCount: number;
  locationCount: number;
  totalNetCents: number | null;
}

export interface QuincenaOption extends DateRange {
  label: string;
}

export interface PeriodsPageData {
  todayIso: string;
  periods: PeriodListRow[];
  /** Quincenas que se pueden crear (sin cruce con un corte existente): la de hoy, las 3 anteriores y la siguiente. */
  creatable: QuincenaOption[];
}

export async function loadPeriodsPageData(): Promise<PeriodsPageData> {
  const scope = await requireChainScope();
  const todayIso = await chainTodayIso(db, scope.chainId);

  const periodRows = await db
    .select()
    .from(payoutPeriods)
    .where(eq(payoutPeriods.chainId, scope.chainId))
    .orderBy(desc(payoutPeriods.startsOn));

  // Totales por periodo en UNA consulta agregada (numeric -> centavos enteros en SQL, sin floats).
  const totals =
    periodRows.length === 0
      ? []
      : await db
          .select({
            periodId: payoutLines.payoutPeriodId,
            barbers: sql<number>`count(distinct ${payoutLines.barberId})::int`,
            locations: sql<number>`count(distinct ${payoutLines.locationId})::int`,
            netCents: sql<string>`coalesce(sum(round(${payoutLines.netPayable} * 100)), 0)::text`,
          })
          .from(payoutLines)
          .where(
            inArray(
              payoutLines.payoutPeriodId,
              periodRows.map((p) => p.id),
            ),
          )
          .groupBy(payoutLines.payoutPeriodId);
  const totalsById = new Map(totals.map((t) => [t.periodId, t]));

  const periods: PeriodListRow[] = periodRows.map((p) => {
    const t = totalsById.get(p.id);
    return {
      id: p.id,
      startsOn: p.startsOn,
      endsOn: p.endsOn,
      label: formatQuincenaLabel(p.startsOn, p.endsOn),
      status: p.status,
      barberCount: t?.barbers ?? 0,
      locationCount: t?.locations ?? 0,
      totalNetCents: p.status === "open" ? null : Number(t?.netCents ?? "0"),
    };
  });

  const current = quincenaContaining(todayIso);
  const candidates: DateRange[] = [];
  if (current) {
    // Orden: la quincena en curso primero (es la que se suele crear), luego las 3 anteriores y al final la siguiente.
    let back: DateRange | null = current;
    for (let i = 0; i < 4 && back; i += 1) {
      candidates.push(back);
      back = previousQuincena(back);
    }
    const ahead = nextQuincena(current);
    if (ahead) candidates.push(ahead);
  }
  const overlaps = (a: DateRange) => periods.some((p) => p.startsOn <= a.endsOn && p.endsOn >= a.startsOn);
  const creatable = candidates
    .filter((c) => !overlaps(c))
    .map((c) => ({ ...c, label: formatQuincenaLabel(c.startsOn, c.endsOn) }));

  return { todayIso, periods, creatable };
}

// ---------------------------------------------------------------------------
// Detalle del Corte de Quincena
// ---------------------------------------------------------------------------

export interface PayoutLineView {
  key: string;
  lineId: string | null;
  barberId: string;
  barberName: string;
  locationId: string;
  locationName: string;
  /** null si ya no se puede resolver (regla eliminada): la tabla muestra el monto igual. */
  ruleType: "percentage" | "fixed_per_service" | "booth_rent" | "hybrid" | null;
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

export interface PeriodDetail {
  id: string;
  startsOn: string;
  endsOn: string;
  label: string;
  status: PeriodStatusValue;
  calculatedAt: string | null;
  approvedByName: string | null;
  todayIso: string;
  lines: PayoutLineView[];
  totals: ReturnType<typeof summarizeLines>;
  /** Solo periodos `open`/`calculated`: bloqueadores y motivos (en vivo). null si el periodo ya esta cerrado. */
  readiness: {
    blockers: ApprovalBlocker[];
    notEnded: { endsOn: string; today: string } | null;
    stale: { differingLines: number } | null;
    computeError: string | null;
    /** Todos los motivos por los que no se puede cerrar, en frases (para el boton). Vacio = se puede. */
    closeBlockedReasons: string[];
  } | null;
}

/** Devuelve null si el corte no existe en la cadena del guard (la pagina responde 404). */
export async function loadPeriodDetail(periodId: string): Promise<PeriodDetail | null> {
  const scope = await requireChainScope();

  const [period] = await db
    .select()
    .from(payoutPeriods)
    .where(and(eq(payoutPeriods.id, periodId), eq(payoutPeriods.chainId, scope.chainId)))
    .limit(1);
  if (!period) return null;

  const todayIso = await chainTodayIso(db, scope.chainId);
  const stored = await loadStoredLines(db, period.id);

  const lines = await toLineViews(db, scope.chainId, stored);

  let approvedByName: string | null = null;
  if (period.approvedBy) {
    const [approver] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, period.approvedBy)).limit(1);
    approvedByName = approver?.fullName ?? null;
  }

  let readiness: PeriodDetail["readiness"] = null;
  if (period.status === "open" || period.status === "calculated") {
    const r = await evaluatePeriodReadiness(db, period, todayIso);
    const reasons = describeReadinessReasons(r);
    readiness = {
      blockers: r.blockers,
      notEnded: r.notEnded,
      stale: r.stale,
      computeError: r.computeError,
      closeBlockedReasons:
        period.status === "open" ? ["El corte todavía no se calculó. Calcúlalo antes de cerrarlo.", ...reasons] : reasons,
    };
  }

  return {
    id: period.id,
    startsOn: period.startsOn,
    endsOn: period.endsOn,
    label: formatQuincenaLabel(period.startsOn, period.endsOn),
    status: period.status,
    calculatedAt: period.calculatedAt?.toISOString() ?? null,
    approvedByName,
    todayIso,
    lines,
    totals: summarizeLines(stored),
    readiness,
  };
}

/** Nombres de barbero y sede + tipo de regla (para el guion de "COMIS." en silla fija) sobre lineas ya guardadas. */
export async function toLineViews(
  executor: PayoutSelectExecutor,
  chainId: string,
  stored: (PeriodLine & { id: string })[],
): Promise<PayoutLineView[]> {
  if (stored.length === 0) return [];

  const barberIds = [...new Set(stored.map((l) => l.barberId))];
  const locationIds = [...new Set(stored.map((l) => l.locationId))];
  const barberRows = await executor.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, barberIds));
  const locationRows = await executor
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(inArray(locations.id, locationIds));
  const ruleRows = await executor
    .select({ id: commissionRules.id, type: commissionRules.type, appliesTo: commissionRules.appliesTo })
    .from(commissionRules)
    .where(eq(commissionRules.chainId, chainId));
  const assignmentRows = await executor
    .select({
      barberId: barberLocations.userId,
      locationId: barberLocations.locationId,
      ruleId: barberLocations.commissionRuleId,
    })
    .from(barberLocations)
    .where(inArray(barberLocations.userId, barberIds));

  const barberName = new Map(barberRows.map((b) => [b.id, b.fullName ?? "Barbero sin nombre"]));
  const locationName = new Map(locationRows.map((l) => [l.id, l.name]));
  const ruleType = new Map(ruleRows.map((r) => [r.id, r.type]));
  const chainDefault = ruleRows.find((r) => r.appliesTo === "chain");
  const assignmentByPair = new Map(assignmentRows.map((a) => [`${a.barberId}|${a.locationId}`, a.ruleId]));

  return stored
    .map((l) => {
      const overrideId = assignmentByPair.get(`${l.barberId}|${l.locationId}`);
      const resolvedType = overrideId ? ruleType.get(overrideId) : chainDefault?.type;
      return {
        key: `${l.barberId}|${l.locationId}`,
        lineId: l.id,
        barberId: l.barberId,
        barberName: barberName.get(l.barberId) ?? "Barbero sin nombre",
        locationId: l.locationId,
        locationName: locationName.get(l.locationId) ?? "Sede",
        ruleType: resolvedType ?? null,
        servicesCount: l.servicesCount,
        servicesRevenueCents: l.servicesRevenueCents,
        productRevenueCents: l.productRevenueCents,
        commissionCents: l.commissionCents,
        boothRentDeductedCents: l.boothRentDeductedCents,
        tipsCents: l.tipsCents,
        adjustmentsCents: l.adjustmentsCents,
        netPayableCents: l.netPayableCents,
        notes: l.notes,
      };
    })
    .sort((a, b) => a.barberName.localeCompare(b.barberName, "es") || a.locationName.localeCompare(b.locationName, "es"));
}

