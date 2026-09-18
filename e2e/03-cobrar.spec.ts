import { test, expect } from "@playwright/test";
import { loginAs, SEED, uniqueRdPhone } from "./helpers";
import {
  findE2eClientIds,
  purgeClients,
  restoreCashState,
  snapshotCashState,
  type CashSnapshot,
} from "./db-helpers";

/**
 * F2-25 · Flujo critico 3/4 (PRD §15): COBRAR.
 *
 * Login como gerente de Naco, ir a Cobrar (`/sede/<locationId>/checkout`),
 * completar un cobro en efectivo como venta libre (cliente nuevo, servicio
 * por defecto) y confirmar la pantalla de "Cobro registrado" (F2-21).
 *
 * Requiere que el seed tenga una caja abierta hoy en Naco (F2-24 la deja
 * abierta) — si no la hay, este test la abre el mismo (mismo camino que
 * cubre F2-20).
 *
 * Limpieza: el cobro crea un cliente (telefono unico), una venta con su
 * sale_item y audit_log `sale.create`; si el test abrio una caja, tambien esa
 * caja y su `cash.open`. `beforeAll` toma una foto de las cajas de Naco y
 * `afterAll` deja todo como estaba (ver `restoreCashState`).
 */
const PHONE = uniqueRdPhone();
let cashBefore: CashSnapshot;

test.beforeAll(async () => {
  cashBefore = await snapshotCashState();
});

test.afterAll(async () => {
  await purgeClients(await findE2eClientIds({ phone: PHONE }));
  await restoreCashState(cashBefore);
});

test("un gerente cobra un servicio en efectivo y ve la confirmacion", async ({ page }) => {
  await loginAs(page, SEED.adminNaco);

  await page.goto(`/sede/${SEED.naco}/checkout`);

  // Si no hay caja abierta, la pantalla ofrece ir a abrirla primero.
  const goToRegister = page.getByRole("link", { name: "Ir a caja" });
  if (await goToRegister.isVisible().catch(() => false)) {
    await goToRegister.click();
    await page.getByLabel("Monto inicial en efectivo", { exact: true }).fill("2000");
    await page.getByRole("button", { name: "Abrir caja" }).click();
    await expect(page.getByRole("heading", { name: "Cerrar caja" })).toBeVisible({ timeout: 10_000 });
    await page.goto(`/sede/${SEED.naco}/checkout`);
  }

  await expect(page.getByRole("heading", { name: "Cobrar" })).toBeVisible();

  // Venta libre, cliente nuevo (no entra por ?appointmentId=).
  await page.getByRole("button", { name: "Cliente nuevo" }).click();
  await page.getByLabel("Nombre completo", { exact: true }).fill("Cliente E2E Cobrar");
  await page.getByLabel("Telefono", { exact: true }).fill(PHONE);

  // Linea de servicio con su default (primer servicio/barbero del catalogo).
  await page.getByRole("button", { name: /^Cobrar RD\$/ }).click();

  await expect(page.getByText("Cobro registrado.")).toBeVisible({ timeout: 10_000 });
});
