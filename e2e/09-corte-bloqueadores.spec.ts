import { randomUUID } from "node:crypto";

import { test, expect } from "@playwright/test";
import { and, eq, inArray, sql } from "drizzle-orm";

import { loginAs } from "./helpers";
import { testDb, SEED_IDS } from "./db-helpers";
import { auditLog, cashSessions, payoutLines, payoutPeriods } from "../src/lib/db/schema";
import { formatQuincenaLabel, previousQuincena, quincenaContaining, todayIsoInTimezone } from "../src/lib/payouts/period";

/**
 * F3-20 · Complemento del flujo critico "cerrar periodo" (08-corte-quincena
 * cubre crear -> calcular -> descuento sin motivo -> cerrar -> pagar). Aqui:
 *  1. Bloqueador `open_cash`: una caja abierta DENTRO del rango (la inserta
 *     este test en Bella Vista; Naco ya tiene una abierta de hoy en el seed y el
 *     indice parcial permite solo una por sede) impide cerrar el corte, el boton
 *     dice por que, y al cuadrarla (closed_at) el bloqueador desaparece.
 *  2. Una quincena que todavia corre se puede calcular (vista previa) pero NO
 *     cerrar: el panel dice cuando termina.
 *
 * Limpieza: periodos (lineas por cascade), audit_log de periodos/lineas y la
 * caja insertada. La BD queda identica al seed. Corre en serie despues de 08
 * (workers: 1), que borra y recrea su propio periodo de la misma quincena.
 */
const OWNER = "owner@donbigote.test";
const BELLA_VISTA = "00000000-0000-0000-0000-000000000302";

const today = todayIsoInTimezone(new Date(), "America/Santo_Domingo");
const current = quincenaContaining(today)!;
const previous = previousQuincena(current)!;
const PREV_LABEL = formatQuincenaLabel(previous.startsOn, previous.endsOn);

const cashId = randomUUID();
const currentPeriodId = randomUUID();

async function purge() {
  const periods = await testDb
    .select({ id: payoutPeriods.id })
    .from(payoutPeriods)
    .where(
      and(
        eq(payoutPeriods.chainId, SEED_IDS.chainId),
        inArray(payoutPeriods.startsOn, [previous.startsOn, current.startsOn]),
      ),
    );
  const ids = periods.map((p) => p.id);
  if (ids.length > 0) {
    const lines = await testDb.select({ id: payoutLines.id }).from(payoutLines).where(inArray(payoutLines.payoutPeriodId, ids));
    await testDb.delete(auditLog).where(inArray(auditLog.entityId, [...ids, ...lines.map((l) => l.id)]));
    await testDb.delete(payoutPeriods).where(inArray(payoutPeriods.id, ids));
  }
  await testDb.delete(auditLog).where(eq(auditLog.entityId, cashId));
  await testDb.delete(cashSessions).where(eq(cashSessions.id, cashId));
}

test.beforeAll(async () => {
  await purge();
});
test.afterAll(async () => {
  await purge();
});

test.describe.serial("Corte de Quincena: bloqueadores", () => {
  test("una caja abierta dentro del rango bloquea el cierre, el boton dice por que, y al cuadrarla se libera", async ({ page }) => {
    test.setTimeout(180_000);

    await testDb.execute(sql`
      insert into cash_sessions (id, location_id, opened_by, opened_at, opening_amount)
      values (${cashId}, ${BELLA_VISTA}, ${SEED_IDS.adminNacoId}, (${previous.startsOn}::text || ' 08:00:00-04')::timestamptz, '1000.00')`);

    await loginAs(page, OWNER);
    await page.goto("/commissions/periods");
    await page.getByRole("combobox", { name: "Crear el corte de" }).click();
    await page.getByRole("option", { name: PREV_LABEL }).click();
    await page.getByRole("button", { name: "Crear corte" }).click();
    await page.waitForURL(/\/commissions\/periods\/[0-9a-f-]{36}$/);

    await page.getByRole("button", { name: "Calcular el corte" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Corte calculado." })).toBeVisible({ timeout: 60_000 });

    const blocker = page.locator('[data-blocker="open_cash"]');
    await expect(blocker).toBeVisible();
    await expect(blocker).toContainText("caja sigue abierta");
    await expect(page.getByRole("button", { name: "Cerrar el corte" })).toBeDisabled();
    await expect(page.locator("#close-blocked-reasons")).toContainText("No se puede cerrar el corte todavía");

    // Se cuadra la caja (equivale a cerrarla desde El Cuadre) y el bloqueador se va.
    await testDb
      .update(cashSessions)
      .set({ closedAt: new Date(), closedBy: SEED_IDS.adminNacoId, expectedCash: "1000.00", countedCash: "1000.00", difference: "0.00" })
      .where(eq(cashSessions.id, cashId));
    await page.reload();
    await expect(page.locator('[data-blocker="open_cash"]')).toHaveCount(0);
  });

  test("una quincena que todavia corre se puede calcular pero no cerrar", async ({ page }) => {
    test.setTimeout(120_000);
    // La quincena en curso solo es "futura" mientras hoy < ends_on; el ultimo dia de la quincena no aplica.
    test.skip(today >= current.endsOn, "hoy es el ultimo dia de la quincena: ya se puede cerrar");

    await testDb.insert(payoutPeriods).values({
      id: currentPeriodId,
      chainId: SEED_IDS.chainId,
      startsOn: current.startsOn,
      endsOn: current.endsOn,
      status: "open",
    });

    await loginAs(page, OWNER);
    await page.goto(`/commissions/periods/${currentPeriodId}`);
    await page.getByRole("button", { name: "Calcular el corte" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Corte calculado." })).toBeVisible({ timeout: 60_000 });

    await expect(page.getByText("todavía está corriendo")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cerrar el corte" })).toBeDisabled();

    const [row] = await testDb.select({ status: payoutPeriods.status }).from(payoutPeriods).where(eq(payoutPeriods.id, currentPeriodId));
    expect(row?.status).toBe("calculated"); // calcular como vista previa si; aprobar no
  });
});
