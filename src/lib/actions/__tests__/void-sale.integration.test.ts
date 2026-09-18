import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import type { SessionContext } from "@/lib/auth/session";

/**
 * Auditoria post-F2-25: F2-22, anular venta el mismo dia (`voidSaleAction`,
 * `src/lib/actions/checkout.ts`) — camino de escritura/auditoria dentro de
 * una transaccion que los 4 E2E originales de F2-25 nunca ejercitaron, y
 * que ademas **no tiene ningun boton conectado en la UI todavia** (se
 * confirmo con `grep "voidSaleAction"` en `src/`: solo aparece en
 * `checkout.ts`, ningun componente lo invoca). Por eso este test es Vitest
 * de integracion en vez de Playwright — no hay pantalla real que ejercitar
 * — pero SIGUE corriendo contra la DB real (misma `DATABASE_URL` de
 * `.env.local`, cargada por `vitest.setup.ts`), no una base mockeada: crea
 * una venta real con `createSaleAction`, la anula con `voidSaleAction`, y
 * verifica en la DB real que el `status` queda `refunded` y que
 * `audit_log` tiene `before`/`after` correctos.
 *
 * Solo se mockea `getSessionContext` (la capa que en produccion lee la
 * cookie de Supabase Auth) para simular la sesion de `admin.naco` sin
 * depender de un navegador — el mismo patron que
 * `src/lib/auth/__tests__/guards.test.ts` ya usa. `requireLocationScope`
 * (guards.ts) corre igual de real contra la DB para resolver la sede; lo
 * unico simulado es "quien esta autenticado", no la logica de negocio ni
 * la escritura.
 *
 * Timeout explicito de 20s en cada `it`: red de seguridad contra un
 * deadlock silencioso (regresion del bug de F2-25 en `writeAuditLog`, que
 * colgaba exactamente este tipo de escritura sin dar ningun error).
 */

const getSessionContextMock = vi.fn<() => Promise<SessionContext>>();
vi.mock("@/lib/auth/session", () => ({
  getSessionContext: () => getSessionContextMock(),
}));

const CHAIN_ID = "00000000-0000-0000-0000-000000000001";
const NACO = "00000000-0000-0000-0000-000000000301";
const ADMIN_NACO_ID = "00000000-0000-0000-0000-000000000011";
const SERVICE_CORTE = "00000000-0000-0000-0000-000000000401";
const BARBERO1 = "00000000-0000-0000-0000-000000000101";

function mockAdminNacoSession() {
  getSessionContextMock.mockResolvedValue({
    authenticated: true,
    userId: ADMIN_NACO_ID,
    email: "admin.naco@donbigote.test",
    memberships: [{ chainId: CHAIN_ID, role: "admin", isActive: true, createdAt: "2024-01-01" }],
    barberLocations: [{ locationId: NACO, isPrimary: true, isActive: true }],
    activeChainId: CHAIN_ID,
    activeRole: "admin",
    scope: "chain",
  });
}

describe("voidSaleAction — F2-22, integracion real contra la DB", () => {
  let saleId: string | undefined;
  let clientId: string | undefined;
  let openedCashSessionId: string | undefined;

  beforeAll(async () => {
    mockAdminNacoSession();

    // `createSaleAction` exige caja abierta (D-F2-9). El seed (F2-24) deja
    // una abierta hoy en Naco, pero otro spec (E2E de "cerrar caja") puede
    // haberla cerrado antes de que corra este archivo — se abre una nueva
    // si hace falta, igual que hace `e2e/03-cobrar.spec.ts` en la UI.
    const { db } = await import("@/lib/db/client");
    const { cashSessions } = await import("@/lib/db/schema");
    const { isNull, and: andOp } = await import("drizzle-orm");
    const [openSession] = await db
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(andOp(eq(cashSessions.locationId, NACO), isNull(cashSessions.closedAt)))
      .limit(1);

    if (!openSession) {
      const { openCashSessionAction } = await import("@/lib/actions/cash-register");
      const opened = await openCashSessionAction({ locationId: NACO, openingAmountCents: 200_000 });
      if (!opened.ok) throw new Error(`No se pudo abrir caja para el test: ${opened.error}`);
      openedCashSessionId = opened.data.cashSessionId;
    }
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db/client");
    const { auditLog, cashSessions, clients, saleItems, sales } = await import("@/lib/db/schema");
    if (saleId) {
      await db.delete(auditLog).where(eq(auditLog.entityId, saleId));
      await db.delete(saleItems).where(eq(saleItems.saleId, saleId));
      await db.delete(sales).where(eq(sales.id, saleId));
    }
    if (clientId) {
      await db.delete(clients).where(eq(clients.id, clientId));
    }
    // Solo se limpia la caja que este archivo abrio — si ya habia una
    // abierta (seed o Playwright), no se toca, no es nuestra.
    if (openedCashSessionId) {
      await db.delete(auditLog).where(eq(auditLog.entityId, openedCashSessionId));
      await db.delete(cashSessions).where(eq(cashSessions.id, openedCashSessionId));
    }
  });

  it("crea una venta libre en efectivo y la anula: status queda 'refunded' con audit_log antes/despues", async () => {
    const { createSaleAction, voidSaleAction } = await import("@/lib/actions/checkout");
    const { db } = await import("@/lib/db/client");
    const { auditLog, sales } = await import("@/lib/db/schema");

    const created = await createSaleAction({
      locationId: NACO,
      idempotencyKey: randomUUID(),
      newClient: { fullName: "E2E Anular Venta", phone: `809555${Date.now().toString().slice(-4)}` },
      lines: [{ serviceId: SERVICE_CORTE, barberId: BARBERO1, quantity: 1 }],
      discount: { kind: "none" },
      tip: { kind: "none" },
      paymentMethod: "cash",
    });

    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(`createSaleAction fallo: ${created.error}`);
    saleId = created.data.saleId;

    const [saleRow] = await db.select({ clientId: sales.clientId }).from(sales).where(eq(sales.id, saleId)).limit(1);
    clientId = saleRow?.clientId;

    const voided = await voidSaleAction({
      locationId: NACO,
      saleId,
      reason: "E2E: prueba de anulacion",
    });

    expect(voided.ok).toBe(true);
    if (!voided.ok) throw new Error(`voidSaleAction fallo: ${voided.error}`);
    expect(voided.data.saleId).toBe(saleId);

    const [row] = await db.select({ status: sales.status }).from(sales).where(eq(sales.id, saleId)).limit(1);
    expect(row?.status).toBe("refunded");

    const [audit] = await db
      .select({ before: auditLog.before, after: auditLog.after })
      .from(auditLog)
      .where(and(eq(auditLog.entityId, saleId), eq(auditLog.action, "sale.refund")))
      .limit(1);
    expect(audit).toBeTruthy();
    expect((audit?.before as { status?: string } | null)?.status).toBe("paid");
    expect((audit?.after as { status?: string } | null)?.status).toBe("refunded");
  }, 20_000);

  it("anular una venta ya anulada devuelve un error legible en espanol, no un colgado", async () => {
    const { voidSaleAction } = await import("@/lib/actions/checkout");
    if (!saleId) throw new Error("El test anterior no dejo una venta creada — no se puede reintentar la anulacion.");

    const result = await voidSaleAction({ locationId: NACO, saleId, reason: "Segundo intento" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/ya fue anulada/i);
  }, 20_000);
});
