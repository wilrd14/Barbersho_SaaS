import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { forbidden } from "next/navigation";

import { centsFromDecimalString } from "@/lib/actions/money-utils";
import { requireLocationScope } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { barberLocations, commissionRules, locations, memberships, payoutPeriods, users } from "@/lib/db/schema";
import { loadStoredLines, summarizeLines } from "@/lib/payouts/cycle";
import { formatQuincenaLabel, type PeriodStatusValue } from "@/lib/payouts/period";
import type { AssignmentView, RuleView } from "@/lib/payouts/queries-rules";
import { toLineViews, type PayoutLineView } from "@/lib/payouts/queries-periods";

/**
 * F3-10 · Lecturas de la vista del corte para el ADMIN de sede (D-F3-18): las
 * lineas de pago de los barberos de ESA sede, solo lectura. `requireLocationScope`
 * dentro de la funcion: un admin de otra sede recibe 403 aunque cambie el
 * `locationId` de la URL; un barbero (`barber_assigned`) tambien. Nunca carga
 * lineas de otras sedes (el filtro va en SQL, no en la pagina) ni la Tabla de
 * Posiciones. Solo se listan cortes ya calculados (`open` no tiene cifras).
 * Consultas SECUENCIALES (sin `Promise.all`).
 */
export interface LocationPeriodOption {
  id: string;
  label: string;
  status: PeriodStatusValue;
}

export interface LocationPayoutsData {
  locationName: string;
  periods: LocationPeriodOption[];
  selected: (LocationPeriodOption & { lines: PayoutLineView[]; totals: ReturnType<typeof summarizeLines> }) | null;
  /** Reglas que aplican a los barberos de ESTA sede (y la de la cadena) y a quien se le asignan aqui: solo lectura. */
  rules: RuleView[];
  assignments: AssignmentView[];
}

export async function loadLocationPayouts(locationId: string, periodId?: string): Promise<LocationPayoutsData> {
  const scope = await requireLocationScope(locationId);
  if (scope.effectiveRole !== "superuser" && scope.effectiveRole !== "admin") forbidden();

  const [location] = await db
    .select({ name: locations.name })
    .from(locations)
    .where(and(eq(locations.id, scope.locationId), eq(locations.chainId, scope.chainId)))
    .limit(1);

  const periodRows = await db
    .select()
    .from(payoutPeriods)
    .where(and(eq(payoutPeriods.chainId, scope.chainId), inArray(payoutPeriods.status, ["calculated", "approved", "paid"])))
    .orderBy(desc(payoutPeriods.startsOn))
    .limit(12);
  const periods: LocationPeriodOption[] = periodRows.map((p) => ({
    id: p.id,
    label: formatQuincenaLabel(p.startsOn, p.endsOn),
    status: p.status,
  }));

  const chosen = periodId ? periodRows.find((p) => p.id === periodId) : periodRows[0];
  let selected: LocationPayoutsData["selected"] = null;
  if (chosen) {
    const stored = await loadStoredLines(db, chosen.id, scope.locationId);
    const lines = await toLineViews(db, scope.chainId, stored);
    selected = {
      id: chosen.id,
      label: formatQuincenaLabel(chosen.startsOn, chosen.endsOn),
      status: chosen.status,
      lines,
      totals: summarizeLines(stored),
    };
  }

  // Reglas de los barberos de esta sede (solo lectura). Solo membership `barber`.
  const assignmentRows = await db
    .select({
      barberLocationId: barberLocations.id,
      barberId: barberLocations.userId,
      barberName: users.fullName,
      commissionRuleId: barberLocations.commissionRuleId,
    })
    .from(barberLocations)
    .innerJoin(users, eq(users.id, barberLocations.userId))
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, barberLocations.userId),
        eq(memberships.chainId, scope.chainId),
        eq(memberships.role, "barber"),
      ),
    )
    .where(eq(barberLocations.locationId, scope.locationId))
    .orderBy(asc(users.fullName));
  const ruleRows = await db
    .select()
    .from(commissionRules)
    .where(eq(commissionRules.chainId, scope.chainId))
    .orderBy(asc(commissionRules.appliesTo), asc(commissionRules.name));

  const usedIds = new Set(assignmentRows.map((a) => a.commissionRuleId).filter((id): id is string => id !== null));
  const usage = new Map<string, number>();
  for (const a of assignmentRows) if (a.commissionRuleId) usage.set(a.commissionRuleId, (usage.get(a.commissionRuleId) ?? 0) + 1);

  return {
    locationName: location?.name ?? "Sede",
    periods,
    selected,
    rules: ruleRows
      .filter((r) => r.appliesTo === "chain" || usedIds.has(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        appliesTo: r.appliesTo,
        serviceCommissionPct: r.serviceCommissionPct,
        productCommissionPct: r.productCommissionPct,
        boothRentCents: r.boothRentAmount === null ? null : centsFromDecimalString(r.boothRentAmount),
        boothRentFrequency: r.boothRentFrequency,
        usedBy: usage.get(r.id) ?? 0,
      })),
    assignments: assignmentRows.map((a) => ({
      barberLocationId: a.barberLocationId,
      barberId: a.barberId,
      barberName: a.barberName ?? "Barbero sin nombre",
      locationId: scope.locationId,
      locationName: location?.name ?? "Sede",
      commissionRuleId: a.commissionRuleId,
    })),
  };
}
