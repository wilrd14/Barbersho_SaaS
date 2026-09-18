import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

import type { SessionContext } from "@/lib/auth/session";
import { IDS, adminNacoSession, barberSession, superuserSession } from "@/lib/payouts/__tests__/fixtures";

/**
 * F3-04 · Reglas de Pago contra el Supabase REAL. Solo se simula "quien esta
 * autenticado" (`getSessionContext`); los guards, Zod, las transacciones y el
 * audit_log corren de verdad. Limpieza: borra por ID las reglas creadas y sus
 * filas de audit_log, y restaura el override de barber_locations al valor
 * original, dejando la BD identica a la linea base.
 */
class ForbiddenError extends Error {
  constructor() {
    super("FORBIDDEN_403");
  }
}
vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw new ForbiddenError();
  },
}));

const sessionMock = vi.fn<() => Promise<SessionContext>>();
vi.mock("@/lib/auth/session", () => ({ getSessionContext: () => sessionMock() }));

const createdRuleIds: string[] = [];
let originalB3Naco: string | null = null;
let originalB3Bv: string | null = null;

async function actions() {
  return await import("@/lib/actions/commission-rules");
}

async function auditRows(entityId: string) {
  const { db } = await import("@/lib/db/client");
  const { auditLog } = await import("@/lib/db/schema");
  return db.select().from(auditLog).where(eq(auditLog.entityId, entityId));
}

