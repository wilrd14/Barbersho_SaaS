import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { SessionContext } from "@/lib/auth/session";
import { IDS, adminNacoSession, barberSession } from "@/lib/payouts/__tests__/fixtures";

/**
 * F3-09 · Anular una venta y su efecto en el dinero, contra el Supabase REAL.
 * (El boton "Anular" ya estaba conectado en F2-22 — ver CHANGELOG — y
 * `e2e/07-anular-venta.spec.ts` lo ejercita en el navegador; aqui se cubren los
 * criterios de F3-09 que ese E2E no toca:)
 *  - el efectivo esperado del cuadre baja EXACTAMENTE el monto de la venta;
 *  - la venta anulada desaparece del calculo del periodo al recalcular;
 *  - un barbero recibe error si llama la accion directamente.
 * Limpieza por ID: audit_log, venta (lineas por cascade), cliente y, si la
 * abrio este archivo, la caja.
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

let saleId: string | undefined;
let clientId: string | undefined;
let openedCashSessionId: string | undefined;

async function expectedCashCents(): Promise<number> {
  // Misma formula que `closeCashSessionAction`: apertura + ventas en efectivo no anuladas de la caja.
  const { listOpenSessionSales, loadCashRegisterState } = await import("@/lib/actions/cash-register");
  const state = await loadCashRegisterState(IDS.naco);
  const sales = await listOpenSessionSales(IDS.naco);
  const cash = sales.filter((s) => s.paymentMethod === "cash" && s.status !== "refunded").reduce((sum, s) => sum + s.totalCents, 0);
  return state.openSession!.openingAmountCents + cash;
}

async function b1NacoLine() {
  const { db } = await import("@/lib/db/client");
  const { loadPayoutInputs } = await import("@/lib/commissions/load-payout-inputs");
  const { computePayoutLines } = await import("@/lib/commissions");
  const { quincenaContaining, todayIsoInTimezone } = await import("@/lib/payouts/period");
  const range = quincenaContaining(todayIsoInTimezone(new Date(), "America/Santo_Domingo"))!;
  const inputs = await loadPayoutInputs({ chainId: IDS.chain, startsOn: range.startsOn, endsOn: range.endsOn }, db);
  const result = computePayoutLines(inputs);
  if (!result.ok) throw new Error(result.error);
  return result.lines.find((l) => l.barberId === IDS.b1 && l.locationId === IDS.naco);
}

describe("anular venta -> efectivo esperado y calculo del periodo (F3-09, DB real)", () => {
  beforeAll(async () => {
    sessionMock.mockResolvedValue(adminNacoSession());
    const { db } = await import("@/lib/db/client");
    const { cashSessions } = await import("@/lib/db/schema");
    const { isNull } = await import("drizzle-orm");
    const [open] = await db
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(and(eq(cashSessions.locationId, IDS.naco), isNull(cashSessions.closedAt)))
      .limit(1);
    if (!open) {
      const { openCashSessionAction } = await import("@/lib/actions/cash-register");
      const opened = await openCashSessionAction({ locationId: IDS.naco, openingAmountCents: 200_000 });
      if (!opened.ok) throw new Error(opened.error);
      openedCashSessionId = opened.data.cashSessionId;
    }
  }, 60_000);

  afterAll(async () => {
    const { db } = await import("@/lib/db/client");
    const { auditLog, cashSessions, clients, sales } = await import("@/lib/db/schema");
    if (saleId) {
      await db.delete(auditLog).where(eq(auditLog.entityId, saleId));
      await db.delete(sales).where(eq(sales.id, saleId)); // sale_items: cascade
    }
    if (clientId) await db.delete(clients).where(eq(clients.id, clientId));
    if (openedCashSessionId) {
      await db.delete(auditLog).where(eq(auditLog.entityId, openedCashSessionId));
      await db.delete(cashSessions).where(eq(cashSessions.id, openedCashSessionId));
    }
  });

  it("anular baja el efectivo esperado exactamente ese monto y la venta sale del calculo del periodo; un barbero no puede anular", async () => {
    const { createSaleAction, voidSaleAction } = await import("@/lib/actions/checkout");
    const { db } = await import("@/lib/db/client");
    const { sales } = await import("@/lib/db/schema");
    const { centsFromDecimalString } = await import("@/lib/actions/money-utils");

    const lineBefore = await b1NacoLine();

    const created = await createSaleAction({
      locationId: IDS.naco,
      idempotencyKey: randomUUID(),
      newClient: { fullName: "E2E Anular Periodo", phone: `809555${Date.now().toString().slice(-4)}` },
      lines: [{ serviceId: IDS.serviceCorte, barberId: IDS.b1, quantity: 1 }],
      discount: { kind: "none" },
      tip: { kind: "none" },
      paymentMethod: "cash",
    });
    if (!created.ok) throw new Error(created.error);
    saleId = created.data.saleId;
    const [row] = await db.select({ clientId: sales.clientId, subtotal: sales.subtotal, total: sales.total }).from(sales).where(eq(sales.id, saleId));
    clientId = row!.clientId;
    const saleCents = centsFromDecimalString(row!.total);
    expect(saleCents).toBeGreaterThan(0);

    const expectedWithSale = await expectedCashCents();
    const lineWithSale = await b1NacoLine();
    expect(lineWithSale!.servicesCount).toBe((lineBefore?.servicesCount ?? 0) + 1);
    expect(lineWithSale!.servicesRevenueCents).toBe((lineBefore?.servicesRevenueCents ?? 0) + centsFromDecimalString(row!.subtotal));

    // Un barbero llamando la accion directamente: error, la venta sigue pagada.
    sessionMock.mockResolvedValue(barberSession(IDS.b1, [IDS.naco]));
    const denied = await voidSaleAction({ locationId: IDS.naco, saleId, reason: "intento de barbero" });
    expect(denied).toEqual({ ok: false, error: expect.stringContaining("solo para el gerente") });
    expect((await db.select({ s: sales.status }).from(sales).where(eq(sales.id, saleId)))[0]!.s).toBe("paid");

    // El gerente anula.
    sessionMock.mockResolvedValue(adminNacoSession());
    const voided = await voidSaleAction({ locationId: IDS.naco, saleId, reason: "E2E: anulacion de prueba" });
    expect(voided.ok).toBe(true);

    // El esperado del cuadre baja EXACTAMENTE lo que costaba la venta (era en efectivo).
    expect(await expectedCashCents()).toBe(expectedWithSale - saleCents);

    // Y la venta desaparece del calculo del periodo: la linea vuelve a lo de antes.
    const lineAfter = await b1NacoLine();
    expect(lineAfter?.servicesCount ?? 0).toBe(lineBefore?.servicesCount ?? 0);
    expect(lineAfter?.servicesRevenueCents ?? 0).toBe(lineBefore?.servicesRevenueCents ?? 0);
    expect(lineAfter?.commissionCents ?? 0).toBe(lineBefore?.commissionCents ?? 0);
    expect(lineAfter?.netPayableCents ?? 0).toBe(lineBefore?.netPayableCents ?? 0);
  }, 90_000);
});
