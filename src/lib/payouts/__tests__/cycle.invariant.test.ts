import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db/client";
import { auditLog, payoutPeriods } from "@/lib/db/schema";
import { calculatePeriodInTx, createPeriodInTx, loadStoredLines, type PayoutTx } from "@/lib/payouts/cycle";

import { IDS } from "./fixtures";

/**
 * F3-05 · Regla dura §3.7 / D-F3-11: si el invariante de cuadre NO cuadra, el
 * calculo no guarda nada, escribe `payout.calculate_failed` con las cifras y el
 * periodo NO cambia de estado. El motor real nunca produce un descuadre (lo
 * demuestra su propiedad con 300 periodos aleatorios), asi que aqui se FUERZA
 * un descuadre reemplazando solo `verifyPayoutInvariant` por una version que
 * reporta un centavo de diferencia; todo lo demas (DB, transaccion, auditoria)
 * es real.
 */
let forceMismatch = false;

vi.mock("@/lib/commissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/commissions")>();
  return {
    ...actual,
    verifyPayoutInvariant: (input: Parameters<typeof actual.verifyPayoutInvariant>[0]) => {
      if (!forceMismatch) return actual.verifyPayoutInvariant(input);
      const figure = {
        locationId: IDS.naco,
        expectedRevenueCents: 100000,
        actualRevenueCents: 99999,
        expectedTipsCents: 0,
        actualTipsCents: 0,
      };
      return { ok: false as const, error: "El calculo no cuadra al centavo (prueba).", figures: [figure], mismatches: [figure] };
    },
  };
});

const ROLLBACK = "__rollback__";
const scopeArgs = { chainId: IDS.chain, actorUserId: IDS.owner };

async function inRolledBackTx<T>(fn: (tx: PayoutTx) => Promise<T>): Promise<T> {
  let result!: T;
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx);
      throw new Error(ROLLBACK);
    });
  } catch (err) {
    if (!(err instanceof Error) || err.message !== ROLLBACK) throw err;
  }
  return result;
}

async function insertPaidSale(tx: PayoutTx) {
  const id = randomUUID();
  await tx.execute(sql`
    insert into sales (id, chain_id, location_id, client_id, barber_id, subtotal, discount_amount, tip_amount, total, payment_method, status, created_by, created_at)
    values (${id}, ${IDS.chain}, ${IDS.naco}, ${IDS.client}, ${IDS.b1}, '1000.00', '0', '0', '1000.00', 'cash', 'paid', ${IDS.adminNaco}, '2020-03-03 10:00:00-04'::timestamptz)`);
  await tx.execute(sql`
    insert into sale_items (id, sale_id, type, service_id, quantity, unit_price, line_total, barber_id)
    values (${randomUUID()}, ${id}, 'service', ${IDS.serviceCorte}, 1, '1000.00', '1000.00', ${IDS.b1})`);
}

describe("invariante de cuadre en runtime (F3-05, D-F3-11)", () => {
  it("un descuadre aborta el calculo: no cambia el estado, no guarda lineas y audita calculate_failed con las cifras", async () => {
    await inRolledBackTx(async (tx) => {
      await insertPaidSale(tx);
      const created = await createPeriodInTx(tx, { ...scopeArgs, startsOn: "2020-03-01", endsOn: "2020-03-15" });
      if (!created.ok) throw new Error(created.error);
      const periodId = created.data.periodId;

      // Primero un calculo valido (el invariante real cuadra).
      forceMismatch = false;
      const ok = await calculatePeriodInTx(tx, { ...scopeArgs, periodId });
      expect(ok.ok).toBe(true);
      const linesBefore = await loadStoredLines(tx, periodId);
      expect(linesBefore).toHaveLength(1);

      // Ahora el invariante no cuadra: el recalculo aborta y conserva lo anterior.
      forceMismatch = true;
      try {
        const failed = await calculatePeriodInTx(tx, { ...scopeArgs, periodId });
        expect(failed).toEqual({ ok: false, error: expect.stringContaining("No se guardó nada") });
      } finally {
        forceMismatch = false;
      }
      const [row] = await tx.select().from(payoutPeriods).where(eq(payoutPeriods.id, periodId));
      expect(row!.status).toBe("calculated");
      expect(await loadStoredLines(tx, periodId)).toEqual(linesBefore);

      const failAudit = (
        await tx.select({ action: auditLog.action, after: auditLog.after }).from(auditLog).where(eq(auditLog.entityId, periodId))
      ).find((a) => a.action === "payout.calculate_failed");
      expect(failAudit!.after).toMatchObject({
        reason: "invariant",
        figures: [{ locationId: IDS.naco, expectedRevenueCents: 100000, actualRevenueCents: 99999 }],
      });
    });
  }, 40_000);

  it("en un periodo open, un descuadre lo deja open y sin lineas", async () => {
    await inRolledBackTx(async (tx) => {
      await insertPaidSale(tx);
      const created = await createPeriodInTx(tx, { ...scopeArgs, startsOn: "2020-03-01", endsOn: "2020-03-15" });
      if (!created.ok) throw new Error(created.error);
      forceMismatch = true;
      try {
        const failed = await calculatePeriodInTx(tx, { ...scopeArgs, periodId: created.data.periodId });
        expect(failed.ok).toBe(false);
      } finally {
        forceMismatch = false;
      }
      const [row] = await tx.select().from(payoutPeriods).where(eq(payoutPeriods.id, created.data.periodId));
      expect(row).toMatchObject({ status: "open", calculatedAt: null });
      expect(await loadStoredLines(tx, created.data.periodId)).toHaveLength(0);
    });
  }, 40_000);
});
