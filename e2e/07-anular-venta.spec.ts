import { test, expect } from "@playwright/test";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { loginAs, SEED, uniqueRdPhone } from "./helpers";
import { testDb, SEED_IDS } from "./db-helpers";
import { auditLog, cashSessions, clients, sales } from "../src/lib/db/schema";

/**
 * F2-22 · Anular una venta desde la UI (pantalla de Caja).
 *
 * `voidSaleAction` ya tenia test de integracion con Vitest, pero ninguna
 * pantalla lo llamaba. Este E2E cobra una venta libre en efectivo (cliente
 * nuevo con nombre unico), la anula desde el boton "Anular" de la lista de
 * ventas de la caja abierta (`/sede/<Naco>/register`), y verifica en la DB
 * real (no solo en pantalla) que `sales.status = 'refunded'` y que
 * `audit_log` tiene `sale.refund` con `before`/`after` y el motivo.
 *
 * Si no hay caja abierta al empezar (04-cerrar-caja la deja cerrada), el test
 * abre una por la UI y la BORRA al final; si ya habia una abierta (la del
 * seed), la deja como estaba. Limpia todo lo suyo: audit_log, venta (los
 * sale_items caen por cascade), cliente nuevo y, si la creo, la caja.
 */
const CLIENT_NAME = `Cliente E2E Anular ${Date.now()}`;
const REASON = "E2E: se cobro de mas por error";

let createdSessionId: string | null = null;

async function findOpenSessionId(): Promise<string | null> {
  const [row] = await testDb
    .select({ id: cashSessions.id })
    .from(cashSessions)
    .where(and(eq(cashSessions.locationId, SEED_IDS.naco), isNull(cashSessions.closedAt)))
    .limit(1);
  return row?.id ?? null;
}

test.afterAll(async () => {
  const testClients = await testDb
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.chainId, SEED_IDS.chainId), eq(clients.fullName, CLIENT_NAME)));
  const clientIds = testClients.map((c) => c.id);

  if (clientIds.length > 0) {
    const testSales = await testDb
      .select({ id: sales.id })
      .from(sales)
      .where(inArray(sales.clientId, clientIds));
    const saleIds = testSales.map((s) => s.id);
    if (saleIds.length > 0) {
      await testDb.delete(auditLog).where(inArray(auditLog.entityId, saleIds));
      await testDb.delete(sales).where(inArray(sales.id, saleIds)); // sale_items: cascade
    }
    await testDb.delete(clients).where(inArray(clients.id, clientIds));
  }

  if (createdSessionId) {
    await testDb.delete(auditLog).where(eq(auditLog.entityId, createdSessionId));
    await testDb.delete(cashSessions).where(eq(cashSessions.id, createdSessionId));
  }
  // `pgConn` es compartido por todos los specs del worker: no se cierra aqui.
});

test("un gerente anula una venta en efectivo desde la caja y queda refunded con audit_log", async ({ page }) => {
  test.setTimeout(90_000);
  await loginAs(page, SEED.adminNaco);

  // 1. Caja abierta (la abre el test si hace falta).
  await page.goto(`/sede/${SEED.naco}/register`);
  const openHeading = page.getByRole("heading", { name: "Abrir caja" });
  if (await openHeading.isVisible().catch(() => false)) {
    await page.getByLabel("Monto inicial en efectivo", { exact: true }).fill("2000");
    await page.getByRole("button", { name: "Abrir caja" }).click();
    await expect(page.getByRole("heading", { name: "Cerrar caja" })).toBeVisible({ timeout: 10_000 });
    createdSessionId = await findOpenSessionId();
  }
  await expect(page.getByRole("heading", { name: "Ventas de esta caja" })).toBeVisible();

  // 2. Cobrar una venta libre en efectivo.
  await page.goto(`/sede/${SEED.naco}/checkout`);
  await page.getByRole("button", { name: "Cliente nuevo" }).click();
  await page.getByLabel("Nombre completo", { exact: true }).fill(CLIENT_NAME);
  await page.getByLabel("Telefono", { exact: true }).fill(uniqueRdPhone());
  await page.getByRole("button", { name: /^Cobrar RD\$/ }).click();
  await expect(page.getByText("Cobro registrado.")).toBeVisible({ timeout: 10_000 });

  const [client] = await testDb
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.chainId, SEED_IDS.chainId), eq(clients.fullName, CLIENT_NAME)))
    .limit(1);
  expect(client).toBeTruthy();
  const [paidSale] = await testDb
    .select({ id: sales.id, status: sales.status, paymentMethod: sales.paymentMethod })
    .from(sales)
    .where(eq(sales.clientId, client!.id))
    .limit(1);
  expect(paidSale?.status).toBe("paid");
  expect(paidSale?.paymentMethod).toBe("cash");

  // 3. Anularla desde la lista de la caja.
  await page.goto(`/sede/${SEED.naco}/register`);
  await page.getByRole("button", { name: `Anular venta de ${CLIENT_NAME}` }).click();

  // Motivo obligatorio: sin motivo, el sheet lo pide y no anula.
  await page.getByRole("button", { name: "Anular venta", exact: true }).click();
  await expect(page.getByText("Escribe el motivo de la anulacion.", { exact: false })).toBeVisible();
  const [stillPaid] = await testDb
    .select({ status: sales.status })
    .from(sales)
    .where(eq(sales.id, paidSale!.id))
    .limit(1);
  expect(stillPaid?.status).toBe("paid");

  await page.getByLabel("Motivo de la anulacion (obligatorio)", { exact: true }).fill(REASON);
  await page.getByRole("button", { name: "Anular venta", exact: true }).click();

  // 4. Confirmacion sobria en pantalla y la fila queda marcada.
  await expect(page.getByRole("status")).toContainText(`Venta anulada: ${CLIENT_NAME}`, { timeout: 15_000 });
  await expect(page.getByRole("status")).toContainText("sale del efectivo esperado");
  await expect(page.getByRole("button", { name: `Anular venta de ${CLIENT_NAME}` })).toHaveCount(0);

  // 5. Verificacion contra la DB real.
  const [refunded] = await testDb
    .select({ status: sales.status })
    .from(sales)
    .where(eq(sales.id, paidSale!.id))
    .limit(1);
  expect(refunded?.status).toBe("refunded");

  const [audit] = await testDb
    .select({ before: auditLog.before, after: auditLog.after, actorUserId: auditLog.actorUserId })
    .from(auditLog)
    .where(and(eq(auditLog.entityId, paidSale!.id), eq(auditLog.action, "sale.refund")))
    .limit(1);
  expect(audit).toBeTruthy();
  expect((audit?.before as { status?: string } | null)?.status).toBe("paid");
  const after = audit?.after as { status?: string; reason?: string } | null;
  expect(after?.status).toBe("refunded");
  expect(after?.reason).toBe(REASON);
  expect(audit?.actorUserId).toBe(SEED_IDS.adminNacoId);

  // 6. F3-09: un barbero no ve la lista de ventas de la caja ni ningun boton "Anular" (D-F2-9 / matriz 6.2).
  await page.context().clearCookies();
  await loginAs(page, SEED.barbero1);
  await page.goto(`/sede/${SEED.naco}/register`);
  await expect(page.getByRole("heading", { name: "Caja", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ventas de esta caja" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Anular/ })).toHaveCount(0);
});
