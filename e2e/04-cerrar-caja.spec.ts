import { test, expect } from "@playwright/test";
import { loginAs, SEED } from "./helpers";
import { restoreCashState, snapshotCashState, type CashSnapshot } from "./db-helpers";

/**
 * F2-25 · Flujo critico 4/4 (PRD §15): CERRAR CAJA.
 *
 * Login como gerente de Naco, ir a Caja (`/sede/<locationId>/register`); si
 * no hay caja abierta la abre primero (F2-20), despues la cierra (F2-23) y
 * confirma que la pantalla de cierre muestra el cuadre esperado/contado.
 *
 * Limpieza: este spec CIERRA la caja abierta del seed (`...1001`), o abre y
 * cierra una propia. `beforeAll` toma una foto de las cajas de Naco y
 * `afterAll` la restaura: reabre la del seed (closed_at/expected/counted/
 * difference/closed_by vuelven a su valor), borra la que haya creado el spec y
 * las filas de audit_log `cash.open`/`cash.close` que generaron. Asi 03 y 07
 * (que necesitan caja abierta) no dependen del orden de ejecucion.
 */
let cashBefore: CashSnapshot;

test.beforeAll(async () => {
  cashBefore = await snapshotCashState();
});

test.afterAll(async () => {
  await restoreCashState(cashBefore);
});

test("un gerente abre (si hace falta) y cierra la caja del dia, viendo el cuadre", async ({ page }) => {
  await loginAs(page, SEED.adminNaco);

  await page.goto(`/sede/${SEED.naco}/register`);
  await expect(page.getByRole("heading", { name: "Caja", exact: true })).toBeVisible();

  const openHeading = page.getByRole("heading", { name: "Abrir caja" });
  if (await openHeading.isVisible().catch(() => false)) {
    await page.getByLabel("Monto inicial en efectivo", { exact: true }).fill("2000");
    await page.getByRole("button", { name: "Abrir caja" }).click();
  }

  await expect(page.getByRole("heading", { name: "Cerrar caja" })).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Efectivo contado", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "Cerrar caja" }).click();

  // Pantalla de cierre: cuadre esperado vs. contado, con el descuadre.
  await expect(page.getByRole("heading", { name: "Caja cerrada" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Esperado (efectivo)")).toBeVisible();
  await expect(page.getByText("Contado")).toBeVisible();
  await expect(page.getByText("Descuadre")).toBeVisible();
});
