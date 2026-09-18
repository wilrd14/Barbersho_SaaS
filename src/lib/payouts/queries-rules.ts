import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { requireChainScope } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { barberLocations, commissionRules, locations, memberships, users } from "@/lib/db/schema";
import { centsFromDecimalString } from "@/lib/actions/money-utils";

/**
 * F3-04 · Lecturas de la pantalla de Reglas de Pago. Solo superuser
 * (`requireChainScope` dentro de la funcion). Consultas SECUENCIALES (sin
 * `Promise.all`, regla del Bloque A para el pool max:1). Todo sale ya
 * normalizado y serializable para pasarlo a un componente cliente.
 */
export interface RuleView {
  id: string;
  name: string;
  type: "percentage" | "fixed_per_service" | "booth_rent" | "hybrid";
  appliesTo: "chain" | "location" | "barber";
  serviceCommissionPct: string | null;
  productCommissionPct: string | null;
  boothRentCents: number | null;
  boothRentFrequency: "weekly" | "biweekly" | "monthly" | null;
  usedBy: number;
}

export interface AssignmentView {
  barberLocationId: string;
  barberId: string;
  barberName: string;
  locationId: string;
  locationName: string;
  commissionRuleId: string | null;
}

export interface RulesPageData {
  rules: RuleView[];
  assignments: AssignmentView[];
}

export async function loadRulesPageData(): Promise<RulesPageData> {
  const scope = await requireChainScope();

  const ruleRows = await db
    .select()
    .from(commissionRules)
    .where(eq(commissionRules.chainId, scope.chainId))
    .orderBy(asc(commissionRules.appliesTo), asc(commissionRules.name));

  // Solo barberos (membership `barber`): los admins tambien tienen fila en barber_locations.
  const assignmentRows = await db
    .select({
      barberLocationId: barberLocations.id,
      barberId: barberLocations.userId,
      barberName: users.fullName,
      locationId: barberLocations.locationId,
      locationName: locations.name,
      commissionRuleId: barberLocations.commissionRuleId,
    })
    .from(barberLocations)
    .innerJoin(locations, eq(locations.id, barberLocations.locationId))
    .innerJoin(users, eq(users.id, barberLocations.userId))
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, barberLocations.userId),
        eq(memberships.chainId, scope.chainId),
        eq(memberships.role, "barber"),
      ),
    )
    .where(eq(locations.chainId, scope.chainId))
    .orderBy(asc(users.fullName), asc(locations.name));

  const usage = new Map<string, number>();
  for (const a of assignmentRows) {
    if (a.commissionRuleId) usage.set(a.commissionRuleId, (usage.get(a.commissionRuleId) ?? 0) + 1);
  }

  return {
    rules: ruleRows.map((r) => ({
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
      locationId: a.locationId,
      locationName: a.locationName,
      commissionRuleId: a.commissionRuleId,
    })),
  };
}