describe("Reglas de Pago (F3-04, DB real)", () => {
  beforeAll(async () => {
    const { db } = await import("@/lib/db/client");
    const { barberLocations } = await import("@/lib/db/schema");
    const rows = await db
      .select({ locationId: barberLocations.locationId, rule: barberLocations.commissionRuleId })
      .from(barberLocations)
      .where(eq(barberLocations.userId, IDS.b3));
    originalB3Naco = rows.find((r) => r.locationId === IDS.naco)?.rule ?? null;
    originalB3Bv = rows.find((r) => r.locationId === IDS.bellaVista)?.rule ?? null;
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db/client");
    const { auditLog, barberLocations, commissionRules } = await import("@/lib/db/schema");
    // Primero se restauran los overrides (la FK `set null` lo haria igual, pero se restaura explicito).
    await db
      .update(barberLocations)
      .set({ commissionRuleId: originalB3Naco })
      .where(and(eq(barberLocations.userId, IDS.b3), eq(barberLocations.locationId, IDS.naco)));
    await db
      .update(barberLocations)
      .set({ commissionRuleId: originalB3Bv })
      .where(and(eq(barberLocations.userId, IDS.b3), eq(barberLocations.locationId, IDS.bellaVista)));
    if (createdRuleIds.length > 0) {
      await db.delete(commissionRules).where(inArray(commissionRules.id, createdRuleIds));
    }
    // audit_log de todo lo que hizo este archivo: reglas creadas + los overrides de b3.
    const bl = await db
      .select({ id: barberLocations.id })
      .from(barberLocations)
      .where(eq(barberLocations.userId, IDS.b3));
    const entityIds = [...createdRuleIds, ...bl.map((r) => r.id)];
    await db.delete(auditLog).where(inArray(auditLog.entityId, entityIds));
  });

  it("crea una regla booth_rent con frecuencia y la asigna a b3 en Naco SIN tocar su regla en Bella Vista", async () => {
    sessionMock.mockResolvedValue(superuserSession());
    const { createCommissionRuleAction, assignBarberLocationRuleAction } = await actions();

    const created = await createCommissionRuleAction({
      name: "TEST Silla fija RD$2,500/semana",
      type: "booth_rent",
      boothRentCents: 250000,
      boothRentFrequency: "weekly",
      appliesTo: "barber",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdRuleIds.push(created.data.ruleId);

    const { db } = await import("@/lib/db/client");
    const { commissionRules, barberLocations } = await import("@/lib/db/schema");
    const [row] = await db.select().from(commissionRules).where(eq(commissionRules.id, created.data.ruleId));
    expect(row).toMatchObject({
      type: "booth_rent",
      boothRentAmount: "2500.00",
      boothRentFrequency: "weekly",
      serviceCommissionPct: null, // lo que la regla no usa va en null, nunca un 0 implicito
      tipHandling: "barber_keeps_all",
      appliesTo: "barber",
    });

    const assigned = await assignBarberLocationRuleAction({
      barberId: IDS.b3,
      locationId: IDS.naco,
      ruleId: created.data.ruleId,
    });
    expect(assigned.ok).toBe(true);

    const rows = await db
      .select({ locationId: barberLocations.locationId, rule: barberLocations.commissionRuleId })
      .from(barberLocations)
      .where(eq(barberLocations.userId, IDS.b3));
    expect(rows.find((r) => r.locationId === IDS.naco)?.rule).toBe(created.data.ruleId);
    expect(rows.find((r) => r.locationId === IDS.bellaVista)?.rule).toBe(originalB3Bv);

    // audit_log con before/after de ambas operaciones.
    const ruleAudit = await auditRows(created.data.ruleId);
    expect(ruleAudit.map((a) => a.action)).toContain("commission_rule.create");
    const [createAudit] = ruleAudit.filter((a) => a.action === "commission_rule.create");
    expect(createAudit!.before).toBeNull();
    expect(createAudit!.after).toMatchObject({ type: "booth_rent", boothRentAmount: "2500.00" });
    const [bl] = await db
      .select({ id: barberLocations.id })
      .from(barberLocations)
      .where(and(eq(barberLocations.userId, IDS.b3), eq(barberLocations.locationId, IDS.naco)));
    const assignAudit = (await auditRows(bl!.id)).filter((a) => a.action === "barber_location.assign_rule");
    expect(assignAudit).toHaveLength(1);
    expect(assignAudit[0]!.before).toMatchObject({ commissionRuleId: originalB3Naco });
    expect(assignAudit[0]!.after).toMatchObject({ commissionRuleId: created.data.ruleId });
  });

  it("rechaza una segunda regla applies_to = chain con un mensaje legible (no un error de Postgres)", async () => {
    sessionMock.mockResolvedValue(superuserSession());
    const { createCommissionRuleAction } = await actions();
    const result = await createCommissionRuleAction({
      name: "TEST otra por defecto",
      type: "percentage",
      serviceCommissionPct: "40",
      appliesTo: "chain",
    });
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("Ya existe la regla de pago por defecto de la cadena"),
    });
    // Nada quedo escrito.
    const { db } = await import("@/lib/db/client");
    const { commissionRules } = await import("@/lib/db/schema");
    const rows = await db
      .select({ id: commissionRules.id })
      .from(commissionRules)
      .where(eq(commissionRules.name, "TEST otra por defecto"));
    expect(rows).toHaveLength(0);
  });

  it("la restriccion unica de la BD se reconoce como tal (respaldo del pre-chequeo ante una carrera)", async () => {
    const { pgErrorInfo } = await import("@/lib/payouts/pg-errors");
    const { db } = await import("@/lib/db/client");
    const { commissionRules } = await import("@/lib/db/schema");
    let info = {};
    try {
      await db.insert(commissionRules).values({
        chainId: IDS.chain,
        name: "TEST dup",
        type: "percentage",
        serviceCommissionPct: "10.00",
        appliesTo: "chain",
      });
    } catch (err) {
      info = pgErrorInfo(err);
    }
    expect(info).toEqual({ code: "23505", constraint: "commission_rules_chain_default_uq" });
  });

  it("valida con Zod: fixed_per_service no existe, falta el porcentaje, porcentaje > 100, alquiler sin frecuencia", async () => {
    sessionMock.mockResolvedValue(superuserSession());
    const { createCommissionRuleAction } = await actions();
    const base = { name: "TEST invalida", appliesTo: "barber" };
    const cases: [Record<string, unknown>, string][] = [
      [{ ...base, type: "fixed_per_service", boothRentCents: 1 }, "Elige el tipo de regla"],
      [{ ...base, type: "percentage" }, "Falta el porcentaje por servicio"],
      [{ ...base, type: "percentage", serviceCommissionPct: "101" }, "entre 0 y 100"],
      [{ ...base, type: "booth_rent", boothRentCents: 100000 }, "Falta la frecuencia"],
      [{ ...base, type: "hybrid", serviceCommissionPct: "30", boothRentFrequency: "monthly" }, "Falta el monto del alquiler"],
      [{ ...base, name: "  ", type: "percentage", serviceCommissionPct: "30" }, "Ponle un nombre"],
    ];
    for (const [input, fragment] of cases) {
      const result = await createCommissionRuleAction(input);
      expect(result.ok, JSON.stringify(input)).toBe(false);
      if (!result.ok) expect(result.error).toContain(fragment);
    }
  });

  it("un admin y un barbero reciben 403 al escribir reglas, por llamada directa a la accion", async () => {
    const {
      createCommissionRuleAction,
      updateCommissionRuleAction,
      deleteCommissionRuleAction,
      assignBarberLocationRuleAction,
    } = await actions();
    const body = { name: "TEST ilegal", type: "percentage", serviceCommissionPct: "10", appliesTo: "barber" };
    for (const session of [adminNacoSession(), barberSession(IDS.b1, [IDS.naco])]) {
      sessionMock.mockResolvedValue(session);
      await expect(createCommissionRuleAction(body)).rejects.toThrow("FORBIDDEN_403");
      await expect(updateCommissionRuleAction({ ...body, ruleId: IDS.ruleBooth })).rejects.toThrow("FORBIDDEN_403");
      await expect(deleteCommissionRuleAction({ ruleId: IDS.ruleBooth })).rejects.toThrow("FORBIDDEN_403");
      await expect(
        assignBarberLocationRuleAction({ barberId: IDS.b1, locationId: IDS.naco, ruleId: null }),
      ).rejects.toThrow("FORBIDDEN_403");
    }
    const { db } = await import("@/lib/db/client");
    const { commissionRules } = await import("@/lib/db/schema");
    const rows = await db
      .select({ id: commissionRules.id })
      .from(commissionRules)
      .where(eq(commissionRules.name, "TEST ilegal"));
    expect(rows).toHaveLength(0);
  });

  it("edita una regla (before/after en audit_log), no permite borrar la de cadena ni una regla en uso", async () => {
    sessionMock.mockResolvedValue(superuserSession());
    const {
      createCommissionRuleAction,
      updateCommissionRuleAction,
      deleteCommissionRuleAction,
      assignBarberLocationRuleAction,
    } = await actions();

    const created = await createCommissionRuleAction({
      name: "TEST mixta",
      type: "hybrid",
      serviceCommissionPct: "30",
      productCommissionPct: "10.5",
      boothRentCents: 400000,
      boothRentFrequency: "monthly",
      appliesTo: "barber",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdRuleIds.push(created.data.ruleId);

    const updated = await updateCommissionRuleAction({
      ruleId: created.data.ruleId,
      name: "TEST mixta v2",
      type: "hybrid",
      serviceCommissionPct: "35.25",
      boothRentCents: 450000,
      boothRentFrequency: "biweekly",
    });
    expect(updated.ok).toBe(true);
    const updateAudit = (await auditRows(created.data.ruleId)).find((a) => a.action === "commission_rule.update");
    expect(updateAudit!.before).toMatchObject({
      name: "TEST mixta",
      serviceCommissionPct: "30.00",
      productCommissionPct: "10.50",
    });
    expect(updateAudit!.after).toMatchObject({
      name: "TEST mixta v2",
      serviceCommissionPct: "35.25",
      productCommissionPct: null,
      boothRentAmount: "4500.00",
      boothRentFrequency: "biweekly",
    });

    // La regla de cadena no se borra.
    const delDefault = await deleteCommissionRuleAction({ ruleId: IDS.ruleDefault });
    expect(delDefault).toEqual({ ok: false, error: expect.stringContaining("no se elimina") });

    // Una regla en uso no se borra, y el mensaje nombra a quien la usa.
    const assigned = await assignBarberLocationRuleAction({
      barberId: IDS.b3,
      locationId: IDS.bellaVista,
      ruleId: created.data.ruleId,
    });
    expect(assigned.ok).toBe(true);
    const delInUse = await deleteCommissionRuleAction({ ruleId: created.data.ruleId });
    expect(delInUse.ok).toBe(false);
    if (!delInUse.ok) expect(delInUse.error).toContain("Barbero Tres");

    // Liberada, si se borra (y deja audit_log con before y after null).
    await assignBarberLocationRuleAction({ barberId: IDS.b3, locationId: IDS.bellaVista, ruleId: null });
    const del = await deleteCommissionRuleAction({ ruleId: created.data.ruleId });
    expect(del.ok).toBe(true);
    const delAudit = (await auditRows(created.data.ruleId)).find((a) => a.action === "commission_rule.delete");
    expect(delAudit!.after).toBeNull();
    expect(delAudit!.before).toMatchObject({ name: "TEST mixta v2" });
  });

  it("no asigna reglas ni sedes que no son de la cadena", async () => {
    sessionMock.mockResolvedValue(superuserSession());
    const { assignBarberLocationRuleAction } = await actions();
    const bad = await assignBarberLocationRuleAction({
      barberId: IDS.b3,
      locationId: "00000000-0000-0000-0000-00000000dead",
      ruleId: null,
    });
    expect(bad).toEqual({ ok: false, error: expect.stringContaining("no trabaja en esa sede") });
    const missingRule = await assignBarberLocationRuleAction({
      barberId: IDS.b3,
      locationId: IDS.naco,
      ruleId: "00000000-0000-0000-0000-00000000beef",
    });
    expect(missingRule).toEqual({ ok: false, error: expect.stringContaining("Esa regla no existe") });
  });
});
