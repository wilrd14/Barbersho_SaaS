import { afterAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

import type { SessionContext } from "@/lib/auth/session";
import { IDS, adminNacoSession, barberSession, superuserSession } from "@/lib/payouts/__tests__/fixtures";

/**
 * F3-05 · Las Server Actions del ciclo del periodo, llamadas DIRECTAMENTE (como
 * lo haria un atacante o un cliente sin la UI): permisos por rol, Zod con
 * zUuid, inmutabilidad y auditoria, contra el Supabase real. Solo se simula
 * "quien esta autenticado"; guards, transacciones y audit_log son reales.
 * Usa quincenas de 2020 (sin ventas, ya pasadas) y borra por ID lo que crea.
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

const periodIds: string[] = [];

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

describe("Server Actions del ciclo del periodo (F3-05, llamada directa, DB real)", () => {
  it("un superuser recorre create -> calculate -> approve -> markPaid y cada paso deja su fila en audit_log", async () => {
    sessionMock.mockResolvedValue(superuserSession());
    const a = await actions();

    const created = await a.createPayoutPeriodAction({ startsOn: "2020-05-01", endsOn: "2020-05-15" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const periodId = created.data.periodId;
    periodIds.push(periodId);

    // El mismo rango otra vez: rechazo legible (no un error crudo de Postgres).
    expect(await a.createPayoutPeriodAction({ startsOn: "2020-05-01", endsOn: "2020-05-15" })).toEqual({
      ok: false,
      error: expect.stringContaining("Ya existe un corte que se cruza"),
    });

    expect((await a.calculatePayoutPeriodAction({ periodId })).ok).toBe(true);
    expect((await a.calculatePayoutPeriodAction({ periodId })).ok).toBe(true); // recalculable
    const approved = await a.approvePayoutPeriodAction({ periodId });
    expect(approved.ok).toBe(true);

    // Aprobado: por llamada directa, recalcular y ajustar se rechazan; aprobar de nuevo tambien.
    const immutable = { ok: false, error: expect.stringContaining("ya está aprobado") };
    expect(await a.calculatePayoutPeriodAction({ periodId })).toEqual(immutable);
    expect(await a.approvePayoutPeriodAction({ periodId })).toEqual(immutable);
    expect(
      await a.adjustPayoutLineAction({ periodId, lineId: IDS.b1, amountCents: 100, note: "no debe pasar" }),
    ).toEqual(immutable);

    expect((await a.markPayoutPeriodPaidAction({ periodId })).ok).toBe(true);
    expect(await a.markPayoutPeriodPaidAction({ periodId })).toEqual({ ok: false, error: expect.stringContaining("ya está marcado como pagado") });

    const { db } = await import("@/lib/db/client");
    const { auditLog } = await import("@/lib/db/schema");
    const { eq, asc } = await import("drizzle-orm");
    const audits = await db.select({ action: auditLog.action, actor: auditLog.actorUserId }).from(auditLog).where(eq(auditLog.entityId, periodId)).orderBy(asc(auditLog.createdAt));
    expect(audits.map((x) => x.action)).toEqual([
      "payout.create",
      "payout.calculate",
      "payout.calculate",
      "payout.approve",
      "payout.mark_paid",
    ]);
    expect(new Set(audits.map((x) => x.actor))).toEqual(new Set([IDS.owner]));
  }, 60_000);

  it("un admin PUEDE calcular (con el locationId de su sede) pero recibe 403 al aprobar, marcar pagado, crear o ajustar", async () => {
    sessionMock.mockResolvedValue(superuserSession());
    const a = await actions();
    const created = await a.createPayoutPeriodAction({ startsOn: "2020-06-01", endsOn: "2020-06-15" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const periodId = created.data.periodId;
    periodIds.push(periodId);

    sessionMock.mockResolvedValue(adminNacoSession());
    const calc = await a.calculatePayoutPeriodAction({ periodId, locationId: IDS.naco });
    expect(calc.ok).toBe(true);

    await expect(a.approvePayoutPeriodAction({ periodId })).rejects.toThrow("FORBIDDEN_403");
    await expect(a.markPayoutPeriodPaidAction({ periodId })).rejects.toThrow("FORBIDDEN_403");
    await expect(a.createPayoutPeriodAction({ startsOn: "2020-07-01", endsOn: "2020-07-15" })).rejects.toThrow("FORBIDDEN_403");
    await expect(a.adjustPayoutLineAction({ periodId, lineId: IDS.b1, amountCents: 100, note: "nota" })).rejects.toThrow("FORBIDDEN_403");
    // Sin locationId el admin no tiene ambito de cadena; y con la sede de OTRO gerente tampoco.
    await expect(a.calculatePayoutPeriodAction({ periodId })).rejects.toThrow("FORBIDDEN_403");
    await expect(a.calculatePayoutPeriodAction({ periodId, locationId: IDS.bellaVista })).rejects.toThrow("FORBIDDEN_403");

    // El periodo sigue `calculated` (aprobar no ocurrio).
    const { db } = await import("@/lib/db/client");
    const { payoutPeriods } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(payoutPeriods).where(eq(payoutPeriods.id, periodId));
    expect(row!.status).toBe("calculated");
    expect(row!.approvedBy).toBeNull();
  }, 60_000);

  it("un barbero recibe 403 en TODAS las acciones del ciclo, incluso pasando el locationId de su sede", async () => {
    sessionMock.mockResolvedValue(barberSession(IDS.b1, [IDS.naco]));
    const a = await actions();
    const periodId = IDS.ruleDefault; // cualquier UUID valido: el guard corta antes de tocar nada
    await expect(a.createPayoutPeriodAction({ startsOn: "2020-08-01", endsOn: "2020-08-15" })).rejects.toThrow("FORBIDDEN_403");
    await expect(a.approvePayoutPeriodAction({ periodId })).rejects.toThrow("FORBIDDEN_403");
    await expect(a.markPayoutPeriodPaidAction({ periodId })).rejects.toThrow("FORBIDDEN_403");
    await expect(a.calculatePayoutPeriodAction({ periodId })).rejects.toThrow("FORBIDDEN_403");
    // Con locationId el guard de sede lo deja pasar como "barber_assigned", pero el rol de gerente lo frena.
    expect(await a.calculatePayoutPeriodAction({ periodId, locationId: IDS.naco })).toEqual({
      ok: false,
      error: "Esta accion es solo para el gerente de la sede.",
    });
  });

  it("valida la entrada con Zod y zUuid: ids basura, fechas basura, ajuste fuera de rango; acepta los ids del seed", async () => {
    sessionMock.mockResolvedValue(superuserSession());
    const a = await actions();
    expect(await a.calculatePayoutPeriodAction({ periodId: "no-es-un-uuid" })).toEqual({ ok: false, error: "UUID invalido" });
    expect(await a.createPayoutPeriodAction({ startsOn: "hoy", endsOn: "2020-01-15" })).toEqual({
      ok: false,
      error: expect.stringContaining("AAAA-MM-DD"),
    });
    expect(await a.createPayoutPeriodAction({ startsOn: "2020-01-02", endsOn: "2020-01-15" })).toEqual({
      ok: false,
      error: expect.stringContaining("quincena calendario"),
    });
    // ID con formato del seed (no cumple los nibbles RFC) pasa la validacion y llega a la logica: "no existe".
    expect(await a.approvePayoutPeriodAction({ periodId: "00000000-0000-0000-0000-000000000abc" })).toEqual({
      ok: false,
      error: expect.stringContaining("no existe"),
    });
    expect(
      await a.adjustPayoutLineAction({ periodId: IDS.ruleDefault, lineId: IDS.b1, amountCents: 1.5, note: "x" }),
    ).toEqual({ ok: false, error: expect.any(String) });
  });
});
