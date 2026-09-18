import { randomUUID } from "node:crypto";

import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { SessionContext } from "@/lib/auth/session";

import { IDS, adminNacoSession, barberSession, superuserSession } from "./fixtures";

/**
 * F3-10 · Vista del corte para el admin de sede (solo lectura) contra el
 * Supabase REAL: ve las lineas de SU sede y ninguna de otra, ni cambiando el
 * `locationId`. Crea (comprometido) un corte calculado de 2020 con ventas en
 * Naco y en Bella Vista y lo borra por ID al final.
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

const saleIds: string[] = [];
const periodIds: string[] = [];
let calculatedId = "";
let openId = "";

async function insertSale(o: { locationId: string; createdAt: string; barberId: string; cents: number }) {
  const { db } = await import("@/lib/db/client");
  const id = randomUUID();
  saleIds.push(id);
  const dec = (c: number) => `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, "0")}`;
  await db.execute(sql`
    insert into sales (id, chain_id, location_id, client_id, barber_id, subtotal, discount_amount, tip_amount, total, payment_method, status, created_by, created_at)
    values (${id}, ${IDS.chain}, ${o.locationId}, ${IDS.client}, ${o.barberId}, ${dec(o.cents)}, '0', '0', ${dec(o.cents)}, 'cash', 'paid', ${IDS.adminNaco}, ${o.createdAt}::timestamptz)`);
  await db.execute(sql`
    insert into sale_items (id, sale_id, type, service_id, quantity, unit_price, line_total, barber_id)
    values (${randomUUID()}, ${id}, 'service', ${IDS.serviceCorte}, 1, ${dec(o.cents)}, ${dec(o.cents)}, ${o.barberId})`);
}

describe("vista del corte del admin de sede (F3-10, DB real)", () => {
  beforeAll(async () => {
    const { db } = await import("@/lib/db/client");
    const { createPeriodInTx, calculatePeriodInTx } = await import("@/lib/payouts/cycle");
    await insertSale({ locationId: IDS.naco, createdAt: "2020-11-03 10:00:00-04", barberId: IDS.b1, cents: 40000 });
    await insertSale({ locationId: IDS.naco, createdAt: "2020-11-04 10:00:00-04", barberId: IDS.b3, cents: 30000 });
    await insertSale({ locationId: IDS.bellaVista, createdAt: "2020-11-05 10:00:00-04", barberId: IDS.b3, cents: 20000 });
    await insertSale({ locationId: IDS.bellaVista, createdAt: "2020-11-06 10:00:00-04", barberId: IDS.b4, cents: 25000 });

    const args = { chainId: IDS.chain, actorUserId: IDS.owner };
    calculatedId = await db.transaction(async (tx) => {
      const created = await createPeriodInTx(tx, { ...args, startsOn: "2020-11-01", endsOn: "2020-11-15" });
      if (!created.ok) throw new Error(created.error);
      const calc = await calculatePeriodInTx(tx, { ...args, periodId: created.data.periodId });
      if (!calc.ok) throw new Error(calc.error);
      return created.data.periodId;
    });
    periodIds.push(calculatedId);
    const open = await db.transaction((tx) => createPeriodInTx(tx, { ...args, startsOn: "2020-12-01", endsOn: "2020-12-15" }));
    if (!open.ok) throw new Error(open.error);
    openId = open.data.periodId;
    periodIds.push(openId);
  }, 120_000);

  afterAll(async () => {
    const { db } = await import("@/lib/db/client");
    const { auditLog, payoutLines, payoutPeriods, sales } = await import("@/lib/db/schema");
    if (periodIds.length > 0) {
      const lines = await db.select({ id: payoutLines.id }).from(payoutLines).where(inArray(payoutLines.payoutPeriodId, periodIds));
      await db.delete(auditLog).where(inArray(auditLog.entityId, [...periodIds, ...lines.map((l) => l.id)]));
      await db.delete(payoutPeriods).where(inArray(payoutPeriods.id, periodIds));
    }
    if (saleIds.length > 0) await db.delete(sales).where(inArray(sales.id, saleIds));
  });

  it("el admin de Naco ve las lineas de Naco y NINGUNA de Bella Vista", async () => {
    sessionMock.mockResolvedValue(adminNacoSession());
    const { loadLocationPayouts } = await import("@/lib/payouts/queries-location");
    const data = await loadLocationPayouts(IDS.naco, calculatedId);
    expect(data.locationName).toBe("Naco");
    expect(data.selected?.id).toBe(calculatedId);
    const lines = data.selected!.lines;
    expect(lines.map((l) => l.barberId).sort()).toEqual([IDS.b1, IDS.b3].sort());
    expect(lines.every((l) => l.locationId === IDS.naco)).toBe(true);
    // Los totales son SOLO de Naco: 40000 + 30000 de ingreso.
    expect(lines.reduce((s, l) => s + l.servicesRevenueCents, 0)).toBe(70000);
    // El corte `open` no se lista (no tiene cifras); el calculado si.
    expect(data.periods.map((p) => p.id)).toContain(calculatedId);
    expect(data.periods.map((p) => p.id)).not.toContain(openId);
    // Reglas: solo los barberos de Naco; ninguno de Bella Vista (b4) ni asignaciones de otra sede.
    expect(data.assignments.every((a) => a.locationId === IDS.naco)).toBe(true);
    expect(data.assignments.map((a) => a.barberId)).not.toContain(IDS.b4);
    expect(data.rules.some((r) => r.appliesTo === "chain")).toBe(true);
  }, 60_000);

  it("cambiar el locationId a Bella Vista da 403 al admin de Naco; un barbero tambien", async () => {
    const { loadLocationPayouts } = await import("@/lib/payouts/queries-location");
    sessionMock.mockResolvedValue(adminNacoSession());
    await expect(loadLocationPayouts(IDS.bellaVista, calculatedId)).rejects.toThrow("FORBIDDEN_403");
    await expect(loadLocationPayouts(IDS.sanCristobal)).rejects.toThrow("FORBIDDEN_403");
    sessionMock.mockResolvedValue(barberSession(IDS.b1, [IDS.naco]));
    await expect(loadLocationPayouts(IDS.naco, calculatedId)).rejects.toThrow("FORBIDDEN_403"); // asignado a la sede, pero no gerente
    sessionMock.mockResolvedValue({ authenticated: false });
    await expect(loadLocationPayouts(IDS.naco)).rejects.toThrow("FORBIDDEN_403");
  });

  it("el superuser ve la sede que abre y solo sus lineas; un periodo desconocido no muestra nada", async () => {
    sessionMock.mockResolvedValue(superuserSession());
    const { loadLocationPayouts } = await import("@/lib/payouts/queries-location");
    const bv = await loadLocationPayouts(IDS.bellaVista, calculatedId);
    expect(bv.selected!.lines.every((l) => l.locationId === IDS.bellaVista)).toBe(true);
    expect(bv.selected!.lines.map((l) => l.barberId).sort()).toEqual([IDS.b3, IDS.b4].sort());
    const unknown = await loadLocationPayouts(IDS.naco, "00000000-0000-0000-0000-00000000abcd");
    expect(unknown.selected).toBeNull();
  }, 60_000);
});
