import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { SessionContext } from "@/lib/auth/session";

import { IDS, barberSession } from "./fixtures";

/**
 * F3-07 · "Lo mio" y Recibo del barbero contra el Supabase REAL. Se simula solo
 * la sesion; guards, consultas y calculo son reales. Crea (comprometido) un
 * corte de 2020 con ventas propias, lo calcula y aprueba, y lo borra por ID al
 * final (periodo -> lineas por cascade, audit_log, ventas -> lineas por cascade).
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
let closedPeriodId = "";
let openPeriodId = "";

async function insertSale(o: { locationId: string; createdAt: string; barberId: string; cents: number; tipCents?: number }) {
  const { db } = await import("@/lib/db/client");
  const id = randomUUID();
  saleIds.push(id);
  const dec = (c: number) => `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, "0")}`;
  await db.execute(sql`
    insert into sales (id, chain_id, location_id, client_id, barber_id, subtotal, discount_amount, tip_amount, total, payment_method, status, created_by, created_at)
    values (${id}, ${IDS.chain}, ${o.locationId}, ${IDS.client}, ${o.barberId}, ${dec(o.cents)}, '0', ${dec(o.tipCents ?? 0)}, ${dec(o.cents + (o.tipCents ?? 0))},
            'cash', 'paid', ${IDS.adminNaco}, ${o.createdAt}::timestamptz)`);
  await db.execute(sql`
    insert into sale_items (id, sale_id, type, service_id, quantity, unit_price, line_total, barber_id)
    values (${randomUUID()}, ${id}, 'service', ${IDS.serviceCorte}, 1, ${dec(o.cents)}, ${dec(o.cents)}, ${o.barberId})`);
}

describe("Lo mio y Recibo del barbero (F3-07, DB real)", () => {
  beforeAll(async () => {
    const { db } = await import("@/lib/db/client");
    const { createPeriodInTx, calculatePeriodInTx, approvePeriodInTx } = await import("@/lib/payouts/cycle");
    const { todayIsoInTimezone } = await import("@/lib/payouts/period");

    await insertSale({ locationId: IDS.naco, createdAt: "2020-09-03 10:00:00-04", barberId: IDS.b1, cents: 40000, tipCents: 2500 });
    await insertSale({ locationId: IDS.naco, createdAt: "2020-09-04 10:00:00-04", barberId: IDS.b3, cents: 30000, tipCents: 1000 });
    await insertSale({ locationId: IDS.bellaVista, createdAt: "2020-09-05 10:00:00-04", barberId: IDS.b3, cents: 20000 });

    const args = { chainId: IDS.chain, actorUserId: IDS.owner };
    const closed = await db.transaction(async (tx) => {
      const created = await createPeriodInTx(tx, { ...args, startsOn: "2020-09-01", endsOn: "2020-09-15" });
      if (!created.ok) throw new Error(created.error);
      const calc = await calculatePeriodInTx(tx, { ...args, periodId: created.data.periodId });
      if (!calc.ok) throw new Error(calc.error);
      const approved = await approvePeriodInTx(tx, {
        ...args,
        periodId: created.data.periodId,
        todayIso: todayIsoInTimezone(new Date(), "America/Santo_Domingo"),
      });
      if (!approved.ok) throw new Error(approved.error);
      return created.data.periodId;
    });
    closedPeriodId = closed;
    periodIds.push(closed);
    const open = await db.transaction((tx) => createPeriodInTx(tx, { ...args, startsOn: "2020-10-01", endsOn: "2020-10-15" }));
    if (!open.ok) throw new Error(open.error);
    openPeriodId = open.data.periodId;
    periodIds.push(open.data.periodId);
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

  it("el barbero ve SOLO su linea; su recibo coincide al centavo con su linea del Corte", async () => {
    sessionMock.mockResolvedValue(barberSession(IDS.b1, [IDS.naco]));
    const { loadMyReceipt, loadMyClosedReceipts } = await import("@/lib/payouts/queries-barber");
    const { db } = await import("@/lib/db/client");
    const { payoutLines } = await import("@/lib/db/schema");

    const receipt = await loadMyReceipt(closedPeriodId);
    expect(receipt.lines).toHaveLength(1);
    expect(receipt.lines[0]).toMatchObject({ barberId: IDS.b1, locationId: IDS.naco, servicesCount: 1, servicesRevenueCents: 40000, tipsCents: 2500 });
    expect(receipt.lines.every((l) => l.barberId === IDS.b1)).toBe(true);

    const [stored] = await db.select().from(payoutLines).where(eq(payoutLines.barberId, IDS.b1));
    const own = (await db.select().from(payoutLines).where(eq(payoutLines.payoutPeriodId, closedPeriodId))).find((l) => l.barberId === IDS.b1)!;
    expect(stored).toBeDefined();
    expect(receipt.lines[0]!.netPayableCents).toBe(Math.round(Number(own.netPayable) * 100));
    expect(receipt.lines[0]!.netPayableCents).toBe(20000 + 2500); // 50% de 400.00 + propina

    const history = await loadMyClosedReceipts();
    const entry = history.find((h) => h.periodId === closedPeriodId);
    expect(entry).toMatchObject({ status: "approved", netCents: 22500, label: "Quincena 1–15 sep 2020" });
  }, 60_000);

  it("el barbero multi-sede ve DOS lineas en su recibo que suman su total", async () => {
    sessionMock.mockResolvedValue(barberSession(IDS.b3, [IDS.naco, IDS.bellaVista]));
    const { loadMyReceipt, loadMyClosedReceipts } = await import("@/lib/payouts/queries-barber");
    const receipt = await loadMyReceipt(closedPeriodId);
    expect(receipt.lines.map((l) => l.locationId).sort()).toEqual([IDS.naco, IDS.bellaVista].sort());
    const total = receipt.lines.reduce((s, l) => s + l.netPayableCents, 0);
    const entry = (await loadMyClosedReceipts()).find((h) => h.periodId === closedPeriodId);
    expect(entry!.netCents).toBe(total);
  }, 60_000);

  it("403 por URL directa: un barbero sin lineas en el corte, un corte abierto y un id inexistente", async () => {
    sessionMock.mockResolvedValue(barberSession(IDS.b2, [IDS.naco]));
    const { loadMyReceipt, loadMyClosedReceipts } = await import("@/lib/payouts/queries-barber");
    await expect(loadMyReceipt(closedPeriodId)).rejects.toThrow("FORBIDDEN_403"); // b2 no tiene lineas ahi
    await expect(loadMyReceipt(openPeriodId)).rejects.toThrow("FORBIDDEN_403"); // corte open: sin cifras
    await expect(loadMyReceipt("00000000-0000-0000-0000-00000000abcd")).rejects.toThrow("FORBIDDEN_403");
    expect((await loadMyClosedReceipts()).find((h) => h.periodId === closedPeriodId)).toBeUndefined();
  }, 60_000);

  it("un admin o un cliente (sin membership de barbero) reciben 403 en las lecturas del barbero", async () => {
    const { loadMyReceipt, loadMyCurrentQuincena, loadMyClosedReceipts } = await import("@/lib/payouts/queries-barber");
    const { adminNacoSession } = await import("./fixtures");
    sessionMock.mockResolvedValue(adminNacoSession());
    await expect(loadMyCurrentQuincena()).rejects.toThrow("FORBIDDEN_403");
    await expect(loadMyClosedReceipts()).rejects.toThrow("FORBIDDEN_403");
    await expect(loadMyReceipt(closedPeriodId)).rejects.toThrow("FORBIDDEN_403");
    sessionMock.mockResolvedValue({ authenticated: false });
    await expect(loadMyCurrentQuincena()).rejects.toThrow("FORBIDDEN_403");
  });

  it("la quincena en curso trae SOLO lo suyo y sus servicios y propinas coinciden con SQL independiente", async () => {
    sessionMock.mockResolvedValue(barberSession(IDS.b1, [IDS.naco]));
    const { loadMyCurrentQuincena } = await import("@/lib/payouts/queries-barber");
    const { db } = await import("@/lib/db/client");
    const q = await loadMyCurrentQuincena();
    expect(q.unavailable).toBe(false);
    expect(q.lines.length).toBeGreaterThan(0);
    expect(q.lines.every((l) => l.barberId === IDS.b1)).toBe(true);

    const expected = await db.execute<{ services: string; tips: string }>(sql`
      select (select coalesce(sum(si.quantity), 0) from sale_items si join sales s on s.id = si.sale_id
               join locations l on l.id = s.location_id
               where si.barber_id = ${IDS.b1} and s.status = 'paid' and si.type = 'service' and s.chain_id = ${IDS.chain}
                 and (s.created_at at time zone l.timezone)::date between ${q.startsOn}::date and ${q.endsOn}::date)::text as services,
             (select coalesce(sum(round(s.tip_amount * 100)), 0) from sales s join locations l on l.id = s.location_id
               where s.barber_id = ${IDS.b1} and s.status = 'paid' and s.chain_id = ${IDS.chain}
                 and (s.created_at at time zone l.timezone)::date between ${q.startsOn}::date and ${q.endsOn}::date)::text as tips`);
    expect(q.servicesCount).toBe(Number(expected[0]!.services));
    expect(q.tipsCents).toBe(Number(expected[0]!.tips));
    expect(["en-curso", "calculated", "approved", "paid"]).toContain(q.status);
  }, 60_000);
});
