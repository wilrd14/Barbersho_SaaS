import { afterAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

import type { SessionContext } from "@/lib/auth/session";
import { IDS, superuserSession } from "@/lib/payouts/__tests__/fixtures";

/**
 * F3-20 · Aislamiento entre cadenas e inmutabilidad de un corte PAGADO, por
 * llamada directa a las Server Actions (como lo haria un atacante sin la UI),
 * contra el Supabase real. Complementa payout-periods.integration.test.ts, que
 * cubre el ciclo feliz, los roles y la inmutabilidad de un corte `approved`.
 * Quincenas de 2021 (sin ventas) y limpieza por ID de lo que se crea.
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

const OTHER_CHAIN = "00000000-0000-0000-0000-00000000dead";
const periodIds: string[] = [];

/** Superuser de OTRA cadena: misma forma que `superuserSession()` pero con otra cadena activa. */
function otherChainSuperuser(): SessionContext {
  return {
    authenticated: true,
    userId: "00000000-0000-0000-0000-00000000d00d",
    email: "dueno@otra-cadena.test",
    memberships: [{ chainId: OTHER_CHAIN, role: "superuser", isActive: true, createdAt: "2024-01-01" }],
    barberLocations: [],
    activeChainId: OTHER_CHAIN,
    activeRole: "superuser",
    scope: "chain",
  };
}

async function actions() {
  return await import("@/lib/actions/payout-periods");
}

afterAll(async () => {
  if (periodIds.length === 0) return;
  const { db } = await import("@/lib/db/client");
  const { auditLog, payoutLines, payoutPeriods } = await import("@/lib/db/schema");
  const lines = await db.select({ id: payoutLines.id }).from(payoutLines).where(inArray(payoutLines.payoutPeriodId, periodIds));
  const entityIds = [...periodIds, ...lines.map((l) => l.id)];
  await db.delete(auditLog).where(inArray(auditLog.entityId, entityIds));
  await db.delete(payoutPeriods).where(inArray(payoutPeriods.id, periodIds));
});

describe("aislamiento entre cadenas del ciclo del periodo (F3-20, llamada directa, DB real)", () => {
  it("el superuser de OTRA cadena no puede calcular, aprobar, pagar ni ajustar un corte ajeno: 'no existe en tu cadena'", async () => {
    sessionMock.mockResolvedValue(superuserSession());
    const a = await actions();
    const created = await a.createPayoutPeriodAction({ startsOn: "2021-01-01", endsOn: "2021-01-15" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const periodId = created.data.periodId;
    periodIds.push(periodId);
    expect((await a.calculatePayoutPeriodAction({ periodId })).ok).toBe(true);

    sessionMock.mockResolvedValue(otherChainSuperuser());
    const notFound = { ok: false, error: expect.stringContaining("no existe") };
    expect(await a.calculatePayoutPeriodAction({ periodId })).toEqual(notFound);
    expect(await a.approvePayoutPeriodAction({ periodId })).toEqual(notFound);
    expect(await a.markPayoutPeriodPaidAction({ periodId })).toEqual(notFound);
    expect(await a.adjustPayoutLineAction({ periodId, lineId: IDS.b1, amountCents: 100, note: "no debe pasar" })).toEqual(notFound);

    // El corte ajeno sigue intacto: `calculated`, sin aprobar.
    const { db } = await import("@/lib/db/client");
    const { payoutPeriods } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(payoutPeriods).where(eq(payoutPeriods.id, periodId));
    expect(row!.status).toBe("calculated");
    expect(row!.approvedBy).toBeNull();
  }, 60_000);

  it("las lecturas de la otra cadena no listan ni muestran el corte ajeno (lista vacia, detalle null)", async () => {
    sessionMock.mockResolvedValue(superuserSession());
    const a = await actions();
    const created = await a.createPayoutPeriodAction({ startsOn: "2021-02-01", endsOn: "2021-02-15" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const periodId = created.data.periodId;
    periodIds.push(periodId);

    const q = await import("@/lib/payouts/queries-periods");
    sessionMock.mockResolvedValue(otherChainSuperuser());
    const page = await q.loadPeriodsPageData();
    expect(page.periods).toEqual([]);
    expect(await q.loadPeriodDetail(periodId)).toBeNull();

    sessionMock.mockResolvedValue(superuserSession());
    const own = await q.loadPeriodDetail(periodId);
    expect(own?.id).toBe(periodId);
  }, 60_000);
});

describe("un corte PAGADO es inmutable por llamada directa (F3-20, regla dura §3.10)", () => {
  it("pagado: recalcular, ajustar, re-aprobar y re-pagar se rechazan, y no se puede crear un corte que lo solape para 'reabrirlo'", async () => {
    sessionMock.mockResolvedValue(superuserSession());
    const a = await actions();
    const created = await a.createPayoutPeriodAction({ startsOn: "2021-03-01", endsOn: "2021-03-15" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const periodId = created.data.periodId;
    periodIds.push(periodId);

    expect((await a.calculatePayoutPeriodAction({ periodId })).ok).toBe(true);
    expect((await a.approvePayoutPeriodAction({ periodId })).ok).toBe(true);
    expect((await a.markPayoutPeriodPaidAction({ periodId })).ok).toBe(true);

    const rejected = { ok: false, error: expect.stringMatching(/pagado|aprobado/) };
    expect(await a.calculatePayoutPeriodAction({ periodId })).toEqual(rejected);
    expect(await a.approvePayoutPeriodAction({ periodId })).toEqual(rejected);
    expect(await a.markPayoutPeriodPaidAction({ periodId })).toEqual(rejected);
    expect(await a.adjustPayoutLineAction({ periodId, lineId: IDS.b1, amountCents: 100, note: "no debe pasar" })).toEqual(rejected);
    expect(await a.createPayoutPeriodAction({ startsOn: "2021-03-01", endsOn: "2021-03-15" })).toEqual({
      ok: false,
      error: expect.stringContaining("Ya existe un corte que se cruza"),
    });

    // Sigue pagado y con el mismo sello.
    const { db } = await import("@/lib/db/client");
    const { payoutPeriods } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(payoutPeriods).where(eq(payoutPeriods.id, periodId));
    expect(row!.status).toBe("paid");
    expect(row!.approvedBy).toBe(IDS.owner);
  }, 60_000);
});
